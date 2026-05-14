import React, { useState, useEffect } from 'react';
import Header from '@/components/common/Header';
import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, TrendingUp, Calendar, Clock, ChevronRight } from 'lucide-react';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

interface EarningItem {
    _id: string;
    amount: number;
    date: string;
    rideId: {
        pickupLocation: { address: string };
        dropoffLocation: { address: string };
    } | null;
}

interface EarningsSummary {
    totalEarnings: number;
    totalTrips: number;
}

const DriverEarnings: React.FC = () => {
    const [todayStats, setTodayStats] = useState<EarningsSummary>({ totalEarnings: 0, totalTrips: 0 });
    const [weeklyStats, setWeeklyStats] = useState<EarningsSummary>({ totalEarnings: 0, totalTrips: 0 });
    const [recentEarnings, setRecentEarnings] = useState<EarningItem[]>([]);
    const [loading, setLoading] = useState(true);
    const user = getUser('driver');

    useEffect(() => {
        const fetchEarnings = async () => {
            if (!user || user.role !== 'driver') return;

            try {
                const API_URL = getApiOrigin();
                const headers = { 'Authorization': `Bearer ${getAuthToken('driver')}` };

                // Fetch today's earnings
                const todayRes = await fetch(`${API_URL}/api/earnings/driver/${user._id}/today`, { headers });
                if (todayRes.ok) {
                    const data = await todayRes.json();
                    setTodayStats({ totalEarnings: data.totalEarnings, totalTrips: data.totalTrips });
                }

                // Fetch weekly earnings and recent transactions
                const weekRes = await fetch(`${API_URL}/api/earnings/driver/${user._id}/week`, { headers });
                if (weekRes.ok) {
                    const data = await weekRes.json();
                    setWeeklyStats({ totalEarnings: data.totalEarnings, totalTrips: data.totalTrips });
                    setRecentEarnings(data.earnings || []);
                }
            } catch (error) {
                console.error('Error fetching earnings:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchEarnings();
    }, [user]);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
        });
    };

    return (
        <div className="flex-1 flex flex-col bg-background">
            <Header title="Earnings Dashboard" showMenu={false} />

            <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto pb-24">
                {/* Summary Section */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Performance</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Card className="border-border/50 bg-primary/5 border-primary/10">
                            <CardContent className="p-4 space-y-1">
                                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Today's Earnings</p>
                                <div className="flex items-baseline gap-1">
                                    <IndianRupee className="w-4 h-4 text-primary" />
                                    <span className="text-2xl font-black text-foreground">{todayStats.totalEarnings}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium">{todayStats.totalTrips} Trips completed</p>
                            </CardContent>
                        </Card>
                        <Card className="border-border/50 bg-success/5 border-success/10">
                            <CardContent className="p-4 space-y-1">
                                <p className="text-[10px] font-bold text-success uppercase tracking-wider">This Week</p>
                                <div className="flex items-baseline gap-1">
                                    <IndianRupee className="w-4 h-4 text-success" />
                                    <span className="text-2xl font-black text-foreground">{weeklyStats.totalEarnings}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium">{weeklyStats.totalTrips} Trips</p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Earnings Chart Placeholder/Graphic */}
                <Card className="border-border/50 bg-card overflow-hidden">
                    <CardContent className="p-0">
                        <div className="p-4 border-b border-border/50 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                <span className="text-sm font-bold">Earnings Trend</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold py-0 h-5">Last 7 Days</Badge>
                        </div>
                        <div className="h-40 w-full bg-muted/20 flex items-end justify-around px-4 pb-4 pt-8">
                            {[40, 70, 45, 90, 65, 80, 55].map((height, i) => (
                                <div key={i} className="group relative flex flex-col items-center gap-2">
                                    <div
                                        className="w-4 bg-primary/20 hover:bg-primary transition-all rounded-t-sm"
                                        style={{ height: `${height}%` }}
                                    />
                                    <span className="text-[8px] font-bold text-muted-foreground uppercase">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Transactions */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Recent Transactions</h3>
                    {loading ? (
                        <div className="py-8 text-center text-muted-foreground">Loading...</div>
                    ) : recentEarnings.length === 0 ? (
                        <p className="py-10 text-center text-muted-foreground font-medium">No earnings recorded yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {recentEarnings.map((item) => (
                                <Card key={item._id} className="border-border/50 active:scale-[0.98] transition-transform">
                                    <CardContent className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                                <IndianRupee className="w-5 h-5 text-primary" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-foreground">Ride Payment</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground font-bold">{formatDate(item.date)}</span>
                                                    <div className="w-1 h-1 rounded-full bg-border" />
                                                    <span className="text-[10px] text-muted-foreground font-bold">{item.rideId?.dropoffLocation.address.split(',')[0]}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-success">+{item.amount}</span>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

const Badge = ({ children, className, variant = "outline" }: any) => (
    <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
        {children}
    </div>
);

export default DriverEarnings;
