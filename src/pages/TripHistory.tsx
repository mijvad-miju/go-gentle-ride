import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, MapPin, Calendar, Clock, CreditCard, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/common/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

interface Ride {
    _id: string;
    status: 'pending' | 'scheduled' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
    isScheduled?: boolean;
    scheduledFor?: string;
    pickupLocation: {
        address: string;
    };
    dropoffLocation: {
        address: string;
    };
    fare: {
        estimated: number;
        final: number | null;
    };
    requestedAt: string;
    completedAt: string | null;
    driverId: {
        name: string;
        phone: string;
    } | null;
}

const TripHistory: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTripHistory = async () => {
            try {
                const user = getUser('passenger');

                if (!user || !user._id) {
                    setLoading(false);
                    return;
                }

                const API_URL = getApiOrigin();
                const response = await fetch(`${API_URL}/api/rides/user/${user._id}`, {
                    headers: {
                        'Authorization': `Bearer ${getAuthToken('passenger')}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const now = new Date();
                    const filteredRides = data.filter((ride: Ride) => {
                        const isScheduledRide = Boolean(ride.isScheduled || ride.scheduledFor);
                        const isFutureScheduledAccepted =
                            isScheduledRide &&
                            ['accepted', 'scheduled'].includes(ride.status) &&
                            !!ride.driverId &&
                            ride.scheduledFor &&
                            new Date(ride.scheduledFor) > now;
                        return !isFutureScheduledAccepted;
                    });
                    setRides(filteredRides);
                } else {
                    console.error('Failed to fetch rides');
                }
            } catch (error) {
                console.error('Error fetching trip history:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTripHistory();
    }, [navigate]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-success/10 text-success border-success/20';
            case 'cancelled': return 'bg-destructive/10 text-destructive border-destructive/20';
            case 'scheduled': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
            default: return 'bg-primary/10 text-primary border-primary/20';
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col pb-20">
            <Header title={t('trip_history_title')} showMenu={false} />

            <main className="flex-1 px-4 py-4 space-y-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground font-medium">{t('trip_history_loading')}</p>
                    </div>
                ) : rides.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                            <Clock className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-lg font-bold">{t('no_trips_yet')}</p>
                            <p className="text-muted-foreground">{t('no_trips_subtitle')}</p>
                        </div>
                        <Button onClick={() => navigate('/passenger')} variant="touch" className="px-8">
                            {t('book_auto')}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {rides.map((ride) => {
                            const isScheduledRide = Boolean(ride.isScheduled || ride.scheduledFor);
                            const shouldOpenTracking = !(isScheduledRide && ['scheduled', 'accepted'].includes(ride.status));
                            return (
                            <Card
                                key={ride._id}
                                className="overflow-hidden border-border transition-all active:scale-[0.98] cursor-pointer"
                                onClick={() => shouldOpenTracking && navigate(`/tracking/${ride._id}`)}
                            >
                                <CardContent className="p-0">
                                    <div className="p-4 flex justify-between items-start border-b border-border/50">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(ride.requestedAt)}
                                            </div>
                                            <p className="font-bold text-foreground">
                                                {ride.status === 'scheduled' ? t('scheduled_auto') : (ride.driverId?.name || t('searching'))}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className={`capitalize font-bold ${getStatusColor(ride.status)}`}>
                                            {ride.status.replace('_', ' ')}
                                        </Badge>
                                    </div>

                                    <div className="p-4 space-y-4">
                                        <div className="relative space-y-4">
                                            {/* Connection Line */}
                                            <div className="absolute left-[7px] top-[10px] bottom-[10px] w-0.5 border-l-2 border-dashed border-border" />

                                            <div className="flex items-start gap-3 relative">
                                                <div className="mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background z-10" />
                                                <div className="flex-1">
                                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tighter">{t('status_pickup')}</p>
                                                    <p className="text-sm font-semibold text-foreground line-clamp-1">{ride.pickupLocation.address}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3 relative">
                                                <div className="mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-success bg-background z-10" />
                                                <div className="flex-1">
                                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-tighter">{t('status_dropoff')}</p>
                                                    <p className="text-sm font-semibold text-foreground line-clamp-1">{ride.dropoffLocation.address}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-2 flex items-center justify-between border-t border-border/50">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{t('fare')}</span>
                                                    <span className="font-bold text-foreground">₹{ride.fare.final || ride.fare.estimated}</span>
                                                </div>
                                                <div className="flex flex-col border-l border-border/50 pl-4">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                                                        {ride.isScheduled ? t('scheduled_for') : t('time')}
                                                    </span>
                                                    <span className="font-bold text-foreground text-sm">
                                                        {ride.isScheduled && ride.scheduledFor 
                                                            ? formatTime(ride.scheduledFor) 
                                                            : formatTime(ride.requestedAt)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center text-primary text-xs font-bold gap-1">
                                                Details <ChevronRight className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};

export default TripHistory;
