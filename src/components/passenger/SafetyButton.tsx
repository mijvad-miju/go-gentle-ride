import React, { useState } from 'react';
import { Shield, Phone, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SafetyButtonProps {
  onEmergencyCall?: () => void;
  onShareTrip?: () => void;
}

const SafetyButton: React.FC<SafetyButtonProps> = ({
  onEmergencyCall,
  onShareTrip,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* Expanded options */}
      {isExpanded && (
        <div className="absolute bottom-20 right-0 animate-fade-in">
          <div className="card-elevated p-3 space-y-2 min-w-[180px]">
            <button
              onClick={() => {
                onEmergencyCall?.();
                setIsExpanded(false);
              }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-destructive/10 transition-colors text-left"
            >
              <div className="w-10 h-10 bg-destructive/15 rounded-full flex items-center justify-center">
                <Phone className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Emergency</p>
                <p className="text-xs text-muted-foreground">Call 112</p>
              </div>
            </button>
            
            <button
              onClick={() => {
                onShareTrip?.();
                setIsExpanded(false);
              }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent transition-colors text-left"
            >
              <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center">
                <Share2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Share Trip</p>
                <p className="text-xs text-muted-foreground">Send to contacts</p>
              </div>
            </button>
          </div>
        </div>
      )}
      
      {/* Main safety button */}
      <Button
        variant="safety"
        size="iconXl"
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative"
        aria-label="Safety options"
      >
        {isExpanded ? (
          <X className="w-7 h-7" />
        ) : (
          <Shield className="w-7 h-7" />
        )}
        {!isExpanded && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full animate-pulse-gentle" />
        )}
      </Button>
    </div>
  );
};

export default SafetyButton;
