import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import MapComponent from '@/components/MapComponent';
import DriverCard from '@/components/passenger/DriverCard';
import SafetyButton from '@/components/passenger/SafetyButton';
import { toast } from '@/hooks/use-toast';
import { getAuthToken } from '@/lib/auth';
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

  const isTerminalRideStatus = (status: string | undefined) =>
    status === 'completed' || status === 'cancelled';

  React.useEffect(() => {
    const fetchRide = async () => {
      try {
        const API_URL = getApiOrigin();
        const response = await fetch(`${API_URL}/api/rides/${rideId}`);
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
          setRide((currentRide) => {
            const did = driverTrackingId(currentRide?.driverId);
            if (did && !isTerminalRideStatus(currentRide?.status)) {
              socket.emit('join_driver_tracking', did);
            }
            return currentRide;
          });
        });

        socket.on('ride_updated', (updatedRide) => {
          setRide(updatedRide);
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

  const handleEmergencyCall = () => {
    toast({
      title: t('trip_emergency_call_title'),
      description: t('trip_emergency_call_desc'),
      variant: "destructive",
    });
  };

  const handleShareTrip = () => {
    toast({
      title: t('trip_shared_title'),
      description: t('trip_shared_desc'),
    });
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

        {/* Safety button */}
        <SafetyButton
          onEmergencyCall={handleEmergencyCall}
          onShareTrip={handleShareTrip}
        />
      </div>

      {/* Bottom driver card */}
      <div className="bg-background rounded-t-3xl -mt-6 relative z-10 shadow-elevated pb-safe-bottom">
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto my-3" />

        <div className="px-4 pb-6">
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
    </div>
  );
};

export default TripTracking;
