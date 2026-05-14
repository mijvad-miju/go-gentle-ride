import React, { useState, useEffect } from 'react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Calendar, MapPin, Clock } from 'lucide-react';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import { io } from 'socket.io-client';

const rideIdsMatch = (a: unknown, b: unknown) => String(a) === String(b);

const isDriverAssignedToRide = (ride: { driverId?: unknown }, userId: string | undefined) => {
  if (!userId) return false;
  const d = ride?.driverId as { _id?: unknown } | string | null | undefined;
  if (d == null) return false;
  if (typeof d === 'object' && '_id' in d && d._id != null) {
    return String(d._id) === String(userId);
  }
  return String(d) === String(userId);
};

const DriverPrebooks: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'available' | 'accepted'>('available');
  const [availableRides, setAvailableRides] = useState<any[]>([]);
  const [acceptedRides, setAcceptedRides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRides = async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setIsLoading(true);
    try {
      const user = getUser('driver');
      if (!user) return;

      const API_URL = getApiOrigin();

      // Fetch Available Scheduled Rides
      const availableRes = await fetch(`${API_URL}/api/rides/scheduled/available`);
      const availableData = await availableRes.json();
      setAvailableRides(availableData);

      // Fetch Driver's Accepted Scheduled Rides
      const acceptedRes = await fetch(`${API_URL}/api/rides/user/${user._id}`);
      const acceptedData = await acceptedRes.json();
      
      const now = Date.now();
      const futureAccepted = acceptedData.filter((ride: any) => {
        if (ride.isScheduled !== true) return false;
        if (!['accepted', 'scheduled'].includes(ride.status)) return false;
        if (!isDriverAssignedToRide(ride, user._id)) return false;
        if (!ride.scheduledFor) return false;
        // Pickup time reached = active on dashboard — no longer a "commitment" list item.
        return new Date(ride.scheduledFor).getTime() > now;
      });

      setAcceptedRides(futureAccepted);
    } catch (error) {
      console.error('Error fetching prebooked rides:', error);
      if (!opts?.quiet) {
        toast({
          title: "Error",
          description: "Could not load scheduled rides.",
          variant: "destructive"
        });
      }
    } finally {
      if (!opts?.quiet) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRides();

    const poll = setInterval(() => fetchRides({ quiet: true }), 6000);

    const API_URL = getApiOrigin();
    const socket = API_URL === '' ? io() : io(API_URL);
    socket.on('connect', () => socket.emit('join_driver_room'));
    socket.on('new_scheduled_ride', () => {
      fetchRides({ quiet: true });
      toast({
        title: 'New scheduled pickup',
        description: 'Open Available tab to accept.',
      });
    });
    socket.on('scheduled_ride_accepted', () => fetchRides({ quiet: true }));
    socket.on('scheduled_ride_due', () => fetchRides({ quiet: true }));
    socket.on('ride_cancelled', (data: { rideId?: unknown }) => {
      const rid = data?.rideId;
      if (rid == null) return;
      setAvailableRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, rid)));
      setAcceptedRides((prev) => prev.filter((r) => !rideIdsMatch(r._id, rid)));
      void fetchRides({ quiet: true });
    });

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, []);

  const handleAcceptRide = async (rideId: string) => {
    try {
      const user = getUser('driver');
      if (!user) return;

      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${rideId}/accept`, {
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

      toast({
        title: "Prebooking Accepted",
        description: "This ride has been added to your My Commitments tab!"
      });

      // Refresh both lists
      fetchRides();
      setActiveTab('accepted');
    } catch (error) {
      console.error('Error accepting ride:', error);
      toast({
        title: "Error",
        description: "Could not accept the prebooking. Someone else may have taken it.",
        variant: "destructive"
      });
    }
  };

  const handleCancelCommitment = async (rideId: string) => {
    try {
      // In a real app we might revert it to 'scheduled' instead of cancelling,
      // but the current API only has a 'cancel' patch for drivers backing out.
       const API_URL = getApiOrigin();
       const response = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
         method: 'PATCH',
         headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${getAuthToken('driver')}`
         }
       });

       if (!response.ok) throw new Error('Failed to cancel');

       toast({
         title: "Commitment Cancelled",
         description: "You are no longer assigned to this future ride."
       });

       fetchRides();
    } catch (error) {
      toast({ title: "Error", description: "Could not back out of ride.", variant: "destructive" });
    }
  }

  const renderRideCard = (ride: any, type: 'available' | 'accepted') => (
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
          <p className="font-bold text-lg text-success">₹{ride.fare.estimated}</p>
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

      {type === 'available' ? (
        <Button 
          className="w-full font-bold"
          onClick={() => handleAcceptRide(ride._id)}
        >
          Accept Prebooking
        </Button>
      ) : (
        <div className="space-y-3">
           <div className="bg-success/10 text-success p-3 rounded-xl text-center font-bold text-sm">
             You are assigned to this ride! Please head to the pickup slightly before the scheduled time.
           </div>
           <Button 
            variant="outline" 
            className="w-full border-destructive/20 text-destructive hover:bg-destructive/10"
            onClick={() => handleCancelCommitment(ride._id)}
          >
            Cancel Commitment
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Header title="Scheduled Rides" showMenu={true} />

      <div className="flex-1 px-4 pt-4 space-y-4 max-w-md mx-auto w-full">
        {/* Tabs */}
        <div className="flex bg-muted p-1 rounded-xl mb-6 text-sm font-medium">
          <button
            className={`flex-1 py-3 rounded-lg transition-colors ${activeTab === 'available' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('available')}
          >
            Available ({availableRides.length})
          </button>
          <button
            className={`flex-1 py-3 rounded-lg transition-colors ${activeTab === 'accepted' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
            onClick={() => setActiveTab('accepted')}
          >
            My Commitments ({acceptedRides.length})
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : activeTab === 'available' ? (
          <div className="space-y-4">
            {availableRides.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold mb-2">No Requests</h3>
                <p className="text-muted-foreground">There are no upcoming prebooked rides in your area right now.</p>
              </div>
            ) : (
              availableRides.map(ride => renderRideCard(ride, 'available'))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {acceptedRides.length === 0 ? (
              <div className="text-center py-20 animate-fade-in">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold mb-2">No Commitments</h3>
                <p className="text-muted-foreground">You haven't accepted any future rides yet.</p>
              </div>
            ) : (
              acceptedRides.map(ride => renderRideCard(ride, 'accepted'))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverPrebooks;
