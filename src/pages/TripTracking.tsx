import React from 'react';
import { ArrowLeft, Plus, MapPin, Loader2, Clock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet';
import MapComponent from '@/components/MapComponent';
import DriverCard from '@/components/passenger/DriverCard';
import SafetyButton from '@/components/passenger/SafetyButton';
import { toast } from '@/hooks/use-toast';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

/** Coerce API / socket payloads into { lat, lng } */
function normalizeDriverLocation(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat ?? o.latitude);
  const lng = Number(o.lng ?? o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

function driverTrackingId(driverField: unknown): string | null {
  if (!driverField) return null;
  if (typeof driverField === 'object' && (driverField as { _id?: unknown })._id != null) {
    return String((driverField as { _id: unknown })._id);
  }
  return String(driverField);
}

const TripTracking: React.FC = () => {
  const navigate = useNavigate();
  const { rideId } = useParams();
  const { t } = useTranslation();
  const [ride, setRide] = React.useState<any>(null);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const [driverLocation, setDriverLocation] = React.useState<{lat: number, lng: number} | null>(null);
  const socketRef = React.useRef<any>(null);
  const rideRef = React.useRef<any>(null);
  React.useEffect(() => {
    rideRef.current = ride;
  }, [ride]);

  // --- Mid-trip "Add stop" state ----------------------------------------
  // Sheet inputs, picked location, preview (km/min/fare delta), and remote calls.
  const [stopSheetOpen, setStopSheetOpen] = React.useState(false);
  const [stopSearchQuery, setStopSearchQuery] = React.useState('');
  const [stopSearchResults, setStopSearchResults] = React.useState<any[]>([]);
  const [stopSearchLoading, setStopSearchLoading] = React.useState(false);
  const [stopPicked, setStopPicked] = React.useState<{ name: string; lat: number; lng: number } | null>(null);
  const [stopPreview, setStopPreview] = React.useState<{ distKm: number; durMin: number; fare: number } | null>(null);
  const [stopRequesting, setStopRequesting] = React.useState(false);
  // Live tick for the pending-approval countdown.
  const [now, setNow] = React.useState<number>(Date.now());
  React.useEffect(() => {
    if (!ride?.pendingStopRequest?.expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ride?.pendingStopRequest?.expiresAt]);

  const isTerminalRideStatus = (status: string | undefined) =>
    status === 'completed' || status === 'cancelled';

  React.useEffect(() => {
    const fetchRide = async () => {
      try {
        const API_URL = getApiOrigin();
        const response = await fetch(`${API_URL}/api/rides/${rideId}`, {
          headers: {
            Authorization: `Bearer ${getAuthToken('passenger')}`,
          },
        });
        const data = await response.json();
        setRide(data);
        if (isTerminalRideStatus(data.status)) {
          setDriverLocation(null);
        } else {
          const fromRide = normalizeDriverLocation(data.driverId?.driverInfo?.currentLocation);
          if (fromRide) setDriverLocation(fromRide);
        }
      } catch (error) {
        console.error('Error fetching ride:', error);
      }
    };

    if (rideId) {
      fetchRide();
      const interval = setInterval(fetchRide, 5000); // refresh ride + driver snapshot while tracking

      // Setup WebSockets for real-time updates
      const API_URL = getApiOrigin();
      import('socket.io-client').then(({ io }) => {
        const socket = API_URL === '' ? io() : io(API_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('join_ride', rideId);
          const passenger = getUser('passenger');
          if (passenger?._id) {
            socket.emit('join_passenger_room', passenger._id);
          }
          setRide((currentRide) => {
            const did = driverTrackingId(currentRide?.driverId);
            if (did && !isTerminalRideStatus(currentRide?.status)) {
              socket.emit('join_driver_tracking', did);
            }
            return currentRide;
          });
        });

        socket.on('passenger_pickup_otp', (payload: { rideId: string; otp: string }) => {
          if (!payload?.rideId || String(payload.rideId) !== String(rideId)) return;
          setRide((prev: any) => (prev ? { ...prev, pickupOtp: payload.otp } : prev));
        });

        socket.on('ride_updated', (updatedRide: any) => {
          if (!updatedRide || String(updatedRide._id) !== String(rideId)) return;
          setRide((prev: any) => {
            const cleared = ['in_progress', 'completed', 'cancelled'].includes(updatedRide.status);
            if (cleared) return updatedRide;
            return {
              ...updatedRide,
              ...(prev?.pickupOtp && !updatedRide.pickupOtp
                ? { pickupOtp: prev.pickupOtp, pickupOtpExpiresAt: prev.pickupOtpExpiresAt }
                : {}),
            };
          });
          if (isTerminalRideStatus(updatedRide.status)) {
            setDriverLocation(null);
            return;
          }
          if (updatedRide.driverId?._id) {
            const did = driverTrackingId(updatedRide.driverId);
            if (did) socket.emit('join_driver_tracking', did);
          }
          const loc = normalizeDriverLocation(updatedRide.driverId?.driverInfo?.currentLocation);
          if (loc) setDriverLocation(loc);
        });

        socket.on('driver_location_update', ({ location }) => {
          if (isTerminalRideStatus(rideRef.current?.status)) return;
          const loc = normalizeDriverLocation(location);
          if (loc) setDriverLocation(loc);
        });

        // Multi-stop itinerary: driver accepted the requested stop. Server already
        // sent `ride_updated` with refreshed totals + stops[], so we just toast.
        socket.on('stop_added', (payload: any) => {
          if (!payload?.rideId || String(payload.rideId) !== String(rideId)) return;
          if (payload?.ride) {
            setRide((prev: any) => ({
              ...prev,
              ...payload.ride,
              ...(prev?.pickupOtp && !payload.ride.pickupOtp
                ? { pickupOtp: prev.pickupOtp, pickupOtpExpiresAt: prev.pickupOtpExpiresAt }
                : {})
            }));
          }
          toast({
            title: t('stop_added_title', 'Stop added'),
            description: t('stop_added_desc', 'Your driver accepted the new stop.')
          });
        });
        socket.on('stop_rejected', (payload: any) => {
          if (!payload?.rideId || String(payload.rideId) !== String(rideId)) return;
          setRide((prev: any) => (prev ? { ...prev, pendingStopRequest: null } : prev));
          if (payload?.reason === 'timeout') {
            toast({
              title: t('stop_rejected_title', 'Stop request declined'),
              description: t('stop_rejected_timeout', 'No response from the driver.'),
              variant: 'destructive'
            });
          } else if (payload?.reason !== 'passenger_cancelled') {
            toast({
              title: t('stop_rejected_title', 'Stop request declined'),
              description: t('stop_rejected_desc', 'Your driver declined the stop.'),
              variant: 'destructive'
            });
          }
        });
      });

      return () => {
        clearInterval(interval);
        if (socketRef.current) socketRef.current.disconnect();
      };
    }
  }, [rideId]);

  // Join tracking room if driver is assigned later (e.g. status changes to accepted)
  React.useEffect(() => {
    if (
      ride?.driverId &&
      socketRef.current?.connected &&
      !isTerminalRideStatus(ride.status)
    ) {
      const did = driverTrackingId(ride.driverId);
      if (did) socketRef.current.emit('join_driver_tracking', did);
    }
  }, [ride?.driverId, ride?.status]);

  // --- Mid-trip "Add stop" helpers --------------------------------------
  const stopsList = React.useMemo<any[]>(
    () => (Array.isArray(ride?.stops) ? ride.stops : []),
    [ride?.stops]
  );
  const midTripStopCount = React.useMemo(
    () => stopsList.filter((s: any) => s.source === 'mid_trip').length,
    [stopsList]
  );
  const remainingPendingStops = React.useMemo(
    () => stopsList.filter((s: any) => s.status !== 'visited'),
    [stopsList]
  );
  const pendingStop = ride?.pendingStopRequest;
  const pendingMsLeft =
    pendingStop?.expiresAt ? Math.max(0, new Date(pendingStop.expiresAt).getTime() - now) : 0;
  const pendingProgress =
    pendingStop?.requestedAt && pendingStop?.expiresAt
      ? Math.min(
          1,
          (now - new Date(pendingStop.requestedAt).getTime()) /
            (new Date(pendingStop.expiresAt).getTime() - new Date(pendingStop.requestedAt).getTime())
        )
      : 0;

  const canAddStop =
    ['accepted', 'arriving', 'in_progress'].includes(ride?.status) &&
    !pendingStop?.coordinates?.lat &&
    midTripStopCount < 3;

  const openAddStopSheet = () => {
    setStopPicked(null);
    setStopPreview(null);
    setStopSearchQuery('');
    setStopSearchResults([]);
    setStopSheetOpen(true);
  };

  const searchStopAddress = React.useCallback(async (query: string) => {
    setStopSearchQuery(query);
    if (query.length < 3) {
      setStopSearchResults([]);
      return;
    }
    setStopSearchLoading(true);
    try {
      const API_URL = getApiOrigin();
      const res = await fetch(
        `${API_URL}/api/geocode/search?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await res.json();
      setStopSearchResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Stop search failed:', e);
    } finally {
      setStopSearchLoading(false);
    }
  }, []);

  const previewStopRoute = React.useCallback(
    async (lat: number, lng: number) => {
      if (!ride?.pickupLocation?.coordinates || !ride?.dropoffLocation?.coordinates) return;
      try {
        const waypoints = [
          ride.pickupLocation.coordinates,
          ...remainingPendingStops.map((s: any) => s.coordinates),
          { lat, lng },
          ride.dropoffLocation.coordinates
        ];
        const coordStr = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false&alternatives=false&steps=false`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) return;
        const r = data.routes[0];
        const distKm = Math.round((r.distance / 1000) * 100) / 100;
        const durMin = Math.max(1, Math.round(r.duration / 60));
        const fare = Math.round(distKm * 15 + 20);
        const baseDist = ride?.distance?.value ?? 0;
        const baseDur = ride?.duration?.value ?? 0;
        const baseFare = ride?.fare?.estimated ?? Math.round(baseDist * 15 + 20);
        setStopPreview({
          distKm: Math.max(0, Math.round((distKm - baseDist) * 100) / 100),
          durMin: Math.max(0, durMin - baseDur),
          fare: Math.max(0, fare - baseFare)
        });
      } catch (e) {
        console.warn('Stop preview OSRM failed:', e);
      }
    },
    [ride, remainingPendingStops]
  );

  const onPickStopResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const parts = (result.display_name || '').split(',');
    const placeName = parts.slice(0, 2).join(',').trim() || 'Selected stop';
    setStopPicked({ name: placeName, lat, lng });
    setStopSearchResults([]);
    setStopSearchQuery(placeName);
    setStopPreview(null);
    void previewStopRoute(lat, lng);
  };

  const submitStopRequest = async () => {
    if (!stopPicked || !rideId) return;
    setStopRequesting(true);
    try {
      const API_URL = getApiOrigin();
      const res = await fetch(`${API_URL}/api/rides/${rideId}/request-stop`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken('passenger')}`
        },
        body: JSON.stringify({
          address: stopPicked.name,
          coordinates: { lat: stopPicked.lat, lng: stopPicked.lng }
        })
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.message || 'Failed to request stop');
      }
      const data = await res.json();
      setRide((prev: any) => (data?.ride ? { ...prev, ...data.ride } : prev));
      setStopSheetOpen(false);
      toast({
        title: t('request_stop_title', 'Stop requested'),
        description: t('waiting_driver_approval', 'Waiting for driver to accept...')
      });
    } catch (e: any) {
      toast({
        title: t('error', 'Error'),
        description: e?.message || 'Could not request stop',
        variant: 'destructive'
      });
    } finally {
      setStopRequesting(false);
    }
  };

  const cancelStopRequest = async () => {
    if (!rideId) return;
    try {
      const API_URL = getApiOrigin();
      await fetch(`${API_URL}/api/rides/${rideId}/reject-stop`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getAuthToken('passenger')}` }
      });
      setRide((prev: any) => (prev ? { ...prev, pendingStopRequest: null } : prev));
    } catch (e) {
      console.warn('Cancel stop request failed:', e);
    }
  };

  const handleCancelRide = async () => {
    if (!rideId) return;
    setIsCancelling(true);
    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('passenger')}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel ride');

      toast({
        title: t('trip_cancel_success_title'),
        description: t('trip_cancel_success_desc')
      });
      navigate('/passenger', { replace: true });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      toast({
        title: t('cancellation_failed_title'),
        description: t('cancellation_failed_desc'),
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const isScheduledRide = Boolean(ride?.isScheduled || ride?.scheduledFor);
  const isRideStarted = ride?.status === 'in_progress' || ride?.status === 'completed';
  const hideTrackingForScheduled = isScheduledRide && !isRideStarted;
  const scheduledAtMs = ride?.scheduledFor ? new Date(ride.scheduledFor).getTime() : null;
  const isScheduledPreStart = hideTrackingForScheduled && (scheduledAtMs === null || Date.now() < scheduledAtMs);

  React.useEffect(() => {
    if (!ride) return;
    if (hideTrackingForScheduled) {
      navigate('/passenger/prebookings', { replace: true });
    }
  }, [hideTrackingForScheduled, navigate, ride]);

  if (!ride) return <div>{t('detecting')}</div>;
  if (hideTrackingForScheduled) return null;

  // We use our local responsive state for driverLocation (hide live driver pin when trip ended)
  const normalizedLive = normalizeDriverLocation(driverLocation);
  const normalizedFromRide = normalizeDriverLocation(ride.driverId?.driverInfo?.currentLocation);
  const realDriverCoords = normalizedLive || normalizedFromRide;

  const provisionalDriverCoords =
    !realDriverCoords &&
    ride.driverId &&
    ['accepted', 'arriving'].includes(ride.status) &&
    ride.pickupLocation?.coordinates?.lat != null &&
    ride.pickupLocation?.coordinates?.lng != null
      ? {
          lat: ride.pickupLocation.coordinates.lat,
          lng: ride.pickupLocation.coordinates.lng
        }
      : null;

  const driverCoordsForMap =
    isScheduledPreStart || isTerminalRideStatus(ride.status)
      ? null
      : realDriverCoords || provisionalDriverCoords;

  const pickupCoord =
    ride.pickupLocation?.coordinates?.lat != null && ride.pickupLocation?.coordinates?.lng != null
      ? { lat: ride.pickupLocation.coordinates.lat, lng: ride.pickupLocation.coordinates.lng }
      : null;

  const etaToPickupMinutes =
    realDriverCoords && pickupCoord && ['accepted', 'arriving'].includes(ride.status)
      ? Math.max(1, Math.round((haversineKm(realDriverCoords, pickupCoord) / 22) * 60))
      : null;

  const fareDisplay =
    ride.fare?.final != null || ride.fare?.estimated != null
      ? `₹${ride.fare?.final ?? ride.fare?.estimated}`
      : '—';

  const scheduledTimeLabel = ride.scheduledFor
    ? new Date(ride.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 pt-safe-top">
        <div className="flex items-center h-16 px-4">
          <Button
            variant="icon"
            size="icon"
            onClick={() => navigate(isScheduledPreStart ? '/passenger/prebookings' : '/passenger')}
            className="bg-card/90 backdrop-blur shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Full screen map */}
      <div className="flex-1 relative min-h-[50vh] flex flex-col">
        <div className="absolute inset-0 z-0">
          {ride?.pickupLocation?.coordinates?.lat && ride?.dropoffLocation?.coordinates?.lat && (
            <MapComponent
              height="100%"
              className="w-full h-full"
              pickupPosition={[ride.pickupLocation.coordinates.lat, ride.pickupLocation.coordinates.lng]}
              dropoffPosition={[ride.dropoffLocation.coordinates.lat, ride.dropoffLocation.coordinates.lng]}
              pickupName={ride.pickupLocation.address}
              dropoffName={ride.dropoffLocation.address}
              driverPosition={
                driverCoordsForMap ? [driverCoordsForMap.lat, driverCoordsForMap.lng] : null
              }
              stops={stopsList.map((s: any) => ({
                address: s.address,
                coordinates: { lat: s.coordinates?.lat, lng: s.coordinates?.lng },
                status: s.status,
                source: s.source
              }))}
            />
          )}
        </div>

        {/* Top overlay with trip status */}
        <div className="absolute top-20 left-4 right-4 z-10">
          <div className="card-elevated p-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isScheduledPreStart
                    ? 'bg-primary'
                    : ride.status === 'completed'
                      ? 'bg-success'
                      : ride.status === 'cancelled'
                        ? 'bg-muted-foreground'
                        : 'bg-success animate-pulse'
                }`}
              />
              <div>
                <p className="font-semibold text-foreground">
                  {isScheduledPreStart
                    ? t('prebooking_confirmed_title')
                    : ride.status === 'cancelled'
                      ? t('trip_cancelled')
                      : ride.status === 'accepted'
                        ? (isScheduledRide ? t('ride_scheduled_header') : t('driver_arriving'))
                        : ride.status === 'in_progress'
                          ? t('trip_in_progress')
                          : ride.status === 'completed'
                            ? t('trip_completed')
                            : t('preparing_ride')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isScheduledPreStart
                    ? t('prebooking_confirmed_sub', { time: scheduledTimeLabel })
                    : ride.status === 'completed'
                      ? t('trip_completed_subtitle')
                      : ride.status === 'cancelled'
                        ? t('trip_cancelled_subtitle')
                        : isScheduledRide && ride.status === 'accepted'
                          ? (ride.scheduledFor
                              ? t('scheduled_for_time', {
                                  time: new Date(ride.scheduledFor).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }),
                                })
                              : t('waiting_scheduled_time'))
                          : t('tracking_live')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pickup OTP — passenger shares with driver to start trip */}
        {ride.pickupOtp && !isRideStarted && (
          <div className="absolute top-40 left-4 right-4 z-10">
            <div className="rounded-2xl border border-primary/25 bg-card/90 backdrop-blur-md p-4 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
                {t('pickup_otp_title')}
              </p>
              <p className="text-3xl font-black tracking-[0.35em] text-foreground text-center py-2 font-mono">
                {ride.pickupOtp}
              </p>
              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                {t('pickup_otp_subtitle')}
              </p>
              <p className="text-[11px] text-muted-foreground/90 text-center mt-2">{t('pickup_otp_hint')}</p>
            </div>
          </div>
        )}

        {/* Safety button — wire the live trip context so Share + SOS attach the real share-token URL */}
        <SafetyButton
          rideId={rideId}
          passengerName={ride.passengerId?.name}
          driverName={ride.driverId?.name}
          vehicleNumber={ride.driverId?.driverInfo?.vehicleNumber}
        />
      </div>

      {/* Bottom driver card */}
      <div className="bg-background rounded-t-3xl -mt-6 relative z-10 shadow-elevated pb-safe-bottom">
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto my-3" />

        <div className="px-4 pb-6 space-y-3">
          {/* Stop chip strip — shows the multi-stop itinerary as a horizontal
              scroll of "Stop N" pills. Visited stops fade. */}
          {stopsList.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {stopsList.map((s: any, idx: number) => {
                const visited = s.status === 'visited';
                return (
                  <div
                    key={`stop-chip-${idx}`}
                    className={`flex-shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md ${
                      visited
                        ? 'border-primary/15 bg-primary/5 text-muted-foreground'
                        : 'border-primary/25 bg-primary/10 text-foreground'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${
                        visited
                          ? 'bg-primary/30 text-primary-foreground/70 line-through'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold max-w-[40vw] truncate">
                      {s.address}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending stop request banner — replaces the "Add a stop" chip while
              we're waiting for the driver to accept. */}
          {pendingStop?.coordinates?.lat ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="hsl(45, 30%, 70%)"
                      strokeOpacity="0.4"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="hsl(45, 93%, 47%)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.max(0, (1 - pendingProgress) * 94.248)} 94.248`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-foreground">
                    {Math.ceil(pendingMsLeft / 1000)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">
                    {t('waiting_driver_approval', 'Waiting for driver to accept...')}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{pendingStop.address}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    +{pendingStop.distanceDeltaKm?.toFixed?.(1) ?? '0.0'} km · +
                    {pendingStop.durationDeltaMin ?? 0} min · +₹{pendingStop.fareDelta ?? 0}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 font-bold flex-shrink-0"
                  onClick={cancelStopRequest}
                >
                  {t('cancel_stop_request', 'Cancel')}
                </Button>
              </div>
            </div>
          ) : (
            canAddStop && (
              <button
                type="button"
                onClick={openAddStopSheet}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 backdrop-blur-md px-4 py-3 text-sm font-semibold text-foreground hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-4 h-4 text-primary" />
                <span>{t('add_a_stop', 'Add a stop')}</span>
                {midTripStopCount > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    {midTripStopCount}/3
                  </span>
                )}
              </button>
            )
          )}

          {ride.driverId ? (
            <div className="space-y-4">
              <DriverCard
                name={ride.driverId.name}
                rating={ride.driverId.driverInfo?.rating || 5.0}
                vehicleNumber={ride.driverId.driverInfo?.vehicleNumber || 'Unknown'}
                eta={
                  isScheduledPreStart
                    ? scheduledTimeLabel || '—'
                    : ride.status === 'completed'
                      ? fareDisplay
                      : ride.status === 'cancelled'
                        ? '—'
                        : etaToPickupMinutes != null
                          ? `~${etaToPickupMinutes} min`
                          : t('detecting')
                }
                bannerTitle={
                  isScheduledPreStart
                    ? 'Scheduled pickup'
                    : ride.status === 'completed'
                      ? t('fare')
                      : ride.status === 'cancelled'
                        ? t('trip_cancelled')
                        : undefined
                }
                bannerHint={
                  isScheduledPreStart
                    ? 'Live ETA appears when your pickup window starts'
                    : undefined
                }
                isTrusted={ride.driverId.driverInfo?.isTrusted || false}
                onCall={() => {
                  toast({ title: `Calling ${ride.driverId.name}...` });
                  window.location.href = `tel:${ride.driverId.phone}`;
                }}
                onMessage={() => toast({ title: "Opening chat..." })}
              />
              {(['scheduled', 'accepted', 'in_progress'].includes(ride.status)) && (
                <Button 
                  variant="outline" 
                  className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold h-12"
                  onClick={handleCancelRide}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Trip'}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-4">{t('waiting_driver')}</div>
              <Button 
                variant="outline" 
                className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold h-12"
                onClick={handleCancelRide}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Trip'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mid-trip add-stop sheet. Brand-primary glassmorphism throughout. */}
      <Sheet open={stopSheetOpen} onOpenChange={setStopSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-t border-primary/20 bg-background/95 backdrop-blur-xl max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t('add_a_stop', 'Add a stop')}</SheetTitle>
            <SheetDescription>
              {t('add_stop_desc', 'Pick a location and we will ask your driver to accept.')}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <input
                type="text"
                value={stopSearchQuery}
                onChange={(e) => void searchStopAddress(e.target.value)}
                placeholder={t('search_address', 'Search address')}
                className="w-full h-12 pl-4 pr-12 bg-background/60 backdrop-blur-md rounded-2xl border border-primary/15 focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
              {stopSearchLoading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
              )}
            </div>

            {stopSearchResults.length > 0 && (
              <div className="rounded-2xl border border-primary/15 bg-background/60 backdrop-blur-md overflow-hidden max-h-60 overflow-y-auto">
                {stopSearchResults.map((result, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onPickStopResult(result)}
                    className="w-full text-left p-3 hover:bg-primary/10 transition-colors border-b border-primary/10 last:border-0"
                  >
                    <p className="text-sm font-bold text-foreground truncate">
                      {(result.display_name || '').split(',')[0]}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(result.display_name || '').split(',').slice(1).join(',').trim()}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {stopPicked && (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 backdrop-blur-md p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{stopPicked.name}</p>
                  </div>
                </div>
                {stopPreview ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('distance_delta', '+Distance')}
                      </p>
                      <p className="text-sm font-black text-foreground">
                        +{stopPreview.distKm.toFixed(1)} km
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('duration_delta', '+Time')}
                      </p>
                      <p className="text-sm font-black text-foreground">
                        +{stopPreview.durMin} min
                      </p>
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-background/40 backdrop-blur p-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('fare_delta', '+Fare')}
                      </p>
                      <p className="text-sm font-black text-foreground">
                        +₹{stopPreview.fare}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{t('calculating', 'Calculating extra distance...')}</span>
                  </div>
                )}
              </div>
            )}

            <Button
              variant="touch"
              className="w-full"
              disabled={!stopPicked || stopRequesting}
              onClick={submitStopRequest}
            >
              {stopRequesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('please_wait', 'Please wait')}</span>
                </>
              ) : (
                <span>{t('request_stop_cta', 'Request stop')}</span>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TripTracking;
