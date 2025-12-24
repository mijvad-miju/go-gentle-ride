import React, { useState } from 'react';
import { Mic, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/common/Header';
import BottomNav, { passengerNavItems } from '@/components/common/BottomNav';
import LocationInput from '@/components/passenger/LocationInput';
import FareEstimate from '@/components/passenger/FareEstimate';
import MapView from '@/components/passenger/MapView';
import AutoRickshaw from '@/components/icons/AutoRickshaw';

type BookingStep = 'location' | 'confirm' | 'searching' | 'found';

const PassengerHome: React.FC = () => {
  const [step, setStep] = useState<BookingStep>('location');
  const [pickup, setPickup] = useState('Current Location');
  const [dropoff, setDropoff] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleVoiceInput = () => {
    setIsListening(true);
    // Simulate voice input
    setTimeout(() => {
      setDropoff('Railway Station');
      setIsListening(false);
    }, 2000);
  };

  const handleConfirmBooking = () => {
    setStep('searching');
    // Simulate finding driver
    setTimeout(() => {
      setStep('found');
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title="Book Auto" showMenu={true} />
      
      {/* Map section */}
      <div className="flex-1 relative">
        <MapView showDriver={step === 'found'} />
        
        {/* Voice listening overlay */}
        {isListening && (
          <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-20 animate-fade-in">
            <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center animate-pulse-gentle">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <Mic className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <p className="mt-6 text-xl font-semibold text-foreground">Listening...</p>
            <p className="mt-2 text-muted-foreground">Say your destination</p>
          </div>
        )}
      </div>
      
      {/* Bottom sheet */}
      <div className="bg-background rounded-t-3xl -mt-6 relative z-10 shadow-elevated">
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto my-3" />
        
        <div className="px-4 pb-24 space-y-4">
          {step === 'location' && (
            <>
              {/* Welcome message */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <AutoRickshaw className="text-primary" size={28} />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">Where to?</p>
                  <p className="text-sm text-muted-foreground">Book your ride</p>
                </div>
              </div>
              
              {/* Location inputs */}
              <div className="space-y-3">
                <LocationInput
                  type="pickup"
                  value={pickup}
                  placeholder="Choose pickup"
                  onClick={() => {}}
                />
                
                <LocationInput
                  type="dropoff"
                  value={dropoff}
                  placeholder="Where are you going?"
                  onClick={() => {}}
                  onVoiceClick={handleVoiceInput}
                  isActive={!dropoff}
                />
              </div>
              
              {/* Quick destinations */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Recent Places</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {['Home', 'Office', 'Market', 'School'].map((place) => (
                    <button
                      key={place}
                      onClick={() => setDropoff(place)}
                      className="flex-shrink-0 px-4 py-2.5 bg-muted rounded-xl text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      {place}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Voice booking button */}
              <Button
                variant="touchSecondary"
                className="w-full"
                onClick={handleVoiceInput}
              >
                <Mic className="w-5 h-5 text-primary" />
                <span>Book with Voice</span>
              </Button>
              
              {dropoff && (
                <Button
                  variant="touch"
                  className="w-full"
                  onClick={() => setStep('confirm')}
                >
                  <span>See Fare Estimate</span>
                  <ChevronRight className="w-5 h-5" />
                </Button>
              )}
            </>
          )}
          
          {step === 'confirm' && (
            <>
              <FareEstimate
                fare={85}
                distance="3.2 km"
                duration="12 min"
                isTrustedDriver={true}
              />
              
              <Button
                variant="touch"
                className="w-full"
                onClick={handleConfirmBooking}
              >
                <span>Book Auto</span>
              </Button>
              
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setStep('location')}
              >
                Change Destination
              </Button>
            </>
          )}
          
          {step === 'searching' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-pulse-gentle">
                <AutoRickshaw className="text-primary" size={48} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">Finding your auto...</p>
                <p className="text-muted-foreground mt-1">This usually takes a few seconds</p>
              </div>
            </div>
          )}
          
          {step === 'found' && (
            <div className="space-y-4 animate-fade-in">
              <div className="text-center">
                <p className="text-lg font-bold text-success">Auto Found!</p>
              </div>
              
              <Button
                variant="touch"
                className="w-full"
                onClick={() => window.location.href = '/tracking'}
              >
                <span>View Trip Details</span>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <BottomNav items={passengerNavItems} />
    </div>
  );
};

export default PassengerHome;
