import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Calendar, Clock, User, IndianRupee } from 'lucide-react';
import Header from '@/components/common/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getUser } from '@/lib/auth';

interface Ride {
    _id: string;
    status: 'pending' | 'accepted' | 'arriving' | 'in_progress' | 'completed' | 'cancelled';
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
    passengerId: {
        name: string;
        phone: string;
    } | null;
}

const DriverTrips: React.FC = () => {
    const navigate = useNavigate();
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const user = getUser();

    useEffect(() => {
        const fetchDriverTrips = async () => {
            if (!user || user.role !== 'driver') return;

            try {
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
                const response = await fetch(`${API_URL}/api/rides/user/${user._id}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    // Filter or sort can be done here if needed
                    setRides(data);
                }
            } catch (error) {
                console.error('Error fetching driver trips:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDriverTrips();
    }, [user]);

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
            default: return 'bg-primary/10 text-primary border-primary/20';
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-background">
            <Header title="My Earnings & Trips" showMenu={false} />

            <main className="flex-1 px-4 py-4 space-y-4 pb-24">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground font-medium">Loading your ride history...</p>
                    </div>
                ) : rides.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                            <Clock className="w-10 h-10 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-lg font-bold">No trips yet</p>
                            <p className="text-muted-foreground">Completed rides will appear here</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {rides.map((ride) => (
                            <Card key={ride._id} className="overflow-hidden border-border/50">
                                <CardContent className="p-0">
                                    <div className="p-4 flex justify-between items-start border-b border-border/50 bg-muted/20">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(ride.requestedAt)}
                                            </div>
                                            <div className="flex items-center gap-2 font-bold text-foreground">
                                                <User className="w-4 h-4 text-primary" />
                                                {ride.passengerId?.name || 'Customer'}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={`capitalize font-bold ${getStatusColor(ride.status)}`}>
                                            {ride.status.replace('_', ' ')}
                                        </Badge>
                                    </div>

                                    <div className="p-4 space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 w-2 h-2 rounded-full bg-primary" />
                                                <p className="text-sm font-medium text-foreground line-clamp-1">{ride.pickupLocation.address}</p>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 w-2 h-2 rounded-full bg-success" />
                                                <p className="text-sm font-medium text-foreground line-clamp-1">{ride.dropoffLocation.address}</p>
                                            </div>
                                        </div>

                                        <div className="pt-3 flex items-center justify-between border-t border-border/50">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">You Earned</span>
                                                    <span className="font-bold text-success flex items-center">
                                                        <IndianRupee className="w-3 h-3" />
                                                        {ride.fare.final || ride.fare.estimated}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col border-l border-border/50 pl-4">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Time</span>
                                                    <span className="font-bold text-foreground text-sm">{formatTime(ride.requestedAt)}</span>
                                                </div>
                                            </div>
                                            <div className="text-muted-foreground">
                                                <ChevronRight className="w-5 h-5" />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default DriverTrips;
