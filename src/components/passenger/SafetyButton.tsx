import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Phone, Share2, X, AlertTriangle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter
} from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { getUser } from '@/lib/auth';
import {
    requestShareLink,
    shareTripViaWhatsApp,
    fireSosFanout,
    fetchEmergencyContacts,
    type EmergencyContact
} from '@/lib/safetyActions';

interface SafetyButtonProps {
    /** Required for share + SOS — both attach the live trip URL. */
    rideId?: string;
    /** Used to build the SOS message; falls back to "your friend". */
    passengerName?: string;
    driverName?: string | null;
    vehicleNumber?: string | null;
}

const SafetyButton: React.FC<SafetyButtonProps> = ({
    rideId,
    passengerName,
    driverName,
    vehicleNumber
}) => {
    const { t } = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [sosOpen, setSosOpen] = useState(false);
    const [contacts, setContacts] = useState<EmergencyContact[]>([]);
    const [contactsLoaded, setContactsLoaded] = useState(false);
    const [working, setWorking] = useState(false);

    const user = getUser('passenger');

    // Lazy-load contacts on first open so we know if we can fan-out SOS.
    useEffect(() => {
        if (!isExpanded || contactsLoaded || !user?._id) return;
        void (async () => {
            try {
                const next = await fetchEmergencyContacts(user._id);
                setContacts(next);
            } catch (e: any) {
                console.warn('[SafetyButton] load contacts failed:', e?.message || e);
            } finally {
                setContactsLoaded(true);
            }
        })();
    }, [isExpanded, contactsLoaded, user?._id]);

    const ensureRide = (): string | null => {
        if (!rideId) {
            toast({
                title: t('share_no_ride_title', 'No active trip'),
                description: t('share_no_ride_desc', 'You can share live location once a ride starts.'),
                variant: 'destructive'
            });
            return null;
        }
        return rideId;
    };

    const handleShareIntent = async () => {
        setIsExpanded(false);
        const id = ensureRide();
        if (!id) return;
        // If we have saved contacts, let the user pick one for a single-tap send.
        if (contacts.length > 0) {
            setPickerOpen(true);
        } else {
            await openWhatsApp();
        }
    };

    const openWhatsApp = async (contact?: EmergencyContact) => {
        const id = ensureRide();
        if (!id) return;
        setWorking(true);
        try {
            const link = await requestShareLink(id);
            const message = `${t('share_wa_intro', "I'm sharing my live trip with you.")} ${link.url}`;
            shareTripViaWhatsApp(link.url, { phone: contact?.phone, message });
            setPickerOpen(false);
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not generate share link',
                variant: 'destructive'
            });
        } finally {
            setWorking(false);
        }
    };

    const handleSosIntent = () => {
        setIsExpanded(false);
        if (!ensureRide()) return;
        setSosOpen(true);
    };

    const confirmSos = async () => {
        const id = ensureRide();
        if (!id) return;
        setWorking(true);
        try {
            const link = await requestShareLink(id);
            const name = passengerName || user?.name || t('share_someone', 'A friend');
            const vehBit = vehicleNumber ? ` ${t('share_auto', 'Auto')} ${vehicleNumber}` : '';
            const driverBit = driverName ? `, ${t('driver', 'driver')} ${driverName}` : '';
            const msg = `[SOS] ${name} ${t('sos_needs_help', 'needs help right now.')} ${t(
                'share_wa_live_at',
                'Live location:'
            )} ${link.url}.${vehBit}${driverBit}`;

            fireSosFanout({ contacts, message: msg });
            setSosOpen(false);
            toast({
                title: t('sos_fired_title', 'SOS triggered'),
                description: contacts.length
                    ? t('sos_fired_desc', {
                          count: contacts.length,
                          defaultValue: `Opening WhatsApp for ${contacts.length} contact(s) and dialing 112.`
                      })
                    : t('sos_fired_no_contacts', 'Dialing 112. Add emergency contacts to alert them too.'),
                variant: 'destructive'
            });
        } catch (e: any) {
            toast({
                title: t('error', 'Error'),
                description: e?.message || 'Could not trigger SOS',
                variant: 'destructive'
            });
        } finally {
            setWorking(false);
        }
    };

    return (
        <>
            <div className="fixed bottom-24 right-4 z-50">
                {isExpanded && (
                    <div className="absolute bottom-20 right-0 animate-fade-in">
                        <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-3 space-y-2 min-w-[220px] shadow-xl">
                            <button
                                onClick={handleShareIntent}
                                disabled={working}
                                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-primary/10 transition-colors text-left disabled:opacity-60"
                            >
                                <div className="w-10 h-10 bg-primary/15 backdrop-blur-md rounded-full flex items-center justify-center border border-primary/30">
                                    <Share2 className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">
                                        {t('share_live_location', 'Share live location')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('share_via_whatsapp', 'Via WhatsApp')}
                                    </p>
                                </div>
                            </button>

                            <button
                                onClick={handleSosIntent}
                                disabled={working}
                                className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-destructive/10 transition-colors text-left disabled:opacity-60"
                            >
                                <div className="w-10 h-10 bg-destructive/15 backdrop-blur-md rounded-full flex items-center justify-center border border-destructive/30">
                                    <AlertTriangle className="w-5 h-5 text-destructive" />
                                </div>
                                <div>
                                    <p className="font-semibold text-destructive">
                                        {t('sos', 'SOS')}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('sos_short_desc', 'Alert contacts + dial 112')}
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                <Button
                    variant="safety"
                    size="iconXl"
                    onClick={() => setIsExpanded((v) => !v)}
                    className="relative"
                    aria-label={t('safety_button_label', 'Safety options')}
                >
                    {isExpanded ? <X className="w-7 h-7" /> : <Shield className="w-7 h-7" />}
                    {!isExpanded && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full animate-pulse-gentle" />
                    )}
                </Button>
            </div>

            {/* Contact picker for share */}
            <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
                <SheetContent side="bottom" className="rounded-t-3xl border-border/60 bg-card/80 backdrop-blur-xl">
                    <SheetHeader>
                        <SheetTitle>{t('share_pick_contact', 'Send to which contact?')}</SheetTitle>
                        <SheetDescription>
                            {t(
                                'share_pick_contact_desc',
                                'Tap a saved contact for a one-tap send, or pick from WhatsApp.'
                            )}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
                        {contacts.map((c) => (
                            <button
                                key={c._id || c.phone}
                                onClick={() => openWhatsApp(c)}
                                disabled={working}
                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/40 backdrop-blur-md hover:bg-primary/10 transition-colors disabled:opacity-60 text-left"
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
                                </div>
                                <Share2 className="w-4 h-4 text-primary flex-shrink-0" />
                            </button>
                        ))}

                        <button
                            onClick={() => openWhatsApp()}
                            disabled={working}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/10 backdrop-blur-md hover:bg-primary/15 transition-colors disabled:opacity-60 text-left"
                        >
                            <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center border border-primary/30">
                                <Users className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-foreground">
                                    {t('share_pick_anyone', 'Pick from WhatsApp')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t('share_pick_anyone_desc', 'Send to anyone in your chat list')}
                                </p>
                            </div>
                        </button>
                    </div>
                </SheetContent>
            </Sheet>

            {/* SOS confirm */}
            <Sheet open={sosOpen} onOpenChange={setSosOpen}>
                <SheetContent side="bottom" className="rounded-t-3xl border-border/60 bg-card/80 backdrop-blur-xl">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                            {t('sos_confirm_title', 'Trigger SOS?')}
                        </SheetTitle>
                        <SheetDescription>
                            {contacts.length > 0
                                ? t('sos_confirm_desc', {
                                      count: contacts.length,
                                      defaultValue: `This will dial 112 and message your ${contacts.length} emergency contact(s) with your live location.`
                                  })
                                : t(
                                      'sos_confirm_no_contacts',
                                      'This will dial 112. Add emergency contacts in Safety Center so they get notified next time.'
                                  )}
                        </SheetDescription>
                    </SheetHeader>

                    <SheetFooter className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-2">
                        <Button
                            variant="outline"
                            className="rounded-xl h-12 border-border/60 bg-background/40 backdrop-blur-md"
                            onClick={() => setSosOpen(false)}
                        >
                            {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            className="rounded-xl h-12 font-bold"
                            disabled={working}
                            onClick={confirmSos}
                        >
                            <Phone className="w-4 h-4 mr-1" />
                            {working ? t('please_wait', 'Please wait…') : t('sos_send', 'Send SOS')}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </>
    );
};

export default SafetyButton;
