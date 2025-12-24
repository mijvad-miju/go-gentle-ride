import React, { useState } from 'react';
import Header from '@/components/common/Header';
import BottomNav, { driverNavItems } from '@/components/common/BottomNav';
import OnlineToggle from '@/components/driver/OnlineToggle';
import EarningsCard from '@/components/driver/EarningsCard';
import RideRequest from '@/components/driver/RideRequest';
import MapView from '@/components/passenger/MapView';
import { toast } from '@/hooks/use-toast';

const DriverDashboard: React.FC = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [hasRequest, setHasRequest] = useState(false);

  const handleGoOnline = () => {
    setIsOnline(!isOnline);
    if (!isOnline) {
      toast({
        title: "You're now online!",
        description: "You'll receive ride requests soon.",
      });
      // Simulate incoming request after going online
      setTimeout(() => {
        setHasRequest(true);
      }, 3000);
    } else {
      toast({
        title: "You're now offline",
        description: "You won't receive any ride requests.",
      });
      setHasRequest(false);
    }
  };

  const handleAcceptRide = () => {
    setHasRequest(false);
    toast({
      title: "Ride Accepted!",
      description: "Navigate to pickup location.",
    });
  };

  const handleDeclineRide = () => {
    setHasRequest(false);
    toast({
      title: "Ride Declined",
      description: "Waiting for new requests...",
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        title="Driver Dashboard" 
        showMenu={true} 
        notificationCount={hasRequest ? 1 : 0}
      />
      
      {/* Map background when online */}
      {isOnline && !hasRequest && (
        <div className="h-48 relative">
          <MapView />
          <div className="absolute inset-0 map-overlay-bottom" />
        </div>
      )}
      
      {/* Main content */}
      <div className={`flex-1 px-4 ${isOnline ? '-mt-12 relative z-10' : 'pt-4'} pb-24 space-y-4`}>
        {/* Online toggle */}
        <OnlineToggle isOnline={isOnline} onToggle={handleGoOnline} />
        
        {/* Ride request overlay */}
        {hasRequest && (
          <RideRequest
            pickup="Gandhi Nagar, Main Road"
            dropoff="Central Bus Station"
            fare={120}
            distance="4.5 km"
            duration="15 min"
            expiresIn={30}
            onAccept={handleAcceptRide}
            onDecline={handleDeclineRide}
          />
        )}
        
        {/* Earnings card */}
        {!hasRequest && (
          <EarningsCard
            todayEarnings={1850}
            weeklyEarnings={12500}
            tripsToday={12}
            tripsWeek={78}
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
        {isOnline && !hasRequest && (
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
      
      <BottomNav items={driverNavItems} />
    </div>
  );
};

export default DriverDashboard;
