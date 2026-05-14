import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, MapPin, Clock, AlertTriangle, Car } from 'lucide-react';
import MapComponent from '@/components/MapComponent';
import { Card, CardContent } from '@/components/ui/card';
import { getApiOrigin } from '@/lib/apiOrigin';

interface SharePayload {
    rideId: string;
    status: string;
    pickup: {
        address?: string;
        coordinates?: { lat: number; lng: number };
    };
    dropoff: {
        address?: string;
        coordinates?: { lat: number; lng: number };
    };
    passenger: { name: string | null };
    driver: {
        name: string | null;
        vehicleNumber: string | null;
        vehicleType: string | null;
        rating: number | null;
        currentLocation: { lat: number; lng: number } | null;
    } | null;
    distance: { value: number; text: string } | null;
    duration: { value: number; text: string } | null;
    startedAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    shareExpiresAt: string | null;
}

function statusLabel(status: string, t: (k: string, fb?: string) => string): string {
    switch (status) {
        case 'pending':
        case 'scheduled':
            return t('live_tracking_status_waiting', 'Waiting for a driver');
        case 'accepted':
        case 'arriving':
            return t('live_tracking_status_arriving', 'Driver is on the way');
        case 'in_progress':
            return t('live_tracking_status_inprogress', 'On the trip');
        case 'completed':
            return t('live_tracking_status_completed', 'Trip completed');
        case 'cancelled':
            return t('live_tracking_status_cancelled', 'Trip cancelled');
        default:
            return status;
    }
}

const SharedTracking: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const { t } = useTranslation();
    const [data, setData] = React.useState<SharePayload | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!token) {
            setError('expired');
            setLoading(false);
            return;
        }

        let cancelled = false;
        const API_URL = getApiOrigin();

        const fetchOnce = async () => {
            try {
                const res = await fetch(`${API_URL}/api/share/${token}`);
                if (cancelled) return;
                if (res.status === 410 || res.status === 404) {
                    setError('expired');
                    setData(null);
                    setLoading(false);
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setError(body?.message || `HTTP ${res.status}`);
                    setLoading(false);
                    return;
                }
                const json: SharePayload = await res.json();
                if (cancelled) return;
                setData(json);
                setError(null);
                setLoading(false);
            } catch (e: any) {
                if (cancelled) return;
                setError(e?.message || 'Network error');
                setLoading(false);
            }
        };

        void fetchOnce();
        const poll = setInterval(fetchOnce, 6000);

        let socketCleanup: (() => void) | null = null;
        import('socket.io-client').then(({ io }) => {
            if (cancelled) return;
            const socket = API_URL === '' ? io() : io(API_URL);
            socket.on('connect', () => socket.emit('join_share', token));

            const merge = (next: Partial<SharePayload> | null) => {
                if (!next) return;
                setData((prev) => (prev ? { ...prev, ...next } : (next as SharePayload)));
            };

            socket.on('ride_status', merge);
            socket.on('driver_location_update', (payload: { location: { lat: number; lng: number } }) => {
                setData((prev) =>
                    prev
                        ? {
                              ...prev,
                              driver: prev.driver
                                  ? { ...prev.driver, currentLocation: payload.location }
                                  : null
                          }
                        : prev
                );
            });

            socketCleanup = () => {
                try {
                    socket.disconnect();
                } catch {
                    /* ignore */
                }
            };
        });

        return () => {
            cancelled = true;
            clearInterval(poll);
            socketCleanup?.();
        };
    }, [token]);

    const pickupPos = React.useMemo<[number, number] | null>(() => {
        const c = data?.pickup?.coordinates;
        return c ? [c.lat, c.lng] : null;
    }, [data?.pickup?.coordinates]);
    const dropoffPos = React.useMemo<[number, number] | null>(() => {
        const c = data?.dropoff?.coordinates;
        return c ? [c.lat, c.lng] : null;
    }, [data?.dropoff?.coordinates]);
    const driverPos = React.useMemo<[number, number] | null>(() => {
        const c = data?.driver?.currentLocation;
        if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') return null;
        return [c.lat, c.lng];
    }, [data?.driver?.currentLocation]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error === 'expired') {
        return (
            <div className="min-h-screen flex items-center justify-center px-6 bg-background">
                <Card className="border-border/50 bg-card/40 backdrop-blur-xl max-w-md w-full">
                    <CardContent className="p-8 text-center space-y-4">
                        <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 backdrop-blur-md flex items-center justify-center">
                            <AlertTriangle className="w-7 h-7 text-primary" />
                        </div>
                        <h1 className="text-xl font-bold text-foreground">
                            {t('share_expired_title', 'This trip has ended')}
                        </h1>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {t(
                                'share_expired_desc',
                                'The shared trip link has expired. Ask your friend to send a fresh link if their trip is still ongoing.'
                            )}
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex items-center justify-center px-6 bg-background">
                <Card className="border-border/50 bg-card/40 backdrop-blur-xl max-w-md w-full">
                    <CardContent className="p-8 text-center space-y-3">
                        <AlertTriangle className="w-10 h-10 text-primary mx-auto" />
                        <p className="text-sm text-muted-foreground">{error || 'Unknown error'}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="pt-safe-top px-4 py-4 border-b border-border/50 backdrop-blur-xl bg-background/60 sticky top-0 z-20">
                <div className="flex items-center gap-3 max-w-2xl mx-auto">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 backdrop-blur-md flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                            {t('live_tracking_title', 'Live trip tracking')}
                        </p>
                        <p className="text-sm font-semibold text-foreground truncate">
                            {data.passenger.name
                                ? t('share_header_with_name', { name: data.passenger.name, defaultValue: `${data.passenger.name}'s trip` })
                                : t('share_header_generic', 'Trip in progress')}
                        </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold border border-primary/30">
                        {statusLabel(data.status, t)}
                    </span>
                </div>
            </header>

            <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 py-4 gap-4">
                <div className="rounded-2xl overflow-hidden border border-border/50 bg-card/40 backdrop-blur-xl">
                    <MapComponent
                        height="380px"
                        pickupPosition={pickupPos}
                        dropoffPosition={dropoffPos}
                        driverPosition={driverPos}
                        pickupName={data.pickup.address || 'Pickup'}
                        dropoffName={data.dropoff.address || 'Drop-off'}
                    />
                </div>

                <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                                <MapPin className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                                    {t('pickup', 'Pickup')}
                                </p>
                                <p className="text-sm font-semibold text-foreground truncate">
                                    {data.pickup.address || '—'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <MapPin className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                                    {t('dropoff', 'Drop-off')}
                                </p>
                                <p className="text-sm font-semibold text-foreground truncate">
                                    {data.dropoff.address || '—'}
                                </p>
                            </div>
                        </div>

                        {(data.distance || data.duration) && (
                            <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground font-medium">
                                    {data.distance?.text}
                                    {data.distance && data.duration ? ' · ' : ''}
                                    {data.duration?.text}
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {data.driver && (
                    <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                                <Car className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                                    {t('driver', 'Driver')}
                                </p>
                                <p className="text-sm font-semibold text-foreground truncate">
                                    {data.driver.name || '—'}
                                </p>
                                {data.driver.vehicleNumber && (
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                        {data.driver.vehicleNumber}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <p className="text-center text-[10px] text-muted-foreground uppercase tracking-[0.2em] py-4">
                    {t('share_footer', 'Shared via AutoRide')}
                </p>
            </main>
        </div>
    );
};

export default SharedTracking;
