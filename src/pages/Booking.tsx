import React, { useState } from 'react';
import MapComponent from '@/components/MapComponent';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Booking: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [liveUserPosition, setLiveUserPosition] = useState<[number, number] | null>(null);

    React.useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => setLiveUserPosition([pos.coords.latitude, pos.coords.longitude]),
            () => { },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setLiveUserPosition([pos.coords.latitude, pos.coords.longitude]),
            () => { },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const handleLocationSelect = (lat: number, lng: number) => {
        setPickupLocation({ lat, lng });
        console.log("Selected Location:", lat, lng);
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <div className="pt-safe-top px-4 py-4 flex items-center space-x-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-xl font-bold">{t('book_auto')}</h1>
            </div>

            <div className="flex-1 px-4 pb-6 space-y-6">
                <Card className="border-none shadow-none bg-transparent">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle className="text-lg">{t('select_pickup')}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        <MapComponent
                            onLocationSelect={handleLocationSelect}
                            height="400px"
                            userPosition={liveUserPosition}
                            centerPosition={liveUserPosition}
                        />
                    </CardContent>
                </Card>

                {pickupLocation && (
                    <div className="p-4 bg-card rounded-xl shadow-sm border animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-start space-x-3">
                            <div className="bg-primary/10 p-2 rounded-full">
                                <MapPin className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold">{t('location_selected')}</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Latitude: {pickupLocation.lat.toFixed(6)}
                                    <br />
                                    Longitude: {pickupLocation.lng.toFixed(6)}
                                </p>
                            </div>
                        </div>
                        <Button className="w-full mt-4">
                            {t('confirm_pickup')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Booking;
