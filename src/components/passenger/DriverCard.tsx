import React from 'react';
import { Star, Phone, MessageCircle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AutoRickshaw from '@/components/icons/AutoRickshaw';

interface DriverCardProps {
  name: string;
  rating: number;
  vehicleNumber: string;
  photoUrl?: string;
  eta: string;
  /** Top banner title (default: "Arriving in") */
  bannerTitle?: string;
  /** Optional smaller line under the main ETA/value */
  bannerHint?: string;
  isTrusted?: boolean;
  onCall?: () => void;
  onMessage?: () => void;
}

const DriverCard: React.FC<DriverCardProps> = ({
  name,
  rating,
  vehicleNumber,
  photoUrl,
  eta,
  bannerTitle = 'Arriving in',
  bannerHint,
  isTrusted = false,
  onCall,
  onMessage,
}) => {
  return (
    <div className="card-elevated p-5 space-y-4">
      {/* ETA Banner */}
      <div className="bg-primary/10 rounded-xl p-3 text-center">
        <p className="text-sm text-primary font-medium">{bannerTitle}</p>
        <p className="text-2xl font-bold text-primary">{eta}</p>
        {bannerHint ? (
          <p className="text-xs text-muted-foreground mt-1 font-medium">{bannerHint}</p>
        ) : null}
      </div>
      
      {/* Driver info */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center overflow-hidden">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">
                {name.charAt(0)}
              </div>
            )}
          </div>
          {isTrusted && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-success rounded-full flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-success-foreground" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground truncate">{name}</h3>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-secondary fill-secondary" />
            <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="icon" size="icon" onClick={onMessage} aria-label="Message driver">
            <MessageCircle className="w-5 h-5 text-primary" />
          </Button>
          <Button variant="icon" size="icon" onClick={onCall} aria-label="Call driver">
            <Phone className="w-5 h-5 text-primary" />
          </Button>
        </div>
      </div>
      
      {/* Vehicle info */}
      <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
        <AutoRickshaw className="text-primary" size={32} />
        <div>
          <p className="text-xs text-muted-foreground">Vehicle Number</p>
          <p className="text-lg font-bold text-foreground tracking-wide">{vehicleNumber}</p>
        </div>
      </div>
    </div>
  );
};

export default DriverCard;
