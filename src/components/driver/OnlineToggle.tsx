import React from 'react';
import { Power } from 'lucide-react';

interface OnlineToggleProps {
  isOnline: boolean;
  onToggle: () => void;
}

const OnlineToggle: React.FC<OnlineToggleProps> = ({ isOnline, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={`
        relative w-full p-5 rounded-2xl transition-all duration-300 overflow-hidden
        ${isOnline 
          ? 'bg-gradient-to-r from-success to-success/80 shadow-lg' 
          : 'bg-muted hover:bg-muted/80'
        }
      `}
      aria-label={isOnline ? 'Go offline' : 'Go online'}
    >
      {/* Animated pulse when online */}
      {isOnline && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 bg-success-foreground/10 rounded-full animate-pulse-gentle" />
        </div>
      )}
      
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`
            w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300
            ${isOnline 
              ? 'bg-success-foreground/20' 
              : 'bg-background'
            }
          `}>
            <Power className={`w-7 h-7 ${isOnline ? 'text-success-foreground' : 'text-muted-foreground'}`} />
          </div>
          <div className="text-left">
            <p className={`text-xl font-bold ${isOnline ? 'text-success-foreground' : 'text-foreground'}`}>
              {isOnline ? "You're Online" : "You're Offline"}
            </p>
            <p className={`text-sm ${isOnline ? 'text-success-foreground/80' : 'text-muted-foreground'}`}>
              {isOnline ? 'Accepting ride requests' : 'Tap to start accepting rides'}
            </p>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className={`
          w-4 h-4 rounded-full transition-all duration-300
          ${isOnline 
            ? 'bg-success-foreground animate-pulse' 
            : 'bg-muted-foreground/30'
          }
        `} />
      </div>
    </button>
  );
};

export default OnlineToggle;
