import React, { useState, useEffect } from 'react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock } from 'lucide-react';

const PassengerPrebooks: React.FC = () => {
  const [scheduledRides, setScheduledRides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScheduledRides = async () => {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/rides/user/${user._id}`);
      const data = await response.json();

      // Filter only scheduled rides that are either pending or accepted, but not completed/cancelled
      const futureRides = data.filter((ride: any) => 
        ride.isScheduled === true && 
        ['pending', 'scheduled', 'accepted'].includes(ride.status)
      );

      setScheduledRides(futureRides);
    } catch (error) {
      console.error('Error fetching scheduled rides:', error);
      toast({
        title: "Error",
        description: "Could not load prebooked trips.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduledRides();
  }, []);

  const handleCancelRide = async (rideId: string) => {
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
        title: "Booking Cancelled",
        description: "Your scheduled ride has been cancelled successfully."
      });

      // Refresh list
      fetchScheduledRides();
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
        ) : scheduledRides.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-2">No Prebooked Rides</h3>
            <p className="text-muted-foreground">
              You don't have any upcoming scheduled trips. Map out your next journey on the home page!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {scheduledRides.map((ride) => (
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
                    <span className={`text-xs font-bold uppercase px-2 py-1 rounded-full ${
                      ride.status === 'accepted' ? 'bg-success/10 text-success' : 'bg-secondary/10 text-secondary'
                    }`}>
                      {ride.status === 'accepted' ? 'Driver Confirmed' : 'Waiting for Driver'}
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
                           <span className="font-bold text-primary">{ride.driverId.name.charAt(0)}</span>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default PassengerPrebooks;
