import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Mail, Phone, Settings as SettingsIcon, LogOut, ChevronRight, ShieldCheck, Shield, Bell } from 'lucide-react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { clearAuth, getUser, updateStoredUser } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';
import { getApiOrigin } from '@/lib/apiOrigin';
import GenderCardGroup, { GenderValue } from '@/components/common/GenderCardGroup';

const Profile: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const initialUser = getUser('passenger');
    const [user, setUser] = useState(initialUser);
    const [savingPref, setSavingPref] = useState<null | 'gender' | 'driverPref'>(null);

    const handleLogout = () => {
        clearAuth('passenger');
        toast({
            title: t('sign_out'),
            description: t('sign_out')
        });
        navigate('/passenger/login');
    };

    const persistSafetyPref = async (
        kind: 'gender' | 'driverPref',
        payload: { gender?: GenderValue; preferredDriverGender?: GenderValue }
    ) => {
        if (!user) return;
        setSavingPref(kind);
        try {
            const res = await fetch(`${getApiOrigin()}/api/users/${user._id}/safety-prefs`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Could not save preference');

            const next = updateStoredUser(payload as Partial<typeof user>);
            if (next) setUser(next);
            toast({ title: t('saved', 'Saved'), description: t('safety_pref_saved', 'Safety preference updated') });
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not save',
                variant: 'destructive'
            });
        } finally {
            setSavingPref(null);
        }
    };

    if (!user) return null;

    return (
        <div className="flex-1 flex flex-col bg-background">
            <Header title={t('my_profile')} showMenu={false} />

            <main className="flex-1 px-4 py-6 space-y-6 overflow-y-auto pb-24">
                {/* Profile Header */}
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center border-4 border-background shadow-xl">
                        {user.profilePhoto ? (
                            <img src={user.profilePhoto} alt={user.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <User className="w-12 h-12 text-primary" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground">{user.name}</h2>
                        <p className="text-muted-foreground font-medium">{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</p>
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-4">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold text-primary">0</p>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t('total_rides')}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold text-primary">0.0</p>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t('rating')}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Account Details */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">{t('account_info')}</h3>
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
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-tighter">{item.label}</p>
                                        <p className="text-sm font-semibold text-foreground">{item.value}</p>
                                    </div>
                                    <div className="text-primary">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Safety preference (lady-safety) */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        {t('prefer_driver_gender_title', 'Safety preference')}
                    </h3>
                    <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                        <CardContent className="p-4 space-y-4">
                            {!user.gender && (
                                <div className="rounded-xl border border-primary/30 bg-primary/10 backdrop-blur-md p-3">
                                    <p className="text-xs font-semibold text-foreground mb-2">
                                        {t('gender_required_label', 'Set your gender first')}
                                    </p>
                                    <GenderCardGroup
                                        value={(user.gender ?? null) as GenderValue | null}
                                        onChange={(v) => persistSafetyPref('gender', { gender: v })}
                                        options={['female', 'male', 'other']}
                                        size="sm"
                                        disabled={savingPref === 'gender'}
                                    />
                                </div>
                            )}

                            <div>
                                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                                    {t(
                                        'prefer_gender_note_passenger',
                                        "We'll match you with this driver gender first. You can expand search later if none are available."
                                    )}
                                </p>
                                <GenderCardGroup
                                    value={(user.preferredDriverGender ?? 'any') as GenderValue}
                                    onChange={(v) => persistSafetyPref('driverPref', { preferredDriverGender: v })}
                                    options={['female', 'male', 'any']}
                                    disabled={savingPref === 'driverPref'}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Safety Center — emergency contacts, 112, share location (see /emergency) */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        {t('safety_center')}
                    </h3>
                    <Card className="border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => navigate('/emergency')}
                            className="w-full flex items-center gap-4 p-4 text-left hover:bg-primary/5 transition-colors"
                        >
                            <div className="w-10 h-10 bg-primary/15 rounded-xl flex items-center justify-center border border-primary/30">
                                <Shield className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">{t('safety_center')}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                    {t(
                                        'safety_center_profile_hint',
                                        'Add emergency contacts, call 112, and share your live trip or location.'
                                    )}
                                </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        </button>
                    </Card>
                </div>

                {/* App Settings */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest px-1">{t('settings')}</h3>
                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            {[
                                { icon: Bell, label: t('notifications_settings'), color: 'text-blue-500' },
                                { icon: SettingsIcon, label: t('settings'), color: 'text-gray-500', path: '/passenger/settings' },
                            ].map((item, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => item.path && navigate(item.path)}
                                    className={`w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${idx !== 0 ? 'border-t border-border/50' : ''}`}
                                >
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
                    {t('sign_out')}
                </Button>

                <p className="text-center text-[10px] text-muted-foreground font-medium uppercase tracking-[0.2em] pt-4">
                    AutoRide v1.0.0
                </p>
            </main>
        </div>
    );
};

export default Profile;
