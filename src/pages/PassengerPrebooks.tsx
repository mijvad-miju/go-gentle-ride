import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import { io } from 'socket.io-client';

function hasDriverAssigned(ride: any): boolean {
  if (ride.driverId == null) return false;
  if (typeof ride.driverId === 'object') return Object.keys(ride.driverId).length > 0;
  return true;
}

const PassengerPrebooks: React.FC = () => {
  const [confirmedRides, setConfirmedRides] = useState<any[]>([]);
  const [awaitingRides, setAwaitingRides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScheduledRides = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setIsLoading(true);
    try {
      const user = getUser('passenger');
      if (!user) return;

      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/user/${user._id}`);
      const data = await response.json();

      const now = Date.now();
      const base = (ride: any) =>
        ride.isScheduled === true &&
        ['scheduled', 'accepted'].includes(ride.status) &&
        ride.scheduledFor &&
        new Date(ride.scheduledFor).getTime() > now;

      const futureScheduled = data.filter(base);

      setConfirmedRides(futureScheduled.filter((ride: any) => hasDriverAssigned(ride)));
      setAwaitingRides(futureScheduled.filter((ride: any) => !hasDriverAssigned(ride)));
    } catch (error) {
      console.error('Error fetching scheduled rides:', error);
      if (!opts?.quiet) {
        toast({
          title: "Error",
          description: "Could not load prebooked trips.",
          variant: "destructive"
        });
      }
    } finally {
      if (!opts?.quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduledRides();

    const user = getUser('passenger');
    if (!user?._id) return;

    const poll = setInterval(() => fetchScheduledRides({ quiet: true }), 6000);

    const API_URL = getApiOrigin();
    const socket = API_URL === '' ? io() : io(API_URL);
    const joinRoom = () => socket.emit('join_passenger_room', user._id);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();
    socket.on('prebook_driver_assigned', () => {
      fetchScheduledRides({ quiet: true });
      toast({
        title: 'Driver assigned',
        description: 'Your prebooking is confirmed. Details are below.',
      });
    });

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [fetchScheduledRides]);

  const handleCancelRide = async (rideId: string) => {
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
        title: "Booking Cancelled",
        description: "Your scheduled ride has been cancelled successfully."
      });

      fetchScheduledRides({ quiet: true });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      toast({
        title: "Error",
        description: "Could not cancel the booking. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Header title="Prebooked Rides" showMenu={true} />

      <div className="flex-1 px-4 pt-4 space-y-4 max-w-md mx-auto w-full">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : awaitingRides.length === 0 && confirmedRides.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-2">No Prebooked Rides</h3>
            <p className="text-muted-foreground">
              After you schedule a pickup from home, it stays open for drivers to accept. Once someone accepts, the full details and driver info appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {awaitingRides.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide px-1">
                  Awaiting a driver
                </h2>
                <p className="text-xs text-muted-foreground px-1 -mt-1">
                  Drivers are notified. You can cancel if your plans change.
                </p>
                {awaitingRides.map((ride) => (
                  <div key={ride._id} className="card-elevated p-4 animate-scale-in border border-border/60">
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">
                            {new Date(ride.scheduledFor).toLocaleString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{ride.pickupLocation.address}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold uppercase px-2 py-1 rounded-full bg-secondary/10 text-secondary shrink-0">
                        Open
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-destructive/20 text-destructive hover:bg-destructive/10"
                      onClick={() => handleCancelRide(ride._id)}
                    >
                      Cancel request
                    </Button>
                  </div>
                ))}
              </section>
            )}

            {confirmedRides.length > 0 && (
              <section className="space-y-3">
                {awaitingRides.length > 0 && (
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide px-1 pt-2">
                    Confirmed prebookings
                  </h2>
                )}
                {confirmedRides.map((ride) => (
              <div key={ride._id} className="card-elevated p-5 animate-scale-in">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-bold text-foreground">
                        {new Date(ride.scheduledFor).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-sm text-primary font-medium flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(ride.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase px-2 py-1 rounded-full bg-success/10 text-success">
                      Driver confirmed
                    </span>
                    <p className="font-bold mt-1">₹{ride.fare.estimated}</p>
                  </div>
                </div>

                <div className="space-y-3 relative mb-4">
                  <div className="absolute left-[9px] top-4 bottom-4 w-0.5 bg-border z-0"></div>
                  
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-5 h-5 rounded-full bg-background border-[3px] border-success flex items-center justify-center mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Pickup</p>
                      <p className="text-sm font-semibold line-clamp-1">{ride.pickupLocation.address}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 relative z-10">
                    <div className="w-5 h-5 rounded-full bg-background border-[3px] border-secondary flex items-center justify-center mt-0.5">
                      <MapPin className="w-2.5 h-2.5 text-secondary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Dropoff</p>
                      <p className="text-sm font-semibold line-clamp-1">{ride.dropoffLocation.address}</p>
                    </div>
                  </div>
                </div>

                {ride.driverId && (
                  <div className="mt-4 p-3 bg-muted rounded-xl flex items-center justify-between mb-4">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center">
                           <span className="font-bold text-primary">{ride.driverId.name?.charAt(0) ?? '?'}</span>
                        </div>
                        <div>
                           <p className="font-bold text-sm">{ride.driverId.name}</p>
                           <p className="text-xs text-muted-foreground">{ride.driverId.driverInfo?.vehicleNumber || 'Auto Rickshaw'}</p>
                        </div>
                     </div>
                  </div>
                )}

                <Button 
                  variant="outline" 
                  className="w-full border-destructive/20 text-destructive hover:bg-destructive/10"
                  onClick={() => handleCancelRide(ride._id)}
                >
                  Cancel Prebooking
                </Button>
              </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PassengerPrebooks;
