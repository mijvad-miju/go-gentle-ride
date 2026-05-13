import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, LogOut, Shield, Star, Car, Award, MapPin, CreditCard, Calendar, BadgeCheck, FileText } from 'lucide-react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { clearAuth, getAuthHeaders, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import { toast } from '@/hooks/use-toast';

const DriverProfile: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(getUser('driver'));
    const [loading, setLoading] = useState(true);

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
    const bank = driverInfo.bankDetails || {};

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
                <div className="grid grid-cols-3 gap-3">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-3 text-center">
                            <p className="text-xl font-bold text-primary flex items-center justify-center gap-1">
                                {driverInfo.rating || '0.0'}
                                <Star className="w-3 h-3 fill-primary" />
                            </p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Rating</p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-3 text-center">
                            <p className="text-xl font-bold text-primary">{driverInfo.totalRides || 0}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Rides</p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-3 text-center">
                            <p className={`text-xs font-bold ${driverInfo.isVerified ? 'text-success' : 'text-muted-foreground'}`}>
                                {driverInfo.isVerified ? 'Verified' : 'Pending'}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">KYC</p>
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
                                { icon: BadgeCheck, label: 'Trusted Driver', value: driverInfo.isTrusted ? 'Yes' : 'No' },
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

                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">KYC Details</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: FileText, label: 'Aadhar Number', value: safe(driverInfo.aadharNumber) },
                                { icon: FileText, label: 'PAN Number', value: safe(driverInfo.panNumber) },
                                { icon: Shield, label: 'Verification Status', value: driverInfo.isVerified ? 'Verified' : 'Not Verified' },
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

                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Bank Details</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: CreditCard, label: 'Account Number', value: safe(bank.accountNumber) },
                                { icon: Shield, label: 'IFSC Code', value: safe(bank.ifscCode) },
                                { icon: Award, label: 'Bank Name', value: safe(bank.bankName) },
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
