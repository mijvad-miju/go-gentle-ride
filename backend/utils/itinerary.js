// Multi-waypoint routing + fare helpers for multi-stop itineraries.
// Reuses the public OSRM demo server (same one used by routeSafety.js) so we
// don't add a new dependency. The fare formula MUST stay in sync with the
// passenger-side `calculateFare` in src/pages/PassengerHome.tsx.

const OSRM_BASE = 'https://router.project-osrm.org';

const BASE_FARE_RS = 20;
const RATE_PER_KM = 15;

/** Match the passenger app's pricing: 20 base + 15/km, rounded. */
export function calculateFareRs(distanceKm) {
    const safe = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
    return Math.round(safe * RATE_PER_KM + BASE_FARE_RS);
}

function isLatLng(p) {
    return (
        p &&
        typeof p === 'object' &&
        typeof p.lat === 'number' &&
        typeof p.lng === 'number' &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng)
    );
}

/**
 * Compute the multi-waypoint route totals via OSRM. Returns null if any waypoint
 * is invalid or OSRM rejects the request; callers should fall back to the
 * existing distance estimate in that case.
 */
export async function computeItineraryTotals({ pickup, stops = [], dropoff }) {
    const waypoints = [pickup, ...(stops || []).map((s) => s?.coordinates || s), dropoff];
    if (!waypoints.every(isLatLng)) return null;

    const coordStr = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=false&alternatives=false&steps=false`;

    let data;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        data = await res.json();
    } catch (e) {
        console.warn('[itinerary] OSRM call failed:', e?.message || e);
        return null;
    }
    if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        return null;
    }
    const r = data.routes[0];
    const distanceKm = Math.round((r.distance / 1000) * 100) / 100;
    const durationMin = Math.max(1, Math.round(r.duration / 60));
    const fare = calculateFareRs(distanceKm);
    return {
        distanceKm,
        distanceText: `${distanceKm.toFixed(1)} km`,
        durationMin,
        durationText: `${durationMin} min`,
        fare
    };
}

/**
 * Build the snapshot Mongoose subdoc shape from inbound stops payload. Validates
 * each entry; returns `{ stops, error }` where `error` is non-null if anything
 * is malformed.
 */
export function normalizeBookingStops(rawStops) {
    if (rawStops == null) return { stops: [], error: null };
    if (!Array.isArray(rawStops)) {
        return { stops: [], error: 'stops must be an array' };
    }
    if (rawStops.length > 5) {
        return { stops: [], error: 'A trip can have at most 5 booking stops' };
    }
    const out = [];
    for (let i = 0; i < rawStops.length; i++) {
        const s = rawStops[i] || {};
        const coords = s.coordinates || {};
        if (!s.address || typeof s.address !== 'string' || !s.address.trim()) {
            return { stops: [], error: `Stop ${i + 1} is missing an address` };
        }
        if (!isLatLng(coords)) {
            return { stops: [], error: `Stop ${i + 1} has invalid coordinates` };
        }
        out.push({
            address: s.address.trim(),
            coordinates: { lat: coords.lat, lng: coords.lng },
            source: 'booking',
            status: 'pending'
        });
    }
    return { stops: out, error: null };
}

/** Returns true if `point` is within `maxMeters` of `target` (haversine). */
export function isWithinMeters(point, target, maxMeters) {
    if (!isLatLng(point) || !isLatLng(target)) return false;
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(target.lat - point.lat);
    const dLng = toRad(target.lng - point.lng);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(point.lat)) * Math.cos(toRad(target.lat)) * Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.asin(Math.sqrt(a));
    return d <= maxMeters;
}
