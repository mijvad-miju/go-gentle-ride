import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/common/Header';
import OnlineToggle from '@/components/driver/OnlineToggle';
import EarningsCard from '@/components/driver/EarningsCard';
import RideRequest from '@/components/driver/RideRequest';
import MapComponent from '@/components/MapComponent';
import MapView from '@/components/passenger/MapView';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import AutoRickshaw from '@/components/icons/AutoRickshaw';
import { io, Socket } from 'socket.io-client';

const DriverDashboard: React.FC = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [scheduledRides, setScheduledRides] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'immediate' | 'scheduled'>('immediate');
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Socket setup
  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket server');
      if (isOnline) {
        socket.emit('join_driver_room');
      }
    });

    socket.on('new_ride', (ride) => {
      if (isOnline && !currentRide && !activeRide) {
        console.log('Received new_ride via socket:', ride);
        setCurrentRide(ride);

        // Play notification sound
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.error('Audio play failed:', e));
        } catch (e) {
          console.error('Failed to play notification sound:', e);
        }

        toast({
          title: "New Ride Request!",
          description: `From: ${ride.pickupLocation.address}`,
        });
      }
    });

    socket.on('scheduled_ride_approaching', (approachingRide) => {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      if (isOnline && user && (approachingRide.driverId === user._id || approachingRide.driverId?._id === user._id)) {
        toast({
          title: "Scheduled Ride Approaching!",
          description: `Time to head to ${approachingRide.pickupLocation.address}.`,
        });
        
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.error('Audio play failed:', e));
        } catch (e) {
          console.error('Failed to play notification sound:', e);
        }

        setActiveRide(approachingRide);
        setActiveTab('immediate');
        setScheduledRides(prev => prev.filter(r => r._id !== approachingRide._id));
      }
    });

    socket.on('scheduled_ride_accepted', (data) => {
      setScheduledRides(prev => prev.filter(r => r._id !== data.rideId));
    });

    return () => {
      socket.disconnect();
    };
  }, [isOnline, currentRide, activeRide]);

    // Join room when online status changes
  useEffect(() => {
    if (isOnline && socketRef.current?.connected) {
      socketRef.current.emit('join_driver_room');
    }
  }, [isOnline]);

  const fetchScheduledRides = async () => {
    if (!isOnline) return;
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/rides/scheduled/available`);
      const rides = await response.json();
      setScheduledRides(rides);
    } catch (error) {
      console.error('Error fetching scheduled rides:', error);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isOnline && !currentRide && !activeRide) {
      const fetchPendingRides = async () => {
        try {
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const response = await fetch(`${API_URL}/api/rides/pending/available`);
          const rides = await response.json();

          if (rides.length > 0 && !currentRide) {
            setCurrentRide(rides[0]);
          }
        } catch (error) {
          console.error('Error fetching pending rides:', error);
        }
      };

      fetchPendingRides();
      fetchScheduledRides();
      interval = setInterval(() => {
        fetchPendingRides();
        fetchScheduledRides();
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnline, currentRide, activeRide]);

  // Real-time location tracking
  useEffect(() => {
    let watchId: number;

    if (isOnline) {
      const updateLocation = async (lat: number, lng: number) => {
        setCurrentLocation([lat, lng]);

        try {
          const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const userStr = localStorage.getItem('user');
          const user = userStr ? JSON.parse(userStr) : null;

          if (!user?._id) return;

          // Stream location to backend
          fetch(`${API_URL}/api/users/drivers/${user._id}/location`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
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
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isOnline]);

  const handleGoOnline = () => {
    setIsOnline(!isOnline);
    if (!isOnline) {
      toast({
        title: "You're now online!",
        description: "You'll receive ride requests soon.",
      });
    } else {
      toast({
        title: "You're now offline",
        description: "You won't receive any ride requests.",
      });
      setCurrentRide(null);
      setActiveRide(null);
    }
  };

  const handleAcceptRide = async (rideToAccept?: any) => {
    const ride = rideToAccept || currentRide;
    if (!ride) return;

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;

      const response = await fetch(`${API_URL}/api/rides/${ride._id}/accept`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
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

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${API_URL}/api/rides/${activeRide._id}/complete`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="Driver Dashboard"
        showMenu={true}
      />

      {/* Map container when online or active */}
      {isOnline && (
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
      )}

      {/* Main content */}
      <div className={`flex-1 px-4 ${isOnline ? 'mt-4 relative z-10' : 'pt-4'} pb-24 space-y-4`}>
        {/* Online toggle */}
        <OnlineToggle isOnline={isOnline} onToggle={handleGoOnline} />

        {/* Navigation Tabs (Immediate / Scheduled) */}
        {isOnline && !activeRide && (
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
              Scheduled ({scheduledRides.length})
            </button>
          </div>
        )}

        {/* Active Ride View */}
        {activeRide && (
          <div className="card-elevated p-6 animate-scale-in">
            <h3 className="font-bold text-lg mb-4">Active Ride</h3>
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
            <Button onClick={handleCompleteRide} className="w-full h-14 text-lg font-bold">
              Complete Ride
            </Button>
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
        {activeTab === 'scheduled' && isOnline && !activeRide && (
          <div className="space-y-4">
            {scheduledRides.length === 0 ? (
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

        {/* Status message when offline */}
        {!isOnline && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Go online to start receiving ride requests
            </p>
          </div>
        )}

        {/* Waiting message when online */}
        {activeTab === 'immediate' && isOnline && !currentRide && (
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
