import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, User, Car, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUser, isAuthenticated } from '@/lib/auth';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  React.useEffect(() => {
    const hasPassenger = isAuthenticated('passenger') && !!getUser('passenger');
    const hasDriver = isAuthenticated('driver') && !!getUser('driver');

    // If both roles are signed in on this browser, stay on role picker.
    if (hasPassenger && !hasDriver) {
      navigate('/passenger', { replace: true });
    } else if (hasDriver && !hasPassenger) {
      navigate('/driver', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="w-28 h-28 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 animate-scale-in overflow-hidden">
          <img
            src="/auto.png"
            alt="Auto Rickshaw Logo"
            className="w-full h-full object-cover rounded-3xl"
          />
        </div>

        {/* App name */}
        <h1 className="text-4xl font-bold text-foreground mb-2 animate-fade-in">
          Auto<span className="text-primary">Ride</span>
        </h1>
        <p className="text-lg text-muted-foreground text-center max-w-xs animate-fade-in" style={{ animationDelay: '100ms' }}>
          {t('index_tagline')}
        </p>

        {/* Features */}
        <div className="flex gap-4 mt-8 mb-12">
          {[
            { icon: Shield, labelKey: 'index_feature_safe' },
            { icon: Globe, labelKey: 'index_feature_local' },
            { icon: Car, labelKey: 'index_feature_fast' },
          ].map((feature, index) => (
            <div
              key={feature.labelKey}
              className="flex flex-col items-center gap-2 animate-fade-in"
              style={{ animationDelay: `${200 + index * 100}ms` }}
            >
              <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{t(feature.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Role selection */}
      <div className="px-6 pb-12 space-y-4">
        <p className="text-center text-sm font-medium text-muted-foreground mb-6">
          {t('index_sign_in_prompt')}
        </p>

        <Button
          variant="touch"
          className="w-full"
          onClick={() => navigate('/passenger/login')}
        >
          <User className="w-5 h-5" />
          <span>{t('passenger_login')}</span>
        </Button>

        <Button
          variant="touchOutline"
          className="w-full"
          onClick={() => navigate('/driver/login')}
        >
          <Car className="w-5 h-5" />
          <span>{t('driver_partner_login')}</span>
        </Button>

        {/* Language selector hint */}
        <button
          className="flex items-center justify-center gap-2 w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { }}
        >
          <Globe className="w-4 h-4" />
          <span>{t('index_languages_hint')}</span>
        </button>
      </div>
    </div>
  );
};

export default Index;
