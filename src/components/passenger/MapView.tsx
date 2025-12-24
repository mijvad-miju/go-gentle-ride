import React from 'react';
import { Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MapViewProps {
  showDriver?: boolean;
  driverPosition?: { lat: number; lng: number };
  pickupPosition?: { lat: number; lng: number };
  dropoffPosition?: { lat: number; lng: number };
}

const MapView: React.FC<MapViewProps> = ({
  showDriver = false,
}) => {
  return (
    <div className="relative w-full h-full bg-primary-light">
      {/* Simulated map background with gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(135deg, hsl(168 45% 92%) 0%, hsl(168 35% 88%) 50%, hsl(168 45% 92%) 100%)
          `,
        }}
      >
        {/* Grid pattern for map effect */}
        <svg className="absolute inset-0 w-full h-full opacity-20">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-primary" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        
        {/* Simulated roads */}
        <svg className="absolute inset-0 w-full h-full">
          <path 
            d="M 0 50% L 100% 50%" 
            stroke="hsl(var(--card))" 
            strokeWidth="8" 
            strokeLinecap="round"
            className="opacity-80"
          />
          <path 
            d="M 30% 0 L 30% 100%" 
            stroke="hsl(var(--card))" 
            strokeWidth="6" 
            strokeLinecap="round"
            className="opacity-80"
          />
          <path 
            d="M 70% 20% L 70% 80%" 
            stroke="hsl(var(--card))" 
            strokeWidth="6" 
            strokeLinecap="round"
            className="opacity-80"
          />
        </svg>
      </div>
      
      {/* Pickup marker */}
      <div className="absolute left-[30%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="w-12 h-12 bg-success rounded-full flex items-center justify-center shadow-elevated animate-pulse-gentle">
            <div className="w-4 h-4 bg-success-foreground rounded-full" />
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-card px-3 py-1 rounded-full shadow-soft whitespace-nowrap">
            <span className="text-xs font-semibold text-foreground">You</span>
          </div>
        </div>
      </div>
      
      {/* Driver marker (if tracking) */}
      {showDriver && (
        <div className="absolute left-[20%] top-[35%] -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="relative">
            <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-elevated">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-full flex items-center justify-center">
                <Navigation className="w-5 h-5 text-primary-foreground rotate-45" />
              </div>
            </div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-card px-3 py-1 rounded-full shadow-soft whitespace-nowrap">
              <span className="text-xs font-semibold text-foreground">2 min</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Dropoff marker */}
      <div className="absolute left-[70%] top-[65%] -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center shadow-card">
            <div className="w-3 h-3 bg-secondary-foreground rounded-full" />
          </div>
        </div>
      </div>
      
      {/* Route line */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-5">
        <path 
          d="M 30% 50% Q 50% 50% 70% 65%"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="4"
          strokeDasharray="8 8"
          strokeLinecap="round"
          className="opacity-60"
        />
      </svg>
      
      {/* Current location button */}
      <Button
        variant="icon"
        size="iconLg"
        className="absolute bottom-4 right-4 shadow-elevated"
        aria-label="Center on my location"
      >
        <Navigation className="w-5 h-5 text-primary" />
      </Button>
    </div>
  );
};

export default MapView;
