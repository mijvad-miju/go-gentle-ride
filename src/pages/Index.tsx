import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Car, Shield, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AutoRickshaw from '@/components/icons/AutoRickshaw';

const Index: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="w-28 h-28 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 animate-scale-in">
          <AutoRickshaw className="text-primary" size={72} />
        </div>
        
        {/* App name */}
        <h1 className="text-4xl font-bold text-foreground mb-2 animate-fade-in">
          Auto<span className="text-primary">Ride</span>
        </h1>
        <p className="text-lg text-muted-foreground text-center max-w-xs animate-fade-in" style={{ animationDelay: '100ms' }}>
          Your trusted auto-rickshaw companion
        </p>
        
        {/* Features */}
        <div className="flex gap-4 mt-8 mb-12">
          {[
            { icon: Shield, label: 'Safe' },
            { icon: Globe, label: 'Local' },
            { icon: Car, label: 'Fast' },
          ].map((feature, index) => (
            <div 
              key={feature.label}
              className="flex flex-col items-center gap-2 animate-fade-in"
              style={{ animationDelay: `${200 + index * 100}ms` }}
            >
              <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{feature.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Role selection */}
      <div className="px-6 pb-12 space-y-4">
        <p className="text-center text-sm font-medium text-muted-foreground mb-6">
          Continue as
        </p>
        
        <Button
          variant="touch"
          className="w-full"
          onClick={() => navigate('/passenger')}
        >
          <User className="w-5 h-5" />
          <span>Passenger</span>
        </Button>
        
        <Button
          variant="touchOutline"
          className="w-full"
          onClick={() => navigate('/driver')}
        >
          <Car className="w-5 h-5" />
          <span>Driver</span>
        </Button>
        
        {/* Language selector hint */}
        <button 
          className="flex items-center justify-center gap-2 w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {}}
        >
          <Globe className="w-4 h-4" />
          <span>हिंदी / தமிழ் / English</span>
        </button>
      </div>
    </div>
  );
};

export default Index;
