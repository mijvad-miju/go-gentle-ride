import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import MapView from '@/components/passenger/MapView';
import DriverCard from '@/components/passenger/DriverCard';
import SafetyButton from '@/components/passenger/SafetyButton';
import { toast } from '@/hooks/use-toast';

const TripTracking: React.FC = () => {
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 pt-safe-top">
        <div className="flex items-center h-16 px-4">
          <Button 
            variant="icon" 
            size="icon" 
            onClick={() => navigate('/')}
            className="bg-card/90 backdrop-blur"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>
      </header>
      
      {/* Full screen map */}
      <div className="flex-1 relative">
        <MapView showDriver={true} />
        
        {/* Top overlay with trip status */}
        <div className="absolute top-20 left-4 right-4 z-10">
          <div className="card-elevated p-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
              <div>
                <p className="font-semibold text-foreground">Driver is on the way</p>
                <p className="text-sm text-muted-foreground">Arriving in 2 minutes</p>
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
          <DriverCard
            name="Ramesh Kumar"
            rating={4.8}
            vehicleNumber="KA 01 AB 1234"
            eta="2 min"
            isTrusted={true}
            onCall={() => toast({ title: "Calling driver..." })}
            onMessage={() => toast({ title: "Opening chat..." })}
          />
        </div>
      </div>
    </div>
  );
};

export default TripTracking;
