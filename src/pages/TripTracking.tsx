import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import MapComponent from '@/components/MapComponent';
import DriverCard from '@/components/passenger/DriverCard';
import SafetyButton from '@/components/passenger/SafetyButton';
import { toast } from '@/hooks/use-toast';

const TripTracking: React.FC = () => {
  const navigate = useNavigate();
  const { rideId } = useParams();
  const { t } = useTranslation();
  const [ride, setRide] = React.useState<any>(null);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const [driverLocation, setDriverLocation] = React.useState<{lat: number, lng: number} | null>(null);
  const socketRef = React.useRef<any>(null);

  React.useEffect(() => {
    const fetchRide = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${API_URL}/api/rides/${rideId}`);
        const data = await response.json();
        setRide(data);
        if (data.driverId?.driverInfo?.currentLocation) {
          setDriverLocation(data.driverId.driverInfo.currentLocation);
        }
      } catch (error) {
        console.error('Error fetching ride:', error);
      }
    };

    if (rideId) {
      fetchRide();
      const interval = setInterval(fetchRide, 15000); // Poll as a slow fallback

      // Setup WebSockets for real-time updates
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      import('socket.io-client').then(({ io }) => {
        const socket = io(API_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('join_ride', rideId);
          // If we already know the driver, join their tracking room immediately
          setRide(currentRide => {
            if (currentRide?.driverId?._id) {
              socket.emit('join_driver_tracking', currentRide.driverId._id);
            }
            return currentRide;
          });
        });

        socket.on('ride_updated', (updatedRide) => {
          setRide(updatedRide);
          if (updatedRide.driverId?._id) {
            socket.emit('join_driver_tracking', updatedRide.driverId._id);
          }
          if (updatedRide.driverId?.driverInfo?.currentLocation) {
            setDriverLocation(updatedRide.driverId.driverInfo.currentLocation);
          }
        });

        socket.on('driver_location_update', ({ location }) => {
          setDriverLocation(location);
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
    if (ride?.driverId?._id && socketRef.current?.connected) {
      socketRef.current.emit('join_driver_tracking', ride.driverId._id);
    }
  }, [ride?.driverId?._id]);

  const handleEmergencyCall = () => {
    toast({
      title: "Emergency Call",
      description: "Calling emergency services (112)...",
      variant: "destructive",
    });
  };

  const handleShareTrip = () => {
    toast({
      title: "Trip Shared",
      description: "Trip details sent to your emergency contacts",
    });
  };

  const handleCancelRide = async () => {
    if (!rideId) return;
    setIsCancelling(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel ride');

      toast({
        title: "Ride Cancelled",
        description: "Your trip has been successfully cancelled."
      });
      navigate('/passenger', { replace: true });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      toast({
        title: "Cancellation Failed",
        description: "Could not cancel the ride. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (!ride) return <div>{t('detecting')}</div>;

  // We use our local responsive state for driverLocation
  const driverPos = driverLocation || ride.driverId?.driverInfo?.currentLocation;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 pt-safe-top">
        <div className="flex items-center h-16 px-4">
          <Button
            variant="icon"
            size="icon"
            onClick={() => navigate('/')}
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
              driverPosition={driverPos ? [driverPos.lat, driverPos.lng] : null}
            />
          )}
        </div>

        {/* Top overlay with trip status */}
        <div className="absolute top-20 left-4 right-4 z-10">
          <div className="card-elevated p-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
              <div>
                <p className="font-semibold text-foreground">
                  {ride.status === 'accepted' 
                    ? (ride.isScheduled ? 'Ride Scheduled' : t('driver_arriving')) :
                    ride.status === 'in_progress' ? t('trip_in_progress') :
                      ride.status === 'completed' ? t('trip_completed') : t('preparing_ride')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ride.isScheduled && ride.status === 'accepted' 
                    ? (ride.scheduledFor ? `Scheduled for ${new Date(ride.scheduledFor).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Waiting for scheduled time") 
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
                eta={t('detecting')}
                isTrusted={ride.driverId.driverInfo?.isTrusted || false}
                onCall={() => {
                  toast({ title: `Calling ${ride.driverId.name}...` });
                  window.location.href = `tel:${ride.driverId.phone}`;
                }}
                onMessage={() => toast({ title: "Opening chat..." })}
              />
              {(ride.status === 'accepted' || ride.status === 'in_progress') && (
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
