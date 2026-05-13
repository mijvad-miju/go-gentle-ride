import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/common/Header';
import EarningsCard from '@/components/driver/EarningsCard';
import RideRequest from '@/components/driver/RideRequest';
import MapComponent from '@/components/MapComponent';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { io } from 'socket.io-client';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

const DriverDashboard: React.FC = () => {
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [scheduledRides, setScheduledRides] = useState<any[]>([]);
  const [acceptedScheduledRides, setAcceptedScheduledRides] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'immediate' | 'scheduled'>('immediate');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);

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
    });

    socket.on('new_ride', (ride) => {
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

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchScheduledRides = async () => {
    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/scheduled/available`);
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
          const response = await fetch(`${API_URL}/api/rides/pending/available`);
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
      // Fetch location immediately once for instant UI update
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => console.error('Immediate geolocation error:', error),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );

      // Then bind watcher for continuous updates
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => console.error('Geolocation watch error:', error),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
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
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 mt-2 bg-secondary rounded-full" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Dropoff</p>
                  <p className="text-sm font-semibold">{activeRide.dropoffLocation.address}</p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {(!activeRide.isScheduled || (activeRide.scheduledFor && Date.now() >= new Date(activeRide.scheduledFor).getTime())) && (
                <Button onClick={handleCompleteRide} className="w-full h-14 text-lg font-bold">
                  Complete Ride
                </Button>
              )}
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
    </div>
  );
};

export default DriverDashboard;
