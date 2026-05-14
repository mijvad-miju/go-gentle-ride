import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, CheckCircle2 } from 'lucide-react';
import Header from '@/components/common/Header';
import EarningsCard from '@/components/driver/EarningsCard';
import RideRequest from '@/components/driver/RideRequest';
import MapComponent from '@/components/MapComponent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { io } from 'socket.io-client';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const DriverDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [scheduledRides, setScheduledRides] = useState<any[]>([]);
  const [acceptedScheduledRides, setAcceptedScheduledRides] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'immediate' | 'scheduled'>('immediate');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [pickupOtpInput, setPickupOtpInput] = useState('');

  // Multi-stop itinerary state for the in-progress trip.
  // - `stopRequest`: pending mid-trip add-stop awaiting accept/decline.
  // - Live `now` tick drives the 30s auto-decline ring.
  const [stopRequest, setStopRequest] = useState<any>(null);
  const [stopActionLoading, setStopActionLoading] = useState<null | 'accept' | 'reject'>(null);
  const [stopVisitLoading, setStopVisitLoading] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  useEffect(() => {
    if (!stopRequest?.expiresAt) return;
    const id = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(id);
  }, [stopRequest?.expiresAt]);

  const currentRideRef = useRef<typeof currentRide>(null);
  const activeRideRef = useRef<typeof activeRide>(null);
  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);
  useEffect(() => {
    activeRideRef.current = activeRide;
  }, [activeRide]);

  const playDriverPing = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const rideIdsMatch = (a: unknown, b: unknown) =>
    String(a) === String(b);

  /**
   * Lady-safety: bidirectional compatibility predicate, mirroring backend rides.js.
   * Driver's `preferredPassengerGender` is always enforced; passenger's preference
   * only enforced when `genderFilterActive !== false`.
   */
  const isRideCompatibleForCurrentDriver = (ride: any): boolean => {
    const driver = getUser('driver');
    if (!driver) return true; // not logged in — back-end will guard.

    const dPref = (driver as any).preferredPassengerGender || 'any';
    const driverOk =
      dPref === 'any' ||
      !ride?.passengerGender ||
      dPref === ride.passengerGender;

    const passengerOk =
      ride?.genderFilterActive === false ||
      !ride?.preferredDriverGender ||
      ride.preferredDriverGender === 'any' ||
      !(driver as any).gender ||
      ride.preferredDriverGender === (driver as any).gender;

    return driverOk && passengerOk;
  };

  const isDriverAssignedToRide = (ride: { driverId?: unknown }, userId: string | undefined) => {
    if (!userId) return false;
    const d = ride?.driverId as { _id?: unknown } | string | null | undefined;
    if (d == null) return false;
    if (typeof d === 'object' && '_id' in d && d._id != null) {
      return String(d._id) === String(userId);
    }
    return String(d) === String(userId);
  };

  // Socket setup (stable connection — handlers use refs for latest ride state)
  useEffect(() => {
    const API_URL = getApiOrigin();
    const socket = API_URL === '' ? io() : io(API_URL);

    socket.on('connect', () => {
      console.log('Connected to socket server');
      socket.emit('join_driver_room');
      // Join the personal tracking room so the server can target stop_request
      // (and other one-to-one events) at this specific driver.
      const driver = getUser('driver');
      if (driver?._id) socket.emit('join_driver_tracking', driver._id);
    });

    socket.on('new_ride', (ride) => {
      if (!isRideCompatibleForCurrentDriver(ride)) {
        // Defence in depth: hide rides that don't match this driver's gender preference
        // (or whose passenger required a different driver gender). Server is the source
        // of truth via REST `/pending/available?driverId=...`.
        return;
      }
      if (!currentRideRef.current && !activeRideRef.current) {
        console.log('Received new_ride via socket:', ride);
        setCurrentRide(ride);
        playDriverPing();
        toast({
          title: 'New Ride Request!',
          description: `From: ${ride.pickupLocation.address}`,
        });
      }
    });

    socket.on('new_scheduled_ride', (ride) => {
      if (!isRideCompatibleForCurrentDriver(ride)) return;
      setScheduledRides((prev) => {
        const id = ride?._id;
        if (!id || prev.some((r) => rideIdsMatch(r._id, id))) return prev;
        return [...prev, ride].sort(
          (a, b) =>
            new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
        );
      });
      playDriverPing();
      toast({
        title: 'New scheduled pickup',
        description: `${new Date(ride.scheduledFor).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short',
        })} — ${ride.pickupLocation?.address ?? ''}`,
      });
      if (!currentRideRef.current) {
        setActiveTab('scheduled');
      }
    });

    socket.on('scheduled_ride_approaching', (approachingRide) => {
      const user = getUser('driver');
      if (user && isDriverAssignedToRide(approachingRide, user._id)) {
        toast({
          title: 'Scheduled ride soon',
          description: `Head to pickup: ${approachingRide.pickupLocation?.address ?? ''}`,
        });
        playDriverPing();
        setActiveTab('scheduled');
      }
    });

    socket.on('scheduled_ride_due', (dueRide) => {
      const user = getUser('driver');
      if (!user || !isDriverAssignedToRide(dueRide, user._id)) {
        return;
      }
      playDriverPing();
      toast({
        title: 'Pickup time — active ride',
        description: dueRide.pickupLocation?.address ?? 'Open your active ride',
      });
      setCurrentRide(null);
      setActiveRide(dueRide);
      setActiveTab('immediate');
      setAcceptedScheduledRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, dueRide._id)));
      setScheduledRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, dueRide._id)));
    });

    socket.on('scheduled_ride_accepted', (data) => {
      const rid = data?.rideId;
      if (!rid) return;
      setScheduledRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, rid)));
    });

    // Multi-stop itinerary: passenger asked to add a stop mid-trip.
    socket.on('stop_request', (payload: any) => {
      if (!payload?.rideId) return;
      const active = activeRideRef.current;
      if (!active || !rideIdsMatch(active._id, payload.rideId)) return;
      setStopRequest(payload.pendingStopRequest || null);
      playDriverPing();
    });
    // Server-confirmed stop addition (e.g. accept from this device, or sync from server).
    socket.on('stop_added', (payload: any) => {
      if (!payload?.rideId) return;
      const active = activeRideRef.current;
      if (!active || !rideIdsMatch(active._id, payload.rideId)) return;
      if (payload.ride) setActiveRide((prev: any) => ({ ...prev, ...payload.ride }));
      setStopRequest(null);
    });
    socket.on('stop_rejected', (payload: any) => {
      if (!payload?.rideId) return;
      const active = activeRideRef.current;
      if (!active || !rideIdsMatch(active._id, payload.rideId)) return;
      setStopRequest(null);
    });
    // Keep the active ride object fresh whenever the server emits ride_updated.
    socket.on('ride_updated', (updated: any) => {
      if (!updated?._id) return;
      const active = activeRideRef.current;
      if (active && rideIdsMatch(active._id, updated._id)) {
        setActiveRide((prev: any) => ({ ...prev, ...updated }));
      }
    });

    socket.on('ride_cancelled', (data: { rideId?: unknown }) => {
      const rid = data?.rideId;
      if (rid == null) return;

      const clearedActive =
        activeRideRef.current != null && rideIdsMatch(activeRideRef.current._id, rid);
      const clearedCurrent =
        currentRideRef.current != null && rideIdsMatch(currentRideRef.current._id, rid);

      if (clearedActive) setActiveRide(null);
      if (clearedCurrent) setCurrentRide(null);

      setScheduledRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, rid)));
      setAcceptedScheduledRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, rid)));

      if (clearedActive || clearedCurrent) {
        toast({
          title: 'Ride cancelled',
          description: 'The passenger cancelled this ride.',
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchScheduledRides = async () => {
    try {
      const API_URL = getApiOrigin();
      const driver = getUser('driver');
      const qs = driver?._id ? `?driverId=${encodeURIComponent(driver._id)}` : '';
      const response = await fetch(`${API_URL}/api/rides/scheduled/available${qs}`);
      const rides = await response.json();
      setScheduledRides(rides);
    } catch (error) {
      console.error('Error fetching scheduled rides:', error);
    }
  };

  const fetchAcceptedScheduledRides = async () => {
    try {
      const user = getUser('driver');
      if (!user?._id) return;

      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/user/${user._id}`);
      const rides = await response.json();

      const now = Date.now();
      const acceptedFutureRides = rides.filter((ride: any) =>
        ride?.isScheduled === true &&
        ['accepted', 'scheduled'].includes(ride?.status) &&
        isDriverAssignedToRide(ride, user._id) &&
        ride?.scheduledFor &&
        new Date(ride.scheduledFor).getTime() > now
      );

      setAcceptedScheduledRides(acceptedFutureRides);

      // Pickup time passed (e.g. reopened app) — enter same active-ride UI as an immediate accept.
      if (!activeRideRef.current && !currentRideRef.current) {
        const dueMine = rides
          .filter((ride: any) => {
            if (!ride?.isScheduled || !ride?.scheduledFor) return false;
            if (!['scheduled', 'accepted'].includes(ride?.status)) return false;
            if (['completed', 'cancelled'].includes(ride?.status)) return false;
            if (!isDriverAssignedToRide(ride, user._id)) return false;
            return new Date(ride.scheduledFor).getTime() <= now;
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
          );
        const next = dueMine[0];
        if (next) {
          setActiveRide(next);
          setActiveTab('immediate');
          setCurrentRide(null);
        }
      }
    } catch (error) {
      console.error('Error fetching accepted scheduled rides:', error);
    }
  };

  // Safety guard: never keep a future scheduled ride in active state.
  useEffect(() => {
    if (!activeRide?.isScheduled || !activeRide?.scheduledFor) return;

    const scheduledAt = new Date(activeRide.scheduledFor).getTime();
    if (Date.now() < scheduledAt) {
      setAcceptedScheduledRides(prev => {
        const withoutCurrent = prev.filter((r) => !rideIdsMatch(r._id, activeRide._id));
        return [...withoutCurrent, activeRide].sort(
          (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
        );
      });
      setActiveRide(null);
      setActiveTab('scheduled');
    }
  }, [activeRide]);

  // Always refresh scheduled / commitment lists (even while an immediate request is open)
  useEffect(() => {
    fetchScheduledRides();
    fetchAcceptedScheduledRides();
    const id = setInterval(() => {
      fetchScheduledRides();
      fetchAcceptedScheduledRides();
    }, 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (!currentRide && !activeRide) {
      const fetchPendingRides = async () => {
        try {
          const API_URL = getApiOrigin();
          const driver = getUser('driver');
          const qs = driver?._id ? `?driverId=${encodeURIComponent(driver._id)}` : '';
          const response = await fetch(`${API_URL}/api/rides/pending/available${qs}`);
          const rides = await response.json();

          if (rides.length > 0 && !currentRideRef.current && !activeRideRef.current) {
            setCurrentRide(rides[0]);
          }
        } catch (error) {
          console.error('Error fetching pending rides:', error);
        }
      };

      fetchPendingRides();
      interval = setInterval(fetchPendingRides, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentRide, activeRide]);

  useEffect(() => {
    if (!activeRide?._id) setPickupOtpInput('');
  }, [activeRide?._id]);

  // Join the active ride's socket room so we get ride_updated / stop_added events.
  const ridesSocketRef = useRef<any>(null);
  useEffect(() => {
    if (!activeRide?._id) return;
    const API_URL = getApiOrigin();
    const sock = ridesSocketRef.current ?? (API_URL === '' ? io() : io(API_URL));
    ridesSocketRef.current = sock;
    sock.on('connect', () => {
      sock.emit('join_ride', activeRide._id);
    });
    if (sock.connected) sock.emit('join_ride', activeRide._id);
    sock.on('ride_updated', (updated: any) => {
      if (updated?._id && rideIdsMatch(updated._id, activeRide._id)) {
        setActiveRide((prev: any) => ({ ...prev, ...updated }));
      }
    });
    sock.on('stop_added', (payload: any) => {
      if (payload?.ride?._id && rideIdsMatch(payload.ride._id, activeRide._id)) {
        setActiveRide((prev: any) => ({ ...prev, ...payload.ride }));
        setStopRequest(null);
      }
    });
    return () => {
      try {
        sock.off('ride_updated');
        sock.off('stop_added');
      } catch {
        /* ignore */
      }
    };
  }, [activeRide?._id]);
  useEffect(() => {
    return () => {
      try {
        ridesSocketRef.current?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Real-time location tracking
  useEffect(() => {
    let watchId: number;

    const updateLocation = async (lat: number, lng: number) => {
      setCurrentLocation([lat, lng]);

      try {
        const API_URL = getApiOrigin();
        const user = getUser('driver');

        if (!user?._id) return;

        // Stream location to backend
        fetch(`${API_URL}/api/users/drivers/${user._id}/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken('driver')}`
          },
          body: JSON.stringify({
            currentLocation: { lat, lng }
          })
        }).catch(err => console.error('Error streaming location:', err));
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };

    if (navigator.geolocation) {
      // Stage 1 — cached fix (up to 5 min) so the map shows roughly the right
      // area immediately while stage 2 upgrades to a fresh high-accuracy fix.
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[geo:driver] cached fix', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy
          });
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        () => {
          // ignore — stage 2 will retry
        },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 }
      );

      // Stage 2 — fresh high-accuracy fix. 5-second timeout was way too short
      // for a high-accuracy fix; bump to 20s to avoid bouncing back to a
      // stale/wrong location.
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('[geo:driver] currentPosition', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy
          });
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('Immediate geolocation error:', error);
          // Don't fall back to a hardcoded city — a wrong location will mislead
          // the passenger's tracking screen. Stage 1 cached fix (if any) is the
          // best we have until the watcher succeeds.
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );

      // Continuous watcher. 5s timeout caused fixes to be dropped on weak GPS,
      // which froze the driver pin on the cached/default location.
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => console.error('Geolocation watch error:', error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleAcceptRide = async (rideToAccept?: any) => {
    const ride = rideToAccept || currentRide;
    if (!ride) return;

    try {
      const API_URL = getApiOrigin();
      const user = getUser('driver');
      if (!user?._id) return;

      const response = await fetch(`${API_URL}/api/rides/${ride._id}/accept`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('driver')}`
        },
        body: JSON.stringify({
          driverId: user._id
        })
      });

      if (!response.ok) throw new Error('Failed to accept ride');

      const updatedRide = await response.json();
      
      if (ride.isScheduled) {
        toast({
          title: "Scheduled Ride Accepted!",
          description: `Be ready for pickup at ${new Date(ride.scheduledFor).toLocaleTimeString()}`,
        });
        setAcceptedScheduledRides(prev => {
          const withoutCurrent = prev.filter(r => r._id !== updatedRide._id);
          return [...withoutCurrent, updatedRide].sort(
            (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
          );
        });
        // Remove from list
        setScheduledRides(prev => prev.filter(r => r._id !== ride._id));
      } else {
        setActiveRide(updatedRide);
        setCurrentRide(null);
        toast({
          title: "Ride Accepted!",
          description: "Navigate to pickup location.",
        });
      }
    } catch (error) {
      console.error('Error accepting ride:', error);
      toast({
        title: "Error",
        description: "Could not accept ride.",
        variant: "destructive"
      });
    }
  };

  const handleDeclineRide = () => {
    setCurrentRide(null);
    toast({
      title: "Ride Declined",
      description: "Waiting for new requests...",
    });
  };

  // --- Multi-stop itinerary handlers ----------------------------------------
  const handleAcceptStop = async () => {
    if (!activeRide?._id) return;
    setStopActionLoading('accept');
    try {
      const API_URL = getApiOrigin();
      const res = await fetch(`${API_URL}/api/rides/${activeRide._id}/accept-stop`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getAuthToken('driver')}` }
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message || 'Failed to accept stop');
      }
      const data = await res.json();
      if (data?.ride) setActiveRide((prev: any) => ({ ...prev, ...data.ride }));
      setStopRequest(null);
      toast({ title: t('accept_stop', 'Accept stop'), description: t('stop_added_desc', 'Stop added to your route.') });
    } catch (e: any) {
      toast({ title: t('error', 'Error'), description: e?.message || 'Could not accept', variant: 'destructive' });
    } finally {
      setStopActionLoading(null);
    }
  };

  const handleRejectStop = async (silent = false) => {
    if (!activeRide?._id) return;
    setStopActionLoading('reject');
    try {
      const API_URL = getApiOrigin();
      await fetch(`${API_URL}/api/rides/${activeRide._id}/reject-stop`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getAuthToken('driver')}` }
      });
      setStopRequest(null);
      if (!silent) {
        toast({ title: t('decline_stop', 'Decline stop'), description: t('stop_rejected_desc', 'You declined the stop.') });
      }
    } catch (e) {
      console.warn('Reject stop failed:', e);
    } finally {
      setStopActionLoading(null);
    }
  };

  // Auto-reject the pending stop when the 30s countdown reaches 0.
  useEffect(() => {
    if (!stopRequest?.expiresAt) return;
    const ms = new Date(stopRequest.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      void handleRejectStop(true);
      return;
    }
    const id = setTimeout(() => void handleRejectStop(true), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopRequest?.expiresAt]);

  const handleMarkStopVisited = async (index: number) => {
    if (!activeRide?._id) return;
    setStopVisitLoading(index);
    try {
      const API_URL = getApiOrigin();
      const res = await fetch(`${API_URL}/api/rides/${activeRide._id}/stops/${index}/visit`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken('driver')}`
        },
        body: JSON.stringify({
          location: currentLocation
            ? { lat: currentLocation[0], lng: currentLocation[1] }
            : null
        })
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        // "not at stop yet" — let the driver force from the UI confirmation toast.
        if (res.status === 400 && detail?.message?.includes('not at this stop')) {
          const ok = window.confirm(t('confirm_force_visit', 'You are not within 80m of this stop. Mark visited anyway?'));
          if (!ok) return;
          const force = await fetch(
            `${API_URL}/api/rides/${activeRide._id}/stops/${index}/visit?force=1`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${getAuthToken('driver')}` }
            }
          );
          if (!force.ok) throw new Error('Could not mark visited');
          const fd = await force.json();
          if (fd?.ride) setActiveRide((prev: any) => ({ ...prev, ...fd.ride }));
          return;
        }
        throw new Error(detail?.message || 'Could not mark visited');
      }
      const data = await res.json();
      if (data?.ride) setActiveRide((prev: any) => ({ ...prev, ...data.ride }));
    } catch (e: any) {
      toast({ title: t('error', 'Error'), description: e?.message || 'Could not mark visited', variant: 'destructive' });
    } finally {
      setStopVisitLoading(null);
    }
  };

  const handleStartRide = async () => {
    if (!activeRide) return;

    if (activeRide.isScheduled && activeRide.scheduledFor) {
      const scheduledAt = new Date(activeRide.scheduledFor).getTime();
      if (Date.now() < scheduledAt) {
        toast({
          title: "Too early to start",
          description: `Pickup is scheduled for ${new Date(activeRide.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (!['accepted', 'arriving'].includes(activeRide.status)) {
      toast({
        title: "Cannot start",
        description: "This ride is not ready to start.",
        variant: "destructive",
      });
      return;
    }

    if (pickupOtpInput.trim().length !== 4) {
      toast({
        title: "OTP required",
        description: "Ask the passenger for the 4-digit code from their app.",
        variant: "destructive",
      });
      return;
    }

    try {
      const API_URL = getApiOrigin();
      const user = getUser('driver');
      if (!user?._id) return;

      const response = await fetch(`${API_URL}/api/rides/${activeRide._id}/start`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken('driver')}`,
        },
        body: JSON.stringify({ driverId: user._id, otp: pickupOtpInput.trim() }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to start ride');
      }

      const updatedRide = await response.json();
      setActiveRide(updatedRide);
      setPickupOtpInput('');
      toast({
        title: "Trip started",
        description: "Head to the drop-off. End the ride when you arrive.",
      });
    } catch (error: unknown) {
      console.error('Error starting ride:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not start ride.",
        variant: "destructive",
      });
    }
  };

  const handleCompleteRide = async () => {
    if (!activeRide) return;

    if (activeRide.isScheduled && activeRide.scheduledFor) {
      const scheduledAt = new Date(activeRide.scheduledFor).getTime();
      if (Date.now() < scheduledAt) {
        toast({
          title: "Too early to complete",
          description: `This scheduled ride starts at ${new Date(activeRide.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          variant: "destructive"
        });
        return;
      }
    }

    if (activeRide.status !== 'in_progress') {
      toast({
        title: "Start the trip first",
        description: "Tap “Start ride” after the passenger has boarded.",
        variant: "destructive",
      });
      return;
    }

    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${activeRide._id}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('driver')}`
        },
        body: JSON.stringify({
          finalFare: activeRide.fare.estimated
        })
      });

      if (!response.ok) throw new Error('Failed to complete ride');

      setActiveRide(null);
      toast({
        title: "Ride Completed!",
        description: "Great job! You're ready for the next one.",
      });
    } catch (error) {
      console.error('Error completing ride:', error);
      toast({
        title: "Error",
        description: "Could not complete ride.",
        variant: "destructive"
      });
    }
  };

  const handleCancelActiveRide = async () => {
    if (!activeRide) return;
    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${activeRide._id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('driver')}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel ride');

      setActiveRide(null);
      toast({
        title: "Ride Cancelled",
        description: "You have cancelled this ride."
      });
    } catch (error) {
      console.error('Error cancelling active ride:', error);
      toast({
        title: "Error",
        description: "Could not cancel this ride.",
        variant: "destructive"
      });
    }
  };

  const handleCancelScheduledCommitment = async (rideId: string) => {
    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('driver')}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel scheduled ride');

      setAcceptedScheduledRides(prev => prev.filter(r => r._id !== rideId));
      toast({
        title: "Scheduled Ride Cancelled",
        description: "This future commitment has been cancelled."
      });
    } catch (error) {
      console.error('Error cancelling scheduled commitment:', error);
      toast({
        title: "Error",
        description: "Could not cancel this scheduled ride.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="Driver Dashboard"
        showMenu={true}
      />

      {/* Driver is always online */}
      <div className="w-full px-4 mt-4 h-64 flex-shrink-0">
        <div className="w-full h-full rounded-2xl overflow-hidden shadow-md border border-border/50 relative">
          <MapComponent
            height="100%"
            className="w-full h-full"
            driverPosition={currentLocation}
            pickupPosition={activeRide ? [activeRide.pickupLocation.coordinates.lat, activeRide.pickupLocation.coordinates.lng] : null}
            dropoffPosition={activeRide ? [activeRide.dropoffLocation.coordinates.lat, activeRide.dropoffLocation.coordinates.lng] : null}
            userPosition={currentLocation}
            stops={
              Array.isArray(activeRide?.stops)
                ? activeRide.stops.map((s: any) => ({
                    address: s.address,
                    coordinates: { lat: s.coordinates?.lat, lng: s.coordinates?.lng },
                    status: s.status,
                    source: s.source
                  }))
                : undefined
            }
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-4 mt-4 relative z-10 pb-24 space-y-4">

        {/* Navigation Tabs (Immediate / Scheduled) */}
        {!activeRide && (
          <div className="flex bg-muted p-1 rounded-xl mb-4 text-sm font-medium">
            <button
              className={`flex-1 py-3 rounded-lg transition-colors ${activeTab === 'immediate' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab('immediate')}
            >
              Immediate ({currentRide ? 1 : 0})
            </button>
            <button
              className={`flex-1 py-3 rounded-lg transition-colors ${activeTab === 'scheduled' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab('scheduled')}
            >
              Scheduled ({scheduledRides.length + acceptedScheduledRides.length})
            </button>
          </div>
        )}

        {/* Active Ride View */}
        {activeRide && (
          <div className="card-elevated p-6 animate-scale-in">
            <h3 className="font-bold text-lg mb-4">Active Ride</h3>
            {activeRide.isScheduled && activeRide.scheduledFor && (
              <p className="text-sm text-muted-foreground mb-4">
                Scheduled for {new Date(activeRide.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 bg-success rounded-full" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Pickup</p>
                  <p className="text-sm font-semibold">{activeRide.pickupLocation.address}</p>
                </div>
              </div>

              {/* Itinerary stops list. The next pending stop gets a "Mark visited"
                  glass button; geofence enforced by the backend (~80m). */}
              {Array.isArray(activeRide.stops) && activeRide.stops.length > 0 && (
                <div className="space-y-2">
                  {activeRide.stops.map((s: any, idx: number) => {
                    const visited = s.status === 'visited';
                    const firstPending =
                      !visited &&
                      activeRide.stops.findIndex((x: any) => x.status !== 'visited') === idx;
                    const nearby =
                      firstPending && currentLocation && s.coordinates
                        ? haversineMeters(
                            { lat: currentLocation[0], lng: currentLocation[1] },
                            { lat: s.coordinates.lat, lng: s.coordinates.lng }
                          ) <= 80
                        : false;
                    return (
                      <div
                        key={`drv-stop-${idx}`}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 backdrop-blur-md ${
                          visited
                            ? 'border-primary/15 bg-primary/5'
                            : firstPending
                            ? 'border-primary/30 bg-primary/10'
                            : 'border-primary/20 bg-primary/5'
                        }`}
                      >
                        <div
                          className={`flex-shrink-0 w-7 h-7 rounded-full font-black text-xs flex items-center justify-center ${
                            visited
                              ? 'bg-primary/30 text-primary-foreground/70 line-through'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          {firstPending && (
                            <p className="text-[10px] uppercase tracking-wider font-bold text-primary">
                              {t('next_stop', 'Next stop')}
                            </p>
                          )}
                          <p
                            className={`text-sm font-semibold truncate ${
                              visited ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}
                          >
                            {s.address}
                          </p>
                        </div>
                        {firstPending && (
                          <Button
                            variant="touch"
                            size="sm"
                            className="h-9 px-3 text-xs font-bold flex-shrink-0"
                            disabled={stopVisitLoading === idx || !nearby}
                            onClick={() => handleMarkStopVisited(idx)}
                            title={!nearby ? t('move_closer_hint', 'Move within 80m of the stop') : undefined}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('mark_visited', 'Mark visited')}</span>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 bg-secondary rounded-full" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Dropoff</p>
                  <p className="text-sm font-semibold">{activeRide.dropoffLocation.address}</p>
                </div>
              </div>
            </div>
            {(() => {
              const pickupWindowOk =
                !activeRide.isScheduled ||
                (activeRide.scheduledFor &&
                  Date.now() >= new Date(activeRide.scheduledFor).getTime());
              const showStart =
                pickupWindowOk && ['accepted', 'arriving'].includes(activeRide.status);
              if (!showStart) return null;
              return (
                <div className="space-y-2 mb-4">
                  <label htmlFor="pickup-otp" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Passenger OTP
                  </label>
                  <Input
                    id="pickup-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    placeholder="••••"
                    value={pickupOtpInput}
                    onChange={(e) => setPickupOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="h-12 text-center text-xl font-mono tracking-[0.4em] bg-background/80 border-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ask the rider for the code in their app (we also send it by SMS).
                  </p>
                </div>
              );
            })()}
            <div className="space-y-3">
              {(() => {
                const pickupWindowOk =
                  !activeRide.isScheduled ||
                  (activeRide.scheduledFor &&
                    Date.now() >= new Date(activeRide.scheduledFor).getTime());
                const showStart =
                  pickupWindowOk && ['accepted', 'arriving'].includes(activeRide.status);
                const showComplete = pickupWindowOk && activeRide.status === 'in_progress';
                return (
                  <>
                    {showStart && (
                      <Button
                        onClick={handleStartRide}
                        className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground shadow-md"
                      >
                        Start ride
                      </Button>
                    )}
                    {showComplete && (
                      <Button onClick={handleCompleteRide} className="w-full h-14 text-lg font-bold">
                        Complete ride
                      </Button>
                    )}
                  </>
                );
              })()}
              <Button
                onClick={handleCancelActiveRide}
                variant="outline"
                className="w-full h-12 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold"
              >
                Cancel Ride
              </Button>
            </div>
          </div>
        )}

        {/* Ride request overlay (Immediate) */}
        {activeTab === 'immediate' && currentRide && !activeRide && (
          <RideRequest
            pickup={currentRide.pickupLocation?.address || "Unknown Location"}
            dropoff={currentRide.dropoffLocation?.address || "Unknown Destination"}
            fare={currentRide.fare?.estimated || 0}
            distance="3.5 km"
            duration="10 min"
            expiresIn={300}
            onAccept={() => handleAcceptRide()}
            onDecline={handleDeclineRide}
          />
        )}

        {/* Scheduled Rides List */}
        {activeTab === 'scheduled' && !activeRide && (
          <div className="space-y-4">
            {acceptedScheduledRides.length > 0 && (
              <div className="space-y-3">
                {acceptedScheduledRides
                  .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
                  .map(ride => (
                    <div key={ride._id} className="card-elevated p-4 animate-in slide-in-from-bottom-2">
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-primary/10 text-primary uppercase text-xs font-bold px-2 py-1 rounded">
                          Accepted: {new Date(ride.scheduledFor).toLocaleDateString()} at {new Date(ride.scheduledFor).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <span className="font-bold text-lg">₹{ride.fare.estimated}</span>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-success rounded-full" />
                          <p className="text-sm line-clamp-1">{ride.pickupLocation.address}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-secondary rounded-full" />
                          <p className="text-sm line-clamp-1">{ride.dropoffLocation.address}</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleCancelScheduledCommitment(ride._id)}
                        variant="outline"
                        className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold"
                      >
                        Cancel Ride
                      </Button>
                    </div>
                  ))}
              </div>
            )}
            {scheduledRides.length === 0 && acceptedScheduledRides.length === 0 ? (
              <div className="card-elevated p-6 text-center">
                <p className="text-muted-foreground">No upcoming scheduled rides in your area.</p>
              </div>
            ) : (
              scheduledRides.map(ride => (
                <div key={ride._id} className="card-elevated p-4 animate-in slide-in-from-bottom-2">
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-primary/10 text-primary uppercase text-xs font-bold px-2 py-1 rounded">
                      {new Date(ride.scheduledFor).toLocaleDateString()} at {new Date(ride.scheduledFor).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                    <span className="font-bold text-lg">₹{ride.fare.estimated}</span>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-success rounded-full" />
                      <p className="text-sm line-clamp-1">{ride.pickupLocation.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-secondary rounded-full" />
                      <p className="text-sm line-clamp-1">{ride.dropoffLocation.address}</p>
                    </div>
                  </div>
                  <Button onClick={() => handleAcceptRide(ride)} className="w-full font-bold">
                    Accept Scheduled Ride
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Earnings card */}
        {!currentRide && activeTab === 'immediate' && (
          <EarningsCard
            todayEarnings={0} // Should fetch real stats
            weeklyEarnings={0}
            tripsToday={0}
            tripsWeek={0}
          />
        )}

        {activeTab === 'immediate' && !currentRide && (
          <div className="card-elevated p-6 text-center">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <div className="w-4 h-4 bg-success rounded-full animate-pulse" />
            </div>
            <p className="font-semibold text-foreground">Waiting for requests...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Stay in a busy area for more rides
            </p>
          </div>
        )}
      </div>

      {/* Mid-trip add-stop incoming request. Non-dismissible (no outside-click close)
          with a 30s auto-decline ring. */}
      <Sheet
        open={!!stopRequest?.coordinates?.lat && !!activeRide}
        onOpenChange={(open) => {
          if (!open) {
            // User tried to dismiss — that's a decline.
            void handleRejectStop(false);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-primary/25 bg-background/95 backdrop-blur-xl max-h-[80vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{t('driver_stop_request_title', 'Passenger wants to add a stop')}</SheetTitle>
            <SheetDescription>
              {t('driver_stop_request_desc', 'Accept to update your route and fare.')}
            </SheetDescription>
          </SheetHeader>

          {stopRequest && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-primary/25 bg-primary/5 backdrop-blur-md p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-foreground">{stopRequest.address}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('distance_delta', '+Distance')}
                    </p>
                    <p className="text-sm font-black text-foreground">
                      +{Number(stopRequest.distanceDeltaKm || 0).toFixed(1)} km
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('duration_delta', '+Time')}
                    </p>
                    <p className="text-sm font-black text-foreground">
                      +{stopRequest.durationDeltaMin || 0} min
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('fare_delta', '+Fare')}
                    </p>
                    <p className="text-sm font-black text-foreground">
                      +₹{stopRequest.fareDelta || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Countdown ring + accept/decline buttons. Auto-rejects on 0. */}
              {(() => {
                const expiresMs = stopRequest.expiresAt
                  ? new Date(stopRequest.expiresAt).getTime()
                  : 0;
                const requestedMs = stopRequest.requestedAt
                  ? new Date(stopRequest.requestedAt).getTime()
                  : 0;
                const remaining = Math.max(0, expiresMs - nowTs);
                const ttlMs = Math.max(1, expiresMs - requestedMs);
                const frac = Math.min(1, 1 - remaining / ttlMs);
                const dash = Math.max(0, (1 - frac) * 138.23);
                const seconds = Math.ceil(remaining / 1000);
                return (
                  <div className="flex items-center gap-3">
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <svg viewBox="0 0 50 50" className="w-14 h-14 -rotate-90">
                        <circle
                          cx="25"
                          cy="25"
                          r="22"
                          fill="none"
                          stroke="hsl(0, 70%, 50%)"
                          strokeOpacity="0.25"
                          strokeWidth="4"
                        />
                        <circle
                          cx="25"
                          cy="25"
                          r="22"
                          fill="none"
                          stroke="hsl(0, 70%, 50%)"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${dash} 138.23`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-destructive">
                        {seconds}
                      </span>
                    </div>
                    <p className="flex-1 text-xs text-muted-foreground">
                      {t('auto_decline_in', { seconds, defaultValue: `Auto-decline in ${seconds}s` })}
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold"
                  disabled={stopActionLoading !== null}
                  onClick={() => handleRejectStop()}
                >
                  {t('decline_stop', 'Decline')}
                </Button>
                <Button
                  variant="touch"
                  className="h-12 font-bold"
                  disabled={stopActionLoading !== null}
                  onClick={handleAcceptStop}
                >
                  {t('accept_stop', 'Accept')}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default DriverDashboard;
