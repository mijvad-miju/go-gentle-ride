import { GoogleGenerativeAI } from '@google/generative-ai';

const OSRM_BASE = 'https://router.project-osrm.org';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_HEADERS = {
    'User-Agent': 'AutoRickshawBooking/1.0 (safety-analyzer)',
    'Accept-Language': 'en,hi,ml'
};

// Nominatim asks for ~1 req/sec. Serialize calls so we never burst.
let nominatimQueue = Promise.resolve();
const NOMINATIM_SPACING_MS = 1100;

function queueNominatim(work) {
    const next = nominatimQueue.then(async () => {
        const result = await work();
        await new Promise((resolve) => setTimeout(resolve, NOMINATIM_SPACING_MS));
        return result;
    });
    nominatimQueue = next.catch(() => undefined);
    return next;
}

async function reverseGeocodeLocality(lat, lng) {
    try {
        return await queueNominatim(async () => {
            const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
            const res = await fetch(url, { headers: NOMINATIM_HEADERS });
            if (!res.ok) return null;
            const data = await res.json().catch(() => null);
            if (!data || typeof data !== 'object') return null;
            const addr = data.address || {};
            return (
                addr.suburb ||
                addr.neighbourhood ||
                addr.village ||
                addr.town ||
                addr.city_district ||
                addr.city ||
                addr.county ||
                data.display_name?.split(',').slice(0, 2).join(',').trim() ||
                null
            );
        });
    } catch (e) {
        console.warn('Reverse-geocode failed:', e?.message || e);
        return null;
    }
}

function sampleEvenly(coordinates, sampleCount) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return [];
    if (coordinates.length <= sampleCount) return coordinates.slice();
    const step = (coordinates.length - 1) / (sampleCount - 1);
    const picked = [];
    for (let i = 0; i < sampleCount; i++) {
        picked.push(coordinates[Math.round(i * step)]);
    }
    return picked;
}

function extractStreetNames(legs) {
    const names = new Set();
    for (const leg of legs || []) {
        for (const step of leg.steps || []) {
            const name = step?.name?.trim();
            if (name && name.length > 1) names.add(name);
        }
    }
    return Array.from(names).slice(0, 25);
}

function osrmRouteUrl(waypoints) {
    const coordStr = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
    return (
        `${OSRM_BASE}/route/v1/driving/${coordStr}` +
        `?alternatives=3&overview=full&geometries=geojson&steps=true`
    );
}

async function osrmFetchRoutes(waypoints) {
    try {
        const res = await fetch(osrmRouteUrl(waypoints));
        if (!res.ok) return [];
        const data = await res.json();
        if (data?.code !== 'Ok' || !Array.isArray(data.routes)) return [];
        return data.routes;
    } catch (e) {
        console.warn('OSRM request failed:', e?.message || e);
        return [];
    }
}

/**
 * Geometry signature used to dedupe routes that are effectively the same path
 * (within ~150m on each sampled point).
 */
function routeSignature(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return '';
    const samples = sampleEvenly(coords, 6);
    return samples
        .map(([lng, lat]) => `${lat.toFixed(3)},${lng.toFixed(3)}`)
        .join('|');
}

/**
 * Perpendicular midpoint offset: returns a via-waypoint shifted offsetKm to the
 * left/right of the straight-line midpoint. Used to coerce OSRM into proposing
 * a path through a different road corridor when the public demo server's
 * alternatives algorithm refuses to (common for Indian inter-town trips).
 */
function perpendicularViaPoint(source, destination, offsetKm, sideSign) {
    const midLat = (source.lat + destination.lat) / 2;
    const midLng = (source.lng + destination.lng) / 2;

    // Convert lat/lng diff to a 2D bearing.
    const dLat = destination.lat - source.lat;
    const dLng = destination.lng - source.lng;
    // 0 rad = east, pi/2 = north — but we just need a direction, so atan2 in (lat,lng) is fine.
    const bearing = Math.atan2(dLat, dLng);
    // Perpendicular is bearing + pi/2 (or - pi/2 for the other side).
    const perp = bearing + (sideSign >= 0 ? Math.PI / 2 : -Math.PI / 2);

    // 1 deg latitude ≈ 111 km. 1 deg longitude scales by cos(lat).
    const offsetDegLat = (offsetKm / 111) * Math.sin(perp);
    const cosLat = Math.cos(midLat * (Math.PI / 180));
    const offsetDegLng = (offsetKm / (111 * Math.max(0.2, cosLat))) * Math.cos(perp);

    return {
        lat: midLat + offsetDegLat,
        lng: midLng + offsetDegLng
    };
}

export async function fetchAlternativeRoutes(source, destination) {
    // 1. Direct OSRM call asking for up to 3 alternatives.
    const direct = await osrmFetchRoutes([source, destination]);
    if (direct.length === 0) {
        throw new Error('OSRM returned no routes');
    }

    const collected = [...direct];

    // 2. If we still don't have 3 routes, force alternates by routing through
    //    perpendicular-offset waypoints. The public OSRM demo server's "alternatives"
    //    algorithm is conservative and often returns just 1 route for inter-town
    //    Indian trips even when other viable roads exist, so we coerce it.
    if (collected.length < 3) {
        // Try larger offsets first so the alternates are visibly distinct.
        const offsetCandidates = [
            { km: 3, side: +1 },
            { km: 3, side: -1 },
            { km: 6, side: +1 },
            { km: 6, side: -1 }
        ];
        for (const c of offsetCandidates) {
            if (collected.length >= 3) break;
            const via = perpendicularViaPoint(source, destination, c.km, c.side);
            const extra = await osrmFetchRoutes([source, via, destination]);
            if (extra.length > 0) {
                collected.push(extra[0]);
            }
        }
    }

    // 3. Dedupe by geometry signature.
    const seen = new Set();
    const unique = [];
    for (const route of collected) {
        const sig = routeSignature(route?.geometry?.coordinates);
        if (!sig || seen.has(sig)) continue;
        seen.add(sig);
        unique.push(route);
        if (unique.length === 3) break;
    }

    // 4. Sort by duration (fastest first) so id=route_0 is the fastest baseline.
    unique.sort((a, b) => (a.duration || 0) - (b.duration || 0));

    console.log(
        `OSRM returned ${direct.length} direct + ${unique.length - direct.length >= 0 ? Math.max(0, unique.length - direct.length) : 0} synthesized; ` +
        `final ${unique.length} route(s) for ${source.name || `${source.lat},${source.lng}`} -> ${destination.name || `${destination.lat},${destination.lng}`}`
    );

    const enriched = [];
    for (let i = 0; i < unique.length; i++) {
        const route = unique[i];
        const coords = route?.geometry?.coordinates || [];
        const sampledLngLat = sampleEvenly(coords, 5);
        const middleIdx = Math.floor(sampledLngLat.length / 2);
        const middlePoint = sampledLngLat[middleIdx];
        let middleLocality = null;
        if (middlePoint && middlePoint.length === 2) {
            middleLocality = await reverseGeocodeLocality(middlePoint[1], middlePoint[0]);
        }
        enriched.push({
            id: `route_${i}`,
            distanceKm: Math.round((route.distance / 1000) * 100) / 100,
            durationMin: Math.round(route.duration / 60),
            geometry: coords.map((pt) => [pt[1], pt[0]]),
            streetNames: extractStreetNames(route.legs),
            sampledPoints: sampledLngLat.map((pt) => ({ lat: pt[1], lng: pt[0] })),
            middleLocality
        });
    }
    return enriched;
}

const GEMINI_RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        safetyScore: { type: 'number' },
        risk: { type: 'string', enum: ['low', 'medium', 'high'] },
        dimensions: {
            type: 'object',
            properties: {
                accidentHistory: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        note: { type: 'string' }
                    },
                    required: ['score', 'note']
                },
                roadCondition: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        note: { type: 'string' }
                    },
                    required: ['score', 'note']
                },
                lightingAndTime: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        note: { type: 'string' }
                    },
                    required: ['score', 'note']
                },
                crime: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        note: { type: 'string' }
                    },
                    required: ['score', 'note']
                },
                traffic: {
                    type: 'object',
                    properties: {
                        score: { type: 'number' },
                        note: { type: 'string' }
                    },
                    required: ['score', 'note']
                }
            },
            required: ['accidentHistory', 'roadCondition', 'lightingAndTime', 'crime', 'traffic']
        },
        summary: { type: 'string' },
        warnings: { type: 'array', items: { type: 'string' } }
    },
    required: ['safetyScore', 'risk', 'dimensions', 'summary', 'warnings']
};

function buildPrompt({ route, source, destination, hourOfDay }) {
    const isNight = hourOfDay >= 20 || hourOfDay < 6;
    const isLateNight = hourOfDay >= 23 || hourOfDay < 5;
    const timeLabel = isLateNight ? 'late night' : isNight ? 'night' : hourOfDay < 12 ? 'morning' : hourOfDay < 17 ? 'afternoon' : 'evening';
    const isBusyHour =
        (hourOfDay >= 8 && hourOfDay < 11) || (hourOfDay >= 17 && hourOfDay < 21);
    const impliedSpeedKmh =
        route.durationMin > 0
            ? Math.round((route.distanceKm / (route.durationMin / 60)) * 10) / 10
            : null;
    return `You are a road safety analyst for auto-rickshaw trips in India. Score the safety of the route below.

Score on a 0-10 scale (10 = safest, 0 = highly unsafe). Use realistic local knowledge of Indian roads, accident-prone corridors, common road conditions, street lighting at the given hour, typical petty-crime risk, and likely traffic congestion in the area. Be honest but not alarmist.

Route info:
- Pickup: ${source.name || `${source.lat},${source.lng}`}
- Drop:   ${destination.name || `${destination.lat},${destination.lng}`}
- Distance: ${route.distanceKm} km
- Duration: ${route.durationMin} min
- Implied average speed: ${impliedSpeedKmh != null ? `${impliedSpeedKmh} km/h` : 'unknown'}
- Departure time of day: ${timeLabel} (hour ${hourOfDay} local, ${isBusyHour ? 'typical peak hour' : 'off-peak'})
- Passes through area: ${route.middleLocality || 'unknown locality'}
- Main streets / segments on this route: ${route.streetNames.slice(0, 15).join(' | ') || 'unknown'}

Return ONLY a JSON object matching this shape:
{
  "safetyScore": number (0-10, one decimal allowed),
  "risk": "low" | "medium" | "high",
  "dimensions": {
    "accidentHistory": { "score": 0-10, "note": "<= 18 words" },
    "roadCondition":   { "score": 0-10, "note": "<= 18 words" },
    "lightingAndTime": { "score": 0-10, "note": "<= 18 words" },
    "crime":           { "score": 0-10, "note": "<= 18 words" },
    "traffic":         { "score": 0-10, "note": "<= 18 words" }
  },
  "summary": "<= 28 words plain-English overall verdict",
  "warnings": [ "short actionable warning", ... up to 3 ]
}

Rules:
- "risk" must derive from safetyScore: >= 7.5 low, 5.0-7.4 medium, < 5.0 high.
- lightingAndTime score must be lower if it is night/late night and the route uses small/poorly-lit roads.
- traffic score scale (10 = free-flowing, 0 = gridlocked):
    - >= 9 if implied speed >= 30 km/h
    - 6-8 if implied speed 20-29 km/h
    - 4-5 if implied speed 15-19 km/h
    - 2-3 if implied speed 10-14 km/h
    - <= 2 if implied speed < 10 km/h
  During peak hours on known busy corridors, reduce the traffic score by 1-2 additional points.
- The "note" for traffic should describe the likely congestion pattern (e.g. "moderate peak-hour congestion through MG Road junction").
- Do NOT invent specific accident statistics or news articles. Speak in general patterns.
- If you have no signal for a dimension, give it a neutral 6 and say "limited data".`;
}

// Model fallback chain — newest first. The Gemini 1.5 line is no longer served on the
// public v1beta endpoint, so we use the 2.x family. If the first model is rejected
// (404 / quota), we automatically try the next.
const GEMINI_MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
];

export async function analyzeRouteWithGemini(route, { source, destination, hourOfDay, apiKey }) {
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = buildPrompt({ route, source, destination, hourOfDay });

    let lastError = null;
    for (const modelName of GEMINI_MODEL_CANDIDATES) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: GEMINI_RESPONSE_SCHEMA,
                temperature: 0.4
            }
        });

        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await model.generateContent(prompt);
                const text = result?.response?.text?.();
                if (!text) throw new Error('Empty Gemini response');
                const parsed = JSON.parse(text);
                parsed.safetyScore = Math.max(0, Math.min(10, Number(parsed.safetyScore) || 0));
                const score = parsed.safetyScore;
                parsed.risk = score >= 7.5 ? 'low' : score >= 5 ? 'medium' : 'high';
                return parsed;
            } catch (e) {
                lastError = e;
                const msg = e?.message || String(e);
                const status = e?.status || e?.response?.status;
                console.warn(
                    `Gemini route-safety [${modelName}] attempt ${attempt}/${maxAttempts} failed:`,
                    msg
                );
                // Hard "not found" => skip the rest of the attempts for this model
                if (status === 404 || /not\s*found/i.test(msg)) break;
                if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 600 * attempt));
            }
        }
    }
    throw lastError || new Error('Gemini route-safety failed (all models exhausted)');
}

export function pickRecommended(analyzedRoutes) {
    const valid = analyzedRoutes.filter((r) => r.analysis && typeof r.analysis.safetyScore === 'number');
    if (valid.length === 0) return analyzedRoutes[0]?.id || null;
    const sorted = [...valid].sort((a, b) => {
        const diff = b.analysis.safetyScore - a.analysis.safetyScore;
        if (Math.abs(diff) > 0.01) return diff;
        return a.durationMin - b.durationMin;
    });
    return sorted[0].id;
}

export async function analyzeAllRoutes({ source, destination, departAt, apiKey }) {
    const routes = await fetchAlternativeRoutes(source, destination);
    const dt = departAt ? new Date(departAt) : new Date();
    const hourOfDay = dt.getHours();

    const analyzed = await Promise.all(
        routes.map(async (route) => {
            try {
                const analysis = await analyzeRouteWithGemini(route, {
                    source,
                    destination,
                    hourOfDay,
                    apiKey
                });
                return { ...route, analysis, analysisError: null };
            } catch (e) {
                return { ...route, analysis: null, analysisError: e?.message || String(e) };
            }
        })
    );

    const recommendedId = pickRecommended(analyzed);
    return { routes: analyzed, recommendedId, hourOfDay };
}
