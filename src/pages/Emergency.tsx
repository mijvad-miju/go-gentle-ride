import React, { useEffect, useState } from 'react';
import { Phone, Share2, MapPin, Shield, X, AlertTriangle, Plus, Trash2, MessageCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter
} from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { getUser, getAuthToken } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';
import {
    fetchEmergencyContacts,
    addEmergencyContact,
    deleteEmergencyContact,
    requestShareLink,
    shareTripViaWhatsApp,
    buildWhatsAppUrl,
    type EmergencyContact
} from '@/lib/safetyActions';

const Emergency: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const user = getUser('passenger');

    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(true);

    const [addOpen, setAddOpen] = useState(false);
    const [addName, setAddName] = useState('');
    const [addPhone, setAddPhone] = useState('');
    const [addRelationship, setAddRelationship] = useState('');
    const [adding, setAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [activeRideId, setActiveRideId] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        if (!user?._id) {
            setLoadingContacts(false);
            return;
        }
        void (async () => {
            try {
                const list = await fetchEmergencyContacts(String(user._id));
                setContacts(list);
            } catch (e: any) {
                toast({
                    title: t('error', 'Error'),
                    description: e?.message || 'Could not load emergency contacts',
                    variant: 'destructive'
                });
            } finally {
                setLoadingContacts(false);
            }
        })();
    }, [user?._id, t]);

    // Detect any active ride so the "Share my location" button defaults to the live trip URL.
    useEffect(() => {
        if (!user?._id) return;
        void (async () => {
            try {
                const res = await fetch(`${getApiOrigin()}/api/rides/user/${user._id}`, {
                    headers: { Authorization: `Bearer ${getAuthToken('passenger')}` }
                });
                if (!res.ok) return;
                const rides = await res.json();
                const active = (rides || []).find((r: any) =>
                    ['pending', 'scheduled', 'accepted', 'arriving', 'in_progress'].includes(r.status)
                );
                if (active?._id) setActiveRideId(String(active._id));
            } catch (e) {
                console.warn('[Emergency] active ride lookup failed:', e);
            }
        })();
    }, [user?._id]);

    const handleAdd = async () => {
        if (!user?._id) {
            toast({
                title: t('error', 'Error'),
                description: 'Please sign in again to save contacts.',
                variant: 'destructive'
            });
            return;
        }
        if (!addName.trim() || !addPhone.trim()) {
            toast({
                title: t('error', 'Error'),
                description: t('emergency_contact_invalid', 'Enter a name and Indian mobile number'),
                variant: 'destructive'
            });
            return;
        }
        setAdding(true);
        try {
            const phonePayload = addPhone.replace(/\s/g, '').trim();
            const next = await addEmergencyContact(String(user._id), {
                name: addName.trim(),
                phone: phonePayload,
                relationship: addRelationship.trim() || undefined
            });
            setContacts(next);
            setAddOpen(false);
            setAddName('');
            setAddPhone('');
            setAddRelationship('');
            toast({
                title: t('emergency_contact_added', 'Contact saved'),
                description: t('emergency_contact_added_desc', 'They will be alerted on SOS.')
            });
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not save contact',
                variant: 'destructive'
            });
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (id?: string) => {
        if (!user?._id || !id) return;
        setDeletingId(id);
        try {
            const next = await deleteEmergencyContact(String(user._id), id);
            setContacts(next);
            toast({
                title: t('emergency_contact_removed', 'Contact removed')
            });
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not delete contact',
                variant: 'destructive'
            });
        } finally {
            setDeletingId(null);
        }
    };

    const getFreshCoords = (): Promise<{ lat: number; lng: number; accuracy: number }> =>
        new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error(t('geolocation_unavailable', 'Location is not available on this device')));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) =>
                    resolve({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: pos.coords.accuracy
                    }),
                (err) => {
                    // Translate the W3C error codes into something users can act on.
                    if (err.code === err.PERMISSION_DENIED) {
                        reject(
                            new Error(
                                t(
                                    'geolocation_denied',
                                    'Location permission was blocked. Enable it for this site in your browser settings.'
                                )
                            )
                        );
                    } else if (err.code === err.POSITION_UNAVAILABLE) {
                        reject(
                            new Error(
                                t(
                                    'geolocation_unavailable_now',
                                    'Could not read your current location. Move to an open area and try again.'
                                )
                            )
                        );
                    } else if (err.code === err.TIMEOUT) {
                        reject(
                            new Error(
                                t('geolocation_timeout', 'Location request timed out. Try again.')
                            )
                        );
                    } else {
                        reject(new Error(err.message || 'Could not read location'));
                    }
                },
                // maximumAge: 0 forces a fresh fix instead of a possibly-stale cached one.
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });

    const shareViaWhatsApp = async (contact?: EmergencyContact) => {
        setSharing(true);
        try {
            // Always read the device's current GPS so we share a real-time pin —
            // never the ride pickup/dropoff or a stale cached fix.
            const coords = await getFreshCoords();
            const mapsUrl = `https://www.google.com/maps?q=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`;

            // If there is an active ride, ALSO include the live trip link so the
            // recipient gets continuous driver-position updates on top of the pin.
            let tripUrl: string | null = null;
            if (activeRideId) {
                try {
                    const link = await requestShareLink(activeRideId);
                    tripUrl = link.url;
                } catch (e) {
                    console.warn('[Emergency] could not fetch trip share link:', e);
                }
            }

            const parts = [
                `${t('share_wa_intro_static', "Here's my current location:")} ${mapsUrl}`
            ];
            if (tripUrl) {
                parts.push(`${t('share_wa_live_at', 'Live trip:')} ${tripUrl}`);
            }
            const message = parts.join('\n');
            window.open(buildWhatsAppUrl(message, contact?.phone), '_blank', 'noopener,noreferrer');
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not share location',
                variant: 'destructive'
            });
        } finally {
            setSharing(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b border-border/40 backdrop-blur-xl bg-background/60 pt-safe-top sticky top-0 z-20">
                <div className="flex items-center justify-between h-16 px-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <X className="w-5 h-5" />
                    </Button>
                    <h1 className="text-lg font-bold text-foreground">{t('safety_center', 'Safety Center')}</h1>
                    <div className="w-12" />
                </div>
            </header>

            <div className="flex-1 px-4 py-6 space-y-6 pb-safe-bottom">
                {/* Intro */}
                <div className="rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-xl p-5">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-primary/15 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/30">
                            <AlertTriangle className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">{t('need_help', 'Need help?')}</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {t(
                                    'emergency_need_help_body',
                                    'Reach emergency services or alert your saved contacts in one tap.'
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Dial 112 */}
                <a href="tel:112" className="block">
                    <Button variant="destructive" className="w-full h-20 text-xl font-bold rounded-2xl">
                        <Phone className="w-7 h-7 mr-3" />
                        {t('emergency_call_112', 'Call 112')}
                    </Button>
                </a>

                {/* Share live location */}
                <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary/15 rounded-full flex items-center justify-center border border-primary/30">
                            <Share2 className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-foreground">
                                {t('share_live_location', 'Share live location')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {activeRideId
                                    ? t(
                                          'emergency_share_location_sub_live',
                                          'Send your current GPS pin + live trip link via WhatsApp'
                                      )
                                    : t(
                                          'emergency_share_location_sub',
                                          'Send your current GPS pin via WhatsApp'
                                      )}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="touchOutline"
                        className="w-full"
                        onClick={() => shareViaWhatsApp()}
                        disabled={sharing}
                    >
                        {sharing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>{t('sharing', 'Sharing…')}</span>
                            </>
                        ) : (
                            <>
                                <MapPin className="w-5 h-5" />
                                <span>{t('share_my_location', 'Share my location')}</span>
                            </>
                        )}
                    </Button>
                </div>

                {/* Emergency contacts */}
                <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-foreground">{t('emergency_contacts', 'Emergency contacts')}</h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddOpen(true)}
                            disabled={contacts.length >= 5}
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            {t('add', 'Add')}
                        </Button>
                    </div>

                    {loadingContacts ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        </div>
                    ) : contacts.length === 0 ? (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {t(
                                    'emergency_contacts_empty',
                                    'Save up to 5 contacts. They will receive your live trip link when you tap SOS.'
                                )}
                            </p>
                            <Button
                                type="button"
                                variant="touchOutline"
                                className="w-full rounded-xl border-primary/30 bg-primary/10 backdrop-blur-md"
                                onClick={() => setAddOpen(true)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('add_emergency_contact', 'Add emergency contact')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {contacts.map((c) => {
                                const id = c._id;
                                return (
                                    <div
                                        key={id || c.phone}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-background/40 backdrop-blur-md"
                                    >
                                        <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center border border-primary/30">
                                            <span className="text-sm font-bold text-primary">
                                                {c.name?.[0]?.toUpperCase() || '?'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-foreground truncate">{c.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono truncate">
                                                +91 {c.phone}
                                            </p>
                                            {c.relationship && (
                                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold mt-0.5">
                                                    {c.relationship}
                                                </p>
                                            )}
                                        </div>
                                        <a
                                            href={`tel:+91${c.phone}`}
                                            className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                                            aria-label={t('call', 'Call')}
                                        >
                                            <Phone className="w-4 h-4" />
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => shareViaWhatsApp(c)}
                                            disabled={sharing}
                                            className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                                            aria-label={t('share_via_whatsapp', 'Via WhatsApp')}
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(id)}
                                            disabled={!id || deletingId === id}
                                            className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                                            aria-label={t('delete', 'Delete')}
                                        >
                                            {deletingId === id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {contacts.length >= 5 && (
                        <p className="text-[11px] text-muted-foreground">
                            {t('emergency_contact_max', 'You can save up to 5 contacts.')}
                        </p>
                    )}
                </div>

                {/* Safety tips */}
                <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 space-y-4">
                    <div className="flex items-center gap-3">
                        <Shield className="w-6 h-6 text-primary" />
                        <h3 className="font-bold text-foreground">{t('safety_tips', 'Safety tips')}</h3>
                    </div>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                            <span>{t('safety_tip_verify_driver', 'Verify driver and vehicle before getting in.')}</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                            <span>{t('safety_tip_share_trip', 'Share your live trip with a trusted contact.')}</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                            <span>{t('safety_tip_trusted', 'Use the SOS button if anything feels off.')}</span>
                        </li>
                    </ul>
                </div>
            </div>

            {/* Add contact sheet */}
            <Sheet open={addOpen} onOpenChange={setAddOpen}>
                <SheetContent
                    side="bottom"
                    className="rounded-t-3xl border-border/60 bg-card/80 backdrop-blur-xl"
                >
                    <SheetHeader>
                        <SheetTitle>{t('add_emergency_contact', 'Add emergency contact')}</SheetTitle>
                        <SheetDescription>
                            {t(
                                'add_emergency_contact_desc',
                                'They will be alerted on WhatsApp when you tap SOS.'
                            )}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="ec-name">{t('full_name', 'Full name')}</Label>
                            <Input
                                id="ec-name"
                                value={addName}
                                onChange={(e) => setAddName(e.target.value)}
                                placeholder="Mom / Dad / Sister…"
                                maxLength={50}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ec-phone">{t('phone_number', 'Phone number')}</Label>
                            <Input
                                id="ec-phone"
                                inputMode="tel"
                                value={addPhone}
                                onChange={(e) => setAddPhone(e.target.value.replace(/[^\d+]/g, ''))}
                                placeholder="9876543210 or +919876543210"
                                maxLength={16}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                {t('phone_indian_hint', '10-digit Indian mobile number (starts 6–9)')}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ec-rel">{t('relationship_optional', 'Relationship (optional)')}</Label>
                            <Input
                                id="ec-rel"
                                value={addRelationship}
                                onChange={(e) => setAddRelationship(e.target.value)}
                                placeholder="Mom"
                                maxLength={30}
                            />
                        </div>
                    </div>

                    <SheetFooter className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-2">
                        <Button
                            variant="outline"
                            className="rounded-xl h-12 border-border/60 bg-background/40 backdrop-blur-md"
                            onClick={() => setAddOpen(false)}
                        >
                            {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="touch"
                            className="rounded-xl h-12 font-bold"
                            disabled={adding}
                            onClick={handleAdd}
                        >
                            {adding ? t('please_wait', 'Please wait…') : t('save', 'Save')}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
};

export default Emergency;
