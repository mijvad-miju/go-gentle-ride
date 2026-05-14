import crypto from 'crypto';
import express from 'express';
import Ride from '../models/Ride.js';
import { getBearerPayload } from '../utils/authToken.js';

const router = express.Router();

const ACTIVE_STATUSES = new Set(['pending', 'scheduled', 'accepted', 'arriving', 'in_progress']);
const TERMINAL_GRACE_MS = 30 * 60 * 1000;
const DEFAULT_SHARE_TTL_MS = 24 * 60 * 60 * 1000;

function publicOrigin(req) {
    const env = process.env.APP_PUBLIC_ORIGIN;
    if (env && env.trim()) return env.trim().replace(/\/$/, '');
    // Fall back to whatever origin proxied us — better than throwing.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}`;
}

function pickPublicPayload(ride) {
    const driverInfo = ride.driverId?.driverInfo || {};
    return {
        rideId: String(ride._id),
        status: ride.status,
        pickup: {
            address: ride.pickupLocation?.address,
            coordinates: ride.pickupLocation?.coordinates
        },
        dropoff: {
            address: ride.dropoffLocation?.address,
            coordinates: ride.dropoffLocation?.coordinates
        },
        stops: Array.isArray(ride.stops)
            ? ride.stops.map((s) => ({
                  address: s.address,
                  coordinates: s.coordinates,
                  status: s.status,
                  source: s.source
              }))
            : [],
        passenger: {
            name: ride.passengerId?.name || null
        },
        driver: ride.driverId
            ? {
                  name: ride.driverId.name || null,
                  vehicleNumber: driverInfo.vehicleNumber || null,
                  vehicleType: driverInfo.vehicleType || null,
                  rating: driverInfo.rating ?? null,
                  currentLocation: driverInfo.currentLocation || null
              }
            : null,
        distance: ride.distance
            ? { value: ride.distance.value, text: ride.distance.text }
            : null,
        duration: ride.duration
            ? { value: ride.duration.value, text: ride.duration.text }
            : null,
        startedAt: ride.startedAt,
        completedAt: ride.completedAt,
        cancelledAt: ride.cancelledAt,
        shareExpiresAt: ride.shareExpiresAt
    };
}

// Passenger generates (or refreshes) a public share URL for one of their rides.
// Idempotent: returns the existing live token if it's still valid.
router.post('/rides/:id/share-token', async (req, res) => {
    try {
        const token = getBearerPayload(req);
        if (!token) return res.status(401).json({ message: 'Missing or invalid token' });
        if (token.role !== 'passenger') {
            return res.status(403).json({ message: 'Only passengers can share trips' });
        }

        const ride = await Ride.findById(req.params.id).select('+shareToken +shareExpiresAt');
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (String(ride.passengerId) !== String(token.userId)) {
            return res.status(403).json({ message: 'You can only share your own ride' });
        }

        const now = new Date();
        const stillValid =
            ride.shareToken && ride.shareExpiresAt && ride.shareExpiresAt.getTime() > now.getTime();

        if (!stillValid) {
            ride.shareToken = crypto.randomBytes(24).toString('hex');
            ride.shareExpiresAt = new Date(now.getTime() + DEFAULT_SHARE_TTL_MS);
            await ride.save();
        }

        const url = `${publicOrigin(req)}/track/${ride.shareToken}`;
        return res.json({
            token: ride.shareToken,
            url,
            expiresAt: ride.shareExpiresAt
        });
    } catch (error) {
        console.error('[share-token POST] error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Passenger revokes the share link.
router.delete('/rides/:id/share-token', async (req, res) => {
    try {
        const token = getBearerPayload(req);
        if (!token) return res.status(401).json({ message: 'Missing or invalid token' });
        if (token.role !== 'passenger') {
            return res.status(403).json({ message: 'Only passengers can revoke share links' });
        }

        const ride = await Ride.findById(req.params.id).select('+shareToken +shareExpiresAt');
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (String(ride.passengerId) !== String(token.userId)) {
            return res.status(403).json({ message: 'You can only revoke your own share link' });
        }

        ride.shareToken = null;
        ride.shareExpiresAt = null;
        await ride.save();
        res.json({ success: true });
    } catch (error) {
        console.error('[share-token DELETE] error:', error);
        res.status(500).json({ message: error.message });
    }
});

// PUBLIC: anyone with the token can read a minimal trip payload.
// The token IS the auth; rotate/revoke through the passenger endpoints above.
router.get('/share/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token || token.length < 16) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        const ride = await Ride.findOne({ shareToken: token })
            .select('+shareToken +shareExpiresAt')
            .populate('passengerId', 'name')
            .populate('driverId', 'name driverInfo');

        if (!ride) return res.status(404).json({ message: 'Share link not found' });

        const now = Date.now();
        if (ride.shareExpiresAt && ride.shareExpiresAt.getTime() < now) {
            return res.status(410).json({ message: 'Share link expired' });
        }

        // Auto-expire 30 min after the trip ends so links don't leak forever.
        const terminalAt =
            ride.completedAt?.getTime?.() ?? ride.cancelledAt?.getTime?.() ?? null;
        if (terminalAt && now - terminalAt > TERMINAL_GRACE_MS) {
            return res.status(410).json({ message: 'Trip ended; share link expired' });
        }

        res.json(pickPublicPayload(ride));
    } catch (error) {
        console.error('[share GET] error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Helper for the rest of the backend: emit ride updates to the public share room
// whenever a status / location change happens on a ride that has a live token.
export async function emitShareUpdate(io, rideOrId, kind = 'ride_status') {
    if (!io) return;
    try {
        const ride =
            typeof rideOrId === 'string' || (rideOrId && rideOrId.toString && !rideOrId.shareToken)
                ? await Ride.findById(rideOrId)
                      .select('+shareToken +shareExpiresAt')
                      .populate('passengerId', 'name')
                      .populate('driverId', 'name driverInfo')
                : rideOrId;
        if (!ride?.shareToken) return;
        if (
            ride.shareExpiresAt &&
            ride.shareExpiresAt.getTime() < Date.now()
        ) {
            return;
        }
        io.to(`track_${ride.shareToken}`).emit(kind, pickPublicPayload(ride));
    } catch (error) {
        console.warn('[emitShareUpdate] error:', error?.message || error);
    }
}

export default router;
