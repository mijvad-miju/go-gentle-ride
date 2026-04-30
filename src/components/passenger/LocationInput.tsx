import React from 'react';
import { MapPin, Navigation, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocationInputProps {
  type: 'pickup' | 'dropoff';
  value: string;
  placeholder: string;
  onClick: () => void;
  onVoiceClick?: () => void;
  isActive?: boolean;
}

const LocationInput: React.FC<LocationInputProps> = ({
  type,
  value,
  placeholder,
  onClick,
  onVoiceClick,
  isActive = false,
}) => {
  const isPickup = type === 'pickup';

  return (
    <div
      className={`
        flex items-center gap-3 p-4 rounded-2xl transition-all duration-200 cursor-pointer
        ${isActive
          ? 'bg-primary-light ring-2 ring-primary'
          : 'bg-card hover:bg-accent'
        }
      `}
      onClick={onClick}
    >
      <div className={`
        flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0
        ${isPickup ? 'bg-success/15 text-success' : 'bg-secondary/15 text-secondary'}
      `}>
        {isPickup ? (
          <Navigation className="w-5 h-5" />
        ) : (
          <MapPin className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {isPickup ? 'Pickup' : 'Drop-off'}
        </p>
        <p className={`text-base font-semibold truncate ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value || placeholder}
        </p>
      </div>

      {onVoiceClick && (
        <Button
          variant="icon"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onVoiceClick();
          }}
          className="flex-shrink-0"
          aria-label="Voice input"
        >
          <Mic className="w-5 h-5 text-primary" />
        </Button>
      )}
    </div>
  );
};

export default LocationInput;
