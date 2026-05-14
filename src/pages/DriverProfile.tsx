import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Mail, Phone, LogOut, Shield, Car, Award, MapPin, Calendar, ShieldCheck } from 'lucide-react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { clearAuth, getAuthHeaders, getUser, updateStoredUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import { toast } from '@/hooks/use-toast';
import GenderCardGroup, { GenderValue } from '@/components/common/GenderCardGroup';

const DriverProfile: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [user, setUser] = useState(getUser('driver'));
    const [loading, setLoading] = useState(true);
    const [savingPref, setSavingPref] = useState(false);

    useEffect(() => {
        const fetchLatestProfile = async () => {
            const localUser = getUser('driver');
            if (!localUser?._id) {
                setLoading(false);
                return;
            }

            try {
                const API_URL = getApiOrigin();
                const response = await fetch(`${API_URL}/api/users/${localUser._id}`, {
                    headers: getAuthHeaders('driver')
                });

                if (response.ok) {
                    const freshUser = await response.json();
                    setUser(freshUser);
                } else {
                    setUser(localUser);
                }
            } catch (error) {
                setUser(localUser);
            } finally {
                setLoading(false);
            }
        };

        fetchLatestProfile();
    }, []);

    const handleLogout = () => {
        clearAuth('driver');
        toast({
            title: "Logged out",
            description: "You have been successfully logged out."
        });
        navigate('/driver/login');
    };

    const handleSavePassengerPref = async (value: GenderValue) => {
        if (!user) return;
        setSavingPref(true);
        try {
            const res = await fetch(`${getApiOrigin()}/api/users/${user._id}/safety-prefs`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferredPassengerGender: value })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Could not save preference');
            const next = updateStoredUser({ preferredPassengerGender: value });
            if (next) setUser(next);
            toast({ title: t('saved', 'Saved'), description: t('safety_pref_saved', 'Safety preference updated') });
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not save',
                variant: 'destructive'
            });
        } finally {
            setSavingPref(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) return null;

    const driverInfo = user.driverInfo || {};
    const address = user.address || {};

    const safe = (value?: string | number | null) => {
        if (value === null || value === undefined || value === '') return 'Not provided';
        return String(value);
    };

    const joinedOn = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }) : 'Not available';

    return (
        <div className="flex-1 flex flex-col bg-background">
            <Header title="Driver Profile" showMenu={false} />

            <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto pb-24">
                {/* Profile Header */}
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className="relative">
                        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center border-4 border-background shadow-xl">
                            {user.profilePhoto ? (
                                <img src={user.profilePhoto} alt={user.name} className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <User className="w-12 h-12 text-primary" />
                            )}
                        </div>
                        {driverInfo.isTrusted && (
                            <div className="absolute -bottom-1 -right-1 bg-success text-white p-1.5 rounded-full border-2 border-background">
                                <Award className="w-4 h-4" />
                            </div>
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
                        <p className="text-muted-foreground font-medium uppercase tracking-wider text-xs">
                            {user.gender ? `${user.gender} Driver` : 'Professional Driver'}
                        </p>
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="flex justify-center">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm w-full max-w-xs">
                        <CardContent className="p-3 text-center">
                            <p className="text-xl font-bold text-primary">{driverInfo.totalRides || 0}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Rides</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Vehicle Details */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Vehicle & License</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: Car, label: 'Vehicle Number', value: driverInfo.vehicleNumber || 'N/A' },
                                { icon: Shield, label: 'License Number', value: driverInfo.licenseNumber || 'N/A' },
                                { icon: Award, label: 'Vehicle Type', value: driverInfo.vehicleType?.toUpperCase() || 'AUTO' },
                            ].map((item, idx) => (
                                <div key={idx} className={`flex items-center gap-4 p-4 ${idx !== 0 ? 'border-t border-border/50' : ''}`}>
                                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                        <item.icon className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{item.label}</p>
                                        <p className="text-sm font-semibold text-foreground">{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Account Details */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Personal Info</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: Phone, label: 'Phone', value: user.phone },
                                { icon: Mail, label: 'Email', value: safe(user.email) },
                                { icon: User, label: 'Gender', value: safe(user.gender) },
                                { icon: Calendar, label: 'Joined On', value: joinedOn },
                            ].map((item, idx) => (
                                <div key={idx} className={`flex items-center gap-4 p-4 ${idx !== 0 ? 'border-t border-border/50' : ''}`}>
                                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                        <item.icon className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{item.label}</p>
                                        <p className="text-sm font-semibold text-foreground">{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Passenger preference (lady-safety) */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        {t('prefer_passenger_gender_title', 'Passenger preference')}
                    </h3>
                    <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                        <CardContent className="p-4 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {t(
                                    'prefer_gender_note_driver',
                                    'Only passengers matching this preference will see your availability.'
                                )}
                            </p>
                            <GenderCardGroup
                                value={(user.preferredPassengerGender ?? 'any') as GenderValue}
                                onChange={handleSavePassengerPref}
                                options={['female', 'male', 'any']}
                                disabled={savingPref}
                            />
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Address</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: MapPin, label: 'Street', value: safe(address.street) },
                                { icon: MapPin, label: 'City', value: safe(address.city) },
                                { icon: MapPin, label: 'State', value: safe(address.state) },
                                { icon: MapPin, label: 'Pincode', value: safe(address.pincode) },
                                { icon: MapPin, label: 'Full Address', value: safe(address.fullAddress) },
                            ].map((item, idx) => (
                                <div key={idx} className={`flex items-center gap-4 p-4 ${idx !== 0 ? 'border-t border-border/50' : ''}`}>
                                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                        <item.icon className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{item.label}</p>
                                        <p className="text-sm font-semibold text-foreground">{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Logout Button */}
                <Button
                    variant="outline"
                    className="w-full h-14 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold rounded-2xl gap-3"
                    onClick={handleLogout}
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </Button>

                <p className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] pt-4">
                    AutoRide Partner v1.0.0
                </p>
            </main>
        </div>
    );
};

export default DriverProfile;
