import { getApiOrigin } from '@/lib/apiOrigin';
import { getAuthToken } from '@/lib/auth';

export interface EmergencyContact {
    _id?: string;
    name: string;
    phone: string;
    relationship?: string;
}

export interface ShareLink {
    token: string;
    url: string;
    expiresAt: string | null;
}

/** Generate (or refresh) the public share URL for a given ride. Requires passenger JWT. */
export async function requestShareLink(rideId: string): Promise<ShareLink> {
    const token = getAuthToken('passenger');
    if (!token) throw new Error('You must be signed in to share a trip');
    const res = await fetch(`${getApiOrigin()}/api/rides/${rideId}/share-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || `Could not generate share link (HTTP ${res.status})`);
    }
    return data as ShareLink;
}

/** Normalise an Indian mobile number into the 10-digit form `wa.me` accepts after the `91` prefix. */
export function normalizePhoneForWa(raw: string): string {
    const digits = (raw || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits.slice(-10);
}

/** Build a `wa.me` deep-link. With a phone, opens the chat directly; without, opens contact picker. */
export function buildWhatsAppUrl(message: string, phone?: string): string {
    const text = encodeURIComponent(message);
    if (phone) {
        const local = normalizePhoneForWa(phone);
        if (local.length === 10) {
            return `https://wa.me/91${local}?text=${text}`;
        }
    }
    return `https://wa.me/?text=${text}`;
}

/** Open WhatsApp with a pre-filled trip-share message. */
export function shareTripViaWhatsApp(url: string, opts: { phone?: string; message?: string } = {}) {
    const message = opts.message || `I'm sharing my live trip with you: ${url}`;
    window.open(buildWhatsAppUrl(message, opts.phone), '_blank', 'noopener,noreferrer');
}

/** Fan-out SOS: dial 112 in the same gesture, then open a WhatsApp tab per contact. */
export function fireSosFanout(opts: {
    contacts: EmergencyContact[];
    message: string;
    dialEmergency?: boolean;
}) {
    const { contacts, message, dialEmergency = true } = opts;
    // Open per-contact WhatsApp tabs first (staggered to dodge popup blockers).
    const safeContacts = (contacts || []).slice(0, 5);
    safeContacts.forEach((c, i) => {
        setTimeout(() => {
            try {
                window.open(buildWhatsAppUrl(message, c.phone), '_blank', 'noopener,noreferrer');
            } catch {
                /* swallowed: nothing actionable */
            }
        }, i * 200);
    });
    // Then place the 112 call (tel: navigates current tab — do this last so it's the foreground action).
    if (dialEmergency) {
        // setTimeout 0 lets the popups dispatch before navigation hijacks the tab.
        setTimeout(() => {
            window.location.href = 'tel:112';
        }, Math.max(safeContacts.length * 200 + 50, 50));
    }
}

// ---- Emergency contacts CRUD helpers --------------------------------------

export async function fetchEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
    const token = getAuthToken('passenger');
    if (!token) return [];
    const id = encodeURIComponent(String(userId));
    const res = await fetch(`${getApiOrigin()}/api/users/${id}/emergency-contacts`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Could not load contacts (HTTP ${res.status})`);
    return (data?.contacts || []) as EmergencyContact[];
}

export async function addEmergencyContact(
    userId: string,
    payload: { name: string; phone: string; relationship?: string }
): Promise<EmergencyContact[]> {
    const token = getAuthToken('passenger');
    if (!token) throw new Error('You must be signed in');
    const id = encodeURIComponent(String(userId));
    const res = await fetch(`${getApiOrigin()}/api/users/${id}/emergency-contacts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Could not save contact (HTTP ${res.status})`);
    return (data?.contacts || []) as EmergencyContact[];
}

export async function deleteEmergencyContact(userId: string, contactId: string): Promise<EmergencyContact[]> {
    const token = getAuthToken('passenger');
    if (!token) throw new Error('You must be signed in');
    const id = encodeURIComponent(String(userId));
    const res = await fetch(
        `${getApiOrigin()}/api/users/${id}/emergency-contacts/${encodeURIComponent(String(contactId))}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Could not delete contact (HTTP ${res.status})`);
    return (data?.contacts || []) as EmergencyContact[];
}
