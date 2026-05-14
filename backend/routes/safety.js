import express from 'express';
import RouteSafetyCache from '../models/RouteSafetyCache.js';
import { analyzeAllRoutes } from '../services/routeSafety.js';

const router = express.Router();

const CACHE_TTL_HOURS = 24;

function roundCoord(value) {
    // ~110m grid at the equator. Enough that two requests in the same neighbourhood reuse cache.
    return Math.round(Number(value) * 1000) / 1000;
}

function buildCacheKey(source, destination, hourOfDay) {
    return [
        roundCoord(source.lat),
        roundCoord(source.lng),
        roundCoord(destination.lat),
        roundCoord(destination.lng),
        hourOfDay
    ].join('|');
}

function isValidCoord(point) {
    return (
        point &&
        Number.isFinite(Number(point.lat)) &&
        Number.isFinite(Number(point.lng))
    );
}

router.post('/analyze', async (req, res) => {
    try {
        const { source, destination, departAt } = req.body || {};
        if (!isValidCoord(source) || !isValidCoord(destination)) {
            return res.status(400).json({
                success: false,
                message: 'source.lat/lng and destination.lat/lng are required'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const dt = departAt ? new Date(departAt) : new Date();
        const hourOfDay = Number.isFinite(dt.getHours()) ? dt.getHours() : new Date().getHours();
        const cacheKey = buildCacheKey(
            { lat: Number(source.lat), lng: Number(source.lng) },
            { lat: Number(destination.lat), lng: Number(destination.lng) },
            hourOfDay
        );

        // Cache lookup
        try {
            const cached = await RouteSafetyCache.findOne({ cacheKey }).lean();
            if (cached && cached.expiresAt && cached.expiresAt.getTime() > Date.now()) {
                return res.json({
                    success: true,
                    cached: true,
                    ...cached.payload
                });
            }
        } catch (e) {
            // Cache miss / Mongo hiccup — proceed without cache.
            console.warn('RouteSafetyCache lookup failed:', e?.message || e);
        }

        if (!apiKey) {
            // No Gemini key — return raw OSRM alternatives without scores so the booking flow still works.
            try {
                const { fetchAlternativeRoutes } = await import('../services/routeSafety.js');
                const routes = await fetchAlternativeRoutes(
                    { lat: Number(source.lat), lng: Number(source.lng), name: source.name },
                    { lat: Number(destination.lat), lng: Number(destination.lng), name: destination.name }
                );
                return res.json({
                    success: true,
                    cached: false,
                    routes: routes.map((r) => ({ ...r, analysis: null, analysisError: 'GEMINI_API_KEY not configured' })),
                    recommendedId: routes[0]?.id || null,
                    hourOfDay,
                    geminiAvailable: false
                });
            } catch (e) {
                console.error('Route safety (no key) failed:', e?.message || e);
                return res.status(502).json({
                    success: false,
                    message: 'Could not fetch alternative routes'
                });
            }
        }

        const result = await analyzeAllRoutes({
            source: { lat: Number(source.lat), lng: Number(source.lng), name: source.name },
            destination: { lat: Number(destination.lat), lng: Number(destination.lng), name: destination.name },
            departAt,
            apiKey
        });

        const payload = {
            routes: result.routes,
            recommendedId: result.recommendedId,
            hourOfDay: result.hourOfDay,
            geminiAvailable: true
        };

        // Persist cache (don't block response on failure).
        RouteSafetyCache.findOneAndUpdate(
            { cacheKey },
            {
                cacheKey,
                payload,
                expiresAt: new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000)
            },
            { upsert: true, new: true }
        ).catch((e) => console.warn('RouteSafetyCache write failed:', e?.message || e));

        res.json({ success: true, cached: false, ...payload });
    } catch (error) {
        console.error('Route safety analyze error:', error?.message || error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze route safety',
            error: error?.message
        });
    }
});

export default router;
