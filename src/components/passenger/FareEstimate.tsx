import React from 'react';
import { Clock, Route, Shield } from 'lucide-react';
import AutoRickshaw from '@/components/icons/AutoRickshaw';

interface FareEstimateProps {
  fare: number;
  distance: string;
  duration: string;
  isTrustedDriver?: boolean;
}

const FareEstimate: React.FC<FareEstimateProps> = ({
  fare,
  distance,
  duration,
  isTrustedDriver = false,
}) => {
  return (
    <div className="card-elevated p-5 space-y-4">
      {/* Auto type header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
            <AutoRickshaw className="text-primary" size={36} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Auto</h3>
            <p className="text-sm text-muted-foreground">Comfortable ride</p>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">₹{fare}</p>
          <p className="text-xs text-muted-foreground">Estimated fare</p>
        </div>
      </div>
      
      {/* Trip details */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Route className="w-4 h-4" />
          <span className="text-sm font-medium">{distance}</span>
        </div>
        
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">{duration}</span>
        </div>
        
        {isTrustedDriver && (
          <div className="flex items-center gap-2 text-success">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-medium">Trusted</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FareEstimate;
