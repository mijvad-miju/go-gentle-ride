import React, { useState } from 'react';
import { Phone, Share2, MapPin, Shield, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const Emergency: React.FC = () => {
  const navigate = useNavigate();
  const [isSharing, setIsSharing] = useState(false);

  const handleEmergencyCall = () => {
    toast({
      title: "Calling Emergency Services",
      description: "Connecting to 112...",
      variant: "destructive",
    });
  };

  const handleShareLocation = () => {
    setIsSharing(true);
    setTimeout(() => {
      setIsSharing(false);
      toast({
        title: "Location Shared",
        description: "Your emergency contacts have been notified with your live location.",
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-destructive/5 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border pt-safe-top">
        <div className="flex items-center justify-between h-16 px-4">
          <Button variant="icon" size="icon" onClick={() => navigate(-1)}>
            <X className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Safety Center</h1>
          <div className="w-12" />
        </div>
      </header>
      
      <div className="flex-1 px-4 py-6 space-y-6">
        {/* Emergency banner */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/20 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Need Help?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                If you're in immediate danger, call emergency services right away.
              </p>
            </div>
          </div>
        </div>
        
        {/* Emergency call button - very prominent */}
        <Button
          variant="destructive"
          className="w-full h-20 text-xl"
          onClick={handleEmergencyCall}
        >
          <Phone className="w-7 h-7 mr-3" />
          Call Emergency (112)
        </Button>
        
        {/* Share location */}
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Share2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-foreground">Share Live Location</h3>
              <p className="text-sm text-muted-foreground">
                Send your location to emergency contacts
              </p>
            </div>
          </div>
          
          <Button
            variant="touchOutline"
            className="w-full"
            onClick={handleShareLocation}
            disabled={isSharing}
          >
            {isSharing ? (
              <>
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Sharing...</span>
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5" />
                <span>Share My Location</span>
              </>
            )}
          </Button>
        </div>
        
        {/* Trusted contacts */}
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Emergency Contacts</h3>
            <Button variant="ghost" size="sm">Add</Button>
          </div>
          
          <div className="space-y-3">
            {[
              { name: 'Mom', phone: '+91 98765 43210' },
              { name: 'Dad', phone: '+91 98765 43211' },
            ].map((contact, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{contact.name[0]}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.phone}</p>
                </div>
                <Button variant="icon" size="icon">
                  <Phone className="w-4 h-4 text-primary" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        
        {/* Safety tips */}
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-success" />
            <h3 className="font-bold text-foreground">Safety Tips</h3>
          </div>
          
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>Always verify the driver's photo and vehicle number before getting in</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>Share your trip with family members for added safety</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>Use trusted driver mode for verified, background-checked drivers</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Emergency;
