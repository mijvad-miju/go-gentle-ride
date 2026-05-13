import React, { useState } from 'react';
import { Phone, Share2, MapPin, Shield, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

const Emergency: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isSharing, setIsSharing] = useState(false);

  const handleEmergencyCall = () => {
    toast({
      title: t('emergency_services_toast_title'),
      description: t('emergency_services_toast_desc'),
      variant: 'destructive',
    });
  };

  const handleShareLocation = () => {
    setIsSharing(true);
    setTimeout(() => {
      setIsSharing(false);
      toast({
        title: t('emergency_location_toast_title'),
        description: t('emergency_location_toast_desc'),
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-destructive/5 flex flex-col">
      <header className="bg-card border-b border-border pt-safe-top">
        <div className="flex items-center justify-between h-16 px-4">
          <Button variant="icon" size="icon" onClick={() => navigate(-1)}>
            <X className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">{t('safety_center')}</h1>
          <div className="w-12" />
        </div>
      </header>

      <div className="flex-1 px-4 py-6 space-y-6">
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/20 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('need_help')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('emergency_need_help_body')}</p>
            </div>
          </div>
        </div>

        <Button variant="destructive" className="w-full h-20 text-xl" onClick={handleEmergencyCall}>
          <Phone className="w-7 h-7 mr-3" />
          {t('emergency_call_112')}
        </Button>

        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Share2 className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-foreground">{t('share_live_location')}</h3>
              <p className="text-sm text-muted-foreground">{t('emergency_share_location_sub')}</p>
            </div>
          </div>

          <Button variant="touchOutline" className="w-full" onClick={handleShareLocation} disabled={isSharing}>
            {isSharing ? (
              <>
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>{t('sharing')}</span>
              </>
            ) : (
              <>
                <MapPin className="w-5 h-5" />
                <span>{t('share_my_location')}</span>
              </>
            )}
          </Button>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">{t('emergency_contacts')}</h3>
            <Button variant="ghost" size="sm">
              {t('add')}
            </Button>
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

        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-success" />
            <h3 className="font-bold text-foreground">{t('safety_tips')}</h3>
          </div>

          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>{t('safety_tip_verify_driver')}</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>{t('safety_tip_share_trip')}</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <span>{t('safety_tip_trusted')}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Emergency;
