import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Clock, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RideRequestProps {
  pickup: string;
  dropoff: string;
  fare: number;
  distance: string;
  duration: string;
  expiresIn: number; // seconds
  onAccept: () => void;
  onDecline: () => void;
}

const RideRequest: React.FC<RideRequestProps> = ({
  pickup,
  dropoff,
  fare,
  distance,
  duration,
  expiresIn,
  onAccept,
  onDecline,
}) => {
  const [timeLeft, setTimeLeft] = useState(expiresIn);
  
  useEffect(() => {
    if (timeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft]);
  
  const progress = (timeLeft / expiresIn) * 100;
  
  return (
    <div className="card-elevated overflow-hidden animate-slide-up">
      {/* Timer bar */}
      <div className="h-1.5 bg-muted">
        <div 
          className="h-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="p-5 space-y-4">
        {/* Header with fare */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">New Ride Request</p>
            <div className="flex items-center gap-1 mt-1">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">{timeLeft}s left</span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1">
              <IndianRupee className="w-6 h-6 text-success" />
              <span className="text-3xl font-bold text-success">{fare}</span>
            </div>
            <p className="text-xs text-muted-foreground">{distance} • {duration}</p>
          </div>
        </div>
        
        {/* Route */}
        <div className="space-y-3">
          {/* Pickup */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-success/15 rounded-full flex items-center justify-center flex-shrink-0">
              <Navigation className="w-5 h-5 text-success" />
            </div>
            <div className="flex-1 pt-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Pickup</p>
              <p className="font-semibold text-foreground">{pickup}</p>
            </div>
          </div>
          
          {/* Connector line */}
          <div className="ml-5 border-l-2 border-dashed border-border h-4" />
          
          {/* Dropoff */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-secondary/15 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-secondary" />
            </div>
            <div className="flex-1 pt-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Drop-off</p>
              <p className="font-semibold text-foreground">{dropoff}</p>
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="touchOutline"
            className="flex-1"
            onClick={onDecline}
          >
            Decline
          </Button>
          <Button
            variant="touch"
            className="flex-1 bg-success hover:bg-success/90"
            onClick={onAccept}
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RideRequest;
