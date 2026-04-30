import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Settings, LogOut, ChevronRight, Shield, Bell, HelpCircle, Star, Car, Award } from 'lucide-react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { clearAuth, getUser } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';

const DriverProfile: React.FC = () => {
    const navigate = useNavigate();
    const user = getUser();

    const handleLogout = () => {
        clearAuth();
        toast({
            title: "Logged out",
            description: "You have been successfully logged out."
        });
        navigate('/');
    };

    if (!user) return null;

    const driverInfo = user.driverInfo || {};

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
                        <p className="text-muted-foreground font-medium uppercase tracking-wider text-xs">Professional Driver</p>
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
                            <p className="text-xl font-bold text-primary">0</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Years</p>
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
                                { icon: Mail, label: 'Email', value: user.email || 'Add email address' },
                            ].map((item, idx) => (
                                <div key={idx} className={`flex items-center gap-4 p-4 ${idx !== 0 ? 'border-t border-border/50' : ''}`}>
                                    <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                                        <item.icon className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">{item.label}</p>
                                        <p className="text-sm font-semibold text-foreground">{item.value}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-primary" />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* App Settings */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">Preferences</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: Bell, label: 'Ride Notifications', color: 'text-blue-500' },
                                { icon: Settings, label: 'Duty Settings', color: 'text-gray-500' },
                                { icon: HelpCircle, label: 'Driver Support', color: 'text-orange-500' },
                            ].map((item, idx) => (
                                <button key={idx} className={`w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${idx !== 0 ? 'border-t border-border/50' : ''}`}>
                                    <div className={`w-10 h-10 bg-muted rounded-xl flex items-center justify-center`}>
                                        <item.icon className={`w-5 h-5 ${item.color}`} />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </button>
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
