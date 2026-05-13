import express from 'express';

const router = express.Router();

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
/** Nominatim requires an identifying User-Agent — browser direct calls often get blocked or 429'd. */
const NOMINATIM_HEADERS = {
    'User-Agent': 'AutoRickshawBooking/1.0 (https://github.com; dev booking demo)',
    /** Prefer local names but allow Hindi/Malayalam hints for Devanagari/ML queries. */
    'Accept-Language': 'en,hi,ml'
};

let lastCallAtMs = 0;
const MIN_SPACING_MS = 1100;

async function nominatimGet(pathFromSlash) {
    const now = Date.now();
    const wait = lastCallAtMs + MIN_SPACING_MS - now;
    if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastCallAtMs = Date.now();

    const res = await fetch(`${NOMINATIM_BASE}${pathFromSlash}`, { headers: NOMINATIM_HEADERS });
    if (!res.ok) {
        const err = new Error(`Nominatim HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

router.get('/search', async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
            return res.status(400).json([]);
        }
        const limitRaw = Number.parseInt(String(req.query.limit ?? ''), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, limitRaw)) : 5;
        const path = `/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=${limit}`;
        const data = await nominatimGet(path);
        res.json(Array.isArray(data) ? data : []);
    } catch (e) {
        console.error('Geocode search error:', e.message || e);
        res.status(e.status === 429 ? 429 : 502).json([]);
    }
});

router.get('/reverse', async (req, res) => {
    try {
        const lat = Number.parseFloat(String(req.query.lat ?? ''));
        const lon = Number.parseFloat(String(req.query.lon ?? ''));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return res.status(400).json({});
        }
        const path = `/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const data = await nominatimGet(path);
        res.json(data && typeof data === 'object' ? data : {});
    } catch (e) {
        console.error('Geocode reverse error:', e.message || e);
        res.status(e.status === 429 ? 429 : 502).json({});
    }
});

export default router;
