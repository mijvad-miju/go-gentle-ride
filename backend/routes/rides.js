import crypto from 'crypto';
import express from 'express';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import Passenger from '../models/Passenger.js';
import Earning from '../models/Earning.js';
import { getBearerPayload } from '../utils/authToken.js';
import { sanitizeRideDoc } from '../utils/ridePayload.js';
import { assignPickupOtpAndNotify } from '../services/pickupOtp.js';
import { emitShareUpdate } from './share.js';
import {
  computeItineraryTotals,
  normalizeBookingStops,
  isWithinMeters,
  calculateFareRs
} from '../utils/itinerary.js';

const MAX_MIDTRIP_STOPS = 3;
const MIDTRIP_REQUEST_TTL_MS = 30 * 1000;
const STOP_VISIT_RADIUS_METERS = 80;

function midTripStopCount(ride) {
  return (ride.stops || []).filter((s) => s.source === 'mid_trip').length;
}

const router = express.Router();

/**
 * Lady-safety: bidirectional gender compatibility predicate.
 * - Driver's own `preferredPassengerGender` is ALWAYS enforced (even after a passenger
 *   taps "expand search" — see PATCH /:id/expand-search).
 * - Passenger's `preferredDriverGender` is only enforced while `genderFilterActive` is true.
 */
export function isCompatibleForRide(ride, driver) {
  const dPref = driver?.preferredPassengerGender || 'any';
  const driverOk =
    dPref === 'any' ||
    !ride?.passengerGender ||
    dPref === ride.passengerGender;

  const passengerOk =
    !ride?.genderFilterActive ||
    !ride?.preferredDriverGender ||
    ride.preferredDriverGender === 'any' ||
    !driver?.gender ||
    ride.preferredDriverGender === driver.gender;

  return driverOk && passengerOk;
}

function timingSafeOtpEquals(stored, input) {
  const a = String(stored ?? '');
  const b = String(input ?? '').trim();
  if (!a || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

// Get all rides
router.get('/', async (req, res) => {
  try {
    const rides = await Ride.find()
      .populate('passengerId', 'name phone profilePhoto')
      .populate('driverId', 'name phone driverInfo')
      .sort({ requestedAt: -1 });
    res.json(rides.map((r) => sanitizeRideDoc(r)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get ride by ID
router.get('/:id', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('passengerId', 'name phone profilePhoto')
      .populate('driverId', 'name phone driverInfo');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    const base = sanitizeRideDoc(ride);
    const token = getBearerPayload(req);
    const passengerRef = ride.passengerId;
    const passengerId =
      passengerRef && typeof passengerRef === 'object' && passengerRef._id != null
        ? String(passengerRef._id)
        : passengerRef != null
          ? String(passengerRef)
          : null;

    if (
      token?.role === 'passenger' &&
      passengerId &&
      String(token.userId) === passengerId
    ) {
      const secret = await Ride.findById(req.params.id)
        .select('+pickupOtp +pickupOtpExpiresAt')
        .lean();
      return res.json({
        ...base,
        pickupOtp: secret?.pickupOtp ?? null,
        pickupOtpExpiresAt: secret?.pickupOtpExpiresAt ?? null
      });
    }

    res.json(base);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new ride request
router.post('/', async (req, res) => {
  try {
    const { isScheduled, scheduledFor, ...rest } = req.body;

    const scheduledFlag = Boolean(isScheduled);
    const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;

    if (scheduledFlag) {
      if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: 'Valid scheduledFor is required for a scheduled ride' });
      }
      const minLeadMs = 5 * 60 * 1000;
      if (scheduledDate.getTime() < Date.now() + minLeadMs) {
        return res.status(400).json({
          message: 'Scheduled pickup must be at least 5 minutes from now'
        });
      }
    }

    // Snapshot the passenger's gender + driver-gender preference onto the ride so
    // matching is deterministic even if the passenger updates their profile later.
    let passengerGender = null;
    let preferredDriverGender = 'any';
    if (rest.passengerId) {
      try {
        const passenger = await Passenger.findById(rest.passengerId)
          .select('gender preferredDriverGender')
          .lean();
        if (passenger) {
          passengerGender = passenger.gender || null;
          preferredDriverGender = passenger.preferredDriverGender || 'any';
        }
      } catch (e) {
        console.warn('Could not snapshot passenger gender:', e?.message || e);
      }
    }

    // Multi-stop itinerary (max 5 booking stops). Coordinates are validated;
    // OSRM is used to recompute distance/duration/fare so the snapshotted totals
    // include every leg, not just pickup -> dropoff.
    const { stops: bookingStops, error: stopsError } = normalizeBookingStops(rest.stops);
    if (stopsError) {
      return res.status(400).json({ message: stopsError });
    }

    let computedDistance = rest.distance;
    let computedDuration = rest.duration;
    let computedFare = rest.fare;
    if (bookingStops.length > 0 && rest.pickupLocation?.coordinates && rest.dropoffLocation?.coordinates) {
      const totals = await computeItineraryTotals({
        pickup: rest.pickupLocation.coordinates,
        stops: bookingStops,
        dropoff: rest.dropoffLocation.coordinates
      });
      if (totals) {
        computedDistance = { value: totals.distanceKm, text: totals.distanceText };
        computedDuration = { value: totals.durationMin, text: totals.durationText };
        computedFare = {
          ...(rest.fare || {}),
          estimated: totals.fare,
          final: rest.fare?.final ?? null
        };
      }
    }

    const rideData = {
      ...rest,
      stops: bookingStops,
      distance: computedDistance,
      duration: computedDuration,
      fare: computedFare,
      isScheduled: scheduledFlag,
      scheduledFor: scheduledDate,
      status: scheduledFlag ? 'scheduled' : 'pending',
      passengerGender,
      preferredDriverGender,
      genderFilterActive: preferredDriverGender !== 'any'
    };

    const ride = new Ride(rideData);
    const savedRide = await ride.save();

    // Populate the saved ride
    await savedRide.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      if (!rideData.isScheduled) {
        io.to('drivers').emit('new_ride', sanitizeRideDoc(savedRide));
        console.log('Broadcasted new_ride event to drivers');
      } else {
        io.to('drivers').emit('new_scheduled_ride', sanitizeRideDoc(savedRide));
        console.log('Broadcasted new_scheduled_ride event to drivers');
      }
    }

    res.status(201).json(sanitizeRideDoc(savedRide));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get pending rides (for drivers) — server-side gender filtering when ?driverId= is passed.
router.get('/pending/available', async (req, res) => {
  try {
    const rides = await Ride.find({
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
      .populate('passengerId', 'name phone profilePhoto')
      .sort({ requestedAt: -1 })
      .limit(20);

    let visibleRides = rides;
    const driverId = req.query.driverId;
    if (driverId) {
      try {
        const driver = await Driver.findById(driverId)
          .select('gender preferredPassengerGender')
          .lean();
        if (driver) {
          visibleRides = rides.filter((r) => isCompatibleForRide(r, driver));
        }
      } catch (e) {
        console.warn('Pending filter: could not load driver:', e?.message || e);
      }
    }

    res.json(visibleRides.slice(0, 10).map((r) => sanitizeRideDoc(r)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get upcoming scheduled rides (for drivers) — same gender filter as pending.
router.get('/scheduled/available', async (req, res) => {
  try {
    const upcomingScheduledRides = await Ride.find({
      status: 'scheduled',
      isScheduled: true,
      scheduledFor: { $gt: new Date() }, // Only rides in the future
      driverId: null // Not yet accepted by any driver
    })
      .populate('passengerId', 'name phone profilePhoto')
      .sort({ scheduledFor: 1 }) // Sort by soonest first
      .limit(30);

    let visibleRides = upcomingScheduledRides;
    const driverId = req.query.driverId;
    if (driverId) {
      try {
        const driver = await Driver.findById(driverId)
          .select('gender preferredPassengerGender')
          .lean();
        if (driver) {
          visibleRides = upcomingScheduledRides.filter((r) => isCompatibleForRide(r, driver));
        }
      } catch (e) {
        console.warn('Scheduled filter: could not load driver:', e?.message || e);
      }
    }

    res.json(visibleRides.slice(0, 20).map((r) => sanitizeRideDoc(r)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Lady-safety: passenger taps "expand search" after 60s of no match.
// Clears the passenger-side gender filter on this ride and re-broadcasts new_ride
// so drivers previously hidden by the filter now see it. Driver's own preferred
// passenger gender is still enforced.
router.patch('/:id/expand-search', async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    const token = getBearerPayload(req);
    // Owner check tolerates both ObjectId and populated subdocs.
    const passengerRef = ride.passengerId;
    const ownerId =
      passengerRef && typeof passengerRef === 'object' && passengerRef._id != null
        ? String(passengerRef._id)
        : String(passengerRef);

    if (!token) {
      return res.status(401).json({ message: 'Missing or invalid token' });
    }
    if (token.role !== 'passenger') {
      return res.status(403).json({ message: 'Only passengers can expand search' });
    }
    if (String(token.userId) !== ownerId) {
      return res.status(403).json({ message: 'You can only expand search on your own ride' });
    }
    if (!['pending', 'scheduled'].includes(ride.status)) {
      return res.status(400).json({
        message: `Search can only be expanded while the ride is pending (current: ${ride.status})`
      });
    }

    ride.genderFilterActive = false;
    await ride.save();
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      // Re-broadcast so drivers who were filtered out earlier now see the ride.
      io.to('drivers').emit('new_ride', sanitizeRideDoc(ride));
      io.to(`ride_${ride._id}`).emit('ride_updated', sanitizeRideDoc(ride));
      console.log(`[expand-search] ride ${ride._id} broadened to all driver genders`);
    }

    res.json({ success: true, ride: sanitizeRideDoc(ride) });
  } catch (error) {
    console.error('[expand-search] error:', error);
    res.status(500).json({ message: error.message });
  }
});

// --- Multi-stop itinerary: mid-trip stop add/accept/reject/visit ---------

function driverIdOfRide(ride) {
  const d = ride?.driverId;
  if (!d) return null;
  if (typeof d === 'object' && d._id != null) return String(d._id);
  return String(d);
}

function passengerIdOfRide(ride) {
  const p = ride?.passengerId;
  if (!p) return null;
  if (typeof p === 'object' && p._id != null) return String(p._id);
  return String(p);
}

function emitStopRequestPayload(io, ride) {
  if (!io) return;
  const driverId = driverIdOfRide(ride);
  const payload = {
    rideId: String(ride._id),
    pendingStopRequest: ride.pendingStopRequest
  };
  if (driverId) io.to(`tracking_${driverId}`).emit('stop_request', payload);
  io.to(`ride_${ride._id}`).emit('stop_request', payload);
}

// Passenger requests a mid-trip stop. Computes totals, stores pendingStopRequest
// with a 30s TTL, and notifies the assigned driver.
router.patch('/:id/request-stop', async (req, res) => {
  try {
    const token = getBearerPayload(req);
    if (!token) return res.status(401).json({ message: 'Missing or invalid token' });
    if (token.role !== 'passenger') {
      return res.status(403).json({ message: 'Only passengers can add stops' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (String(passengerIdOfRide(ride)) !== String(token.userId)) {
      return res.status(403).json({ message: 'You can only modify your own ride' });
    }
    if (!['accepted', 'arriving', 'in_progress'].includes(ride.status)) {
      return res.status(400).json({ message: 'Stops can only be added during an active trip' });
    }
    if (midTripStopCount(ride) >= MAX_MIDTRIP_STOPS) {
      return res.status(400).json({
        message: `You can add at most ${MAX_MIDTRIP_STOPS} stops during a trip`
      });
    }
    if (ride.pendingStopRequest?.requestedAt) {
      const expiresAt = ride.pendingStopRequest.expiresAt;
      if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) {
        return res.status(409).json({ message: 'A stop request is already pending' });
      }
    }

    const { address, coordinates } = req.body || {};
    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ message: 'Stop address is required' });
    }
    if (
      !coordinates ||
      typeof coordinates.lat !== 'number' ||
      typeof coordinates.lng !== 'number' ||
      !Number.isFinite(coordinates.lat) ||
      !Number.isFinite(coordinates.lng)
    ) {
      return res.status(400).json({ message: 'Stop coordinates are invalid' });
    }

    // Append the new stop to all PENDING stops (visited stops are already behind us)
    // so the OSRM legs reflect the actual remaining route.
    const remainingStops = (ride.stops || []).filter((s) => s.status !== 'visited');
    const proposedStops = [...remainingStops, { address, coordinates }];

    const baseline = await computeItineraryTotals({
      pickup: ride.pickupLocation.coordinates,
      stops: remainingStops,
      dropoff: ride.dropoffLocation.coordinates
    });
    const proposed = await computeItineraryTotals({
      pickup: ride.pickupLocation.coordinates,
      stops: proposedStops,
      dropoff: ride.dropoffLocation.coordinates
    });
    if (!proposed) {
      return res.status(502).json({ message: 'Could not compute the new route. Try a different spot.' });
    }
    const fallbackBaseline = baseline || {
      distanceKm: ride.distance?.value || 0,
      durationMin: ride.duration?.value || 0,
      fare: ride.fare?.estimated || calculateFareRs(ride.distance?.value || 0)
    };

    const requestedAt = new Date();
    ride.pendingStopRequest = {
      address: address.trim(),
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
      distanceDeltaKm: Math.max(0, Math.round((proposed.distanceKm - fallbackBaseline.distanceKm) * 100) / 100),
      durationDeltaMin: Math.max(0, proposed.durationMin - fallbackBaseline.durationMin),
      fareDelta: Math.max(0, proposed.fare - fallbackBaseline.fare),
      requestedAt,
      expiresAt: new Date(requestedAt.getTime() + MIDTRIP_REQUEST_TTL_MS)
    };
    await ride.save();
    await ride.populate('driverId', 'name phone driverInfo');

    emitStopRequestPayload(req.app.get('io'), ride);
    console.log(`[stop-request] ride ${ride._id} requested by passenger`);

    res.json({ success: true, ride: sanitizeRideDoc(ride) });
  } catch (error) {
    console.error('[request-stop] error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Driver accepts the pending mid-trip stop. Appends it to the live stops list
// and recomputes distance/duration/fare for the full remaining itinerary.
router.patch('/:id/accept-stop', async (req, res) => {
  try {
    const token = getBearerPayload(req);
    if (!token) return res.status(401).json({ message: 'Missing or invalid token' });
    if (token.role !== 'driver') {
      return res.status(403).json({ message: 'Only the assigned driver can accept stops' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (String(driverIdOfRide(ride)) !== String(token.userId)) {
      return res.status(403).json({ message: 'You can only modify your own trips' });
    }
    if (!ride.pendingStopRequest?.coordinates?.lat) {
      return res.status(400).json({ message: 'No pending stop request to accept' });
    }
    if (
      ride.pendingStopRequest.expiresAt &&
      new Date(ride.pendingStopRequest.expiresAt).getTime() < Date.now()
    ) {
      ride.pendingStopRequest = undefined;
      await ride.save();
      return res.status(410).json({ message: 'The stop request expired' });
    }

    const newStop = {
      address: ride.pendingStopRequest.address,
      coordinates: {
        lat: ride.pendingStopRequest.coordinates.lat,
        lng: ride.pendingStopRequest.coordinates.lng
      },
      source: 'mid_trip',
      status: 'pending',
      addedAt: new Date(),
      visitedAt: null
    };
    ride.stops = [...(ride.stops || []), newStop];

    // Recompute totals across pickup -> remaining stops -> dropoff so the
    // passenger sees the new ETA + fare locked in.
    const remainingStops = ride.stops.filter((s) => s.status !== 'visited');
    const totals = await computeItineraryTotals({
      pickup: ride.pickupLocation.coordinates,
      stops: remainingStops,
      dropoff: ride.dropoffLocation.coordinates
    });
    if (totals) {
      ride.distance = { value: totals.distanceKm, text: totals.distanceText };
      ride.duration = { value: totals.durationMin, text: totals.durationText };
      ride.fare = { ...(ride.fare?.toObject?.() || ride.fare || {}), estimated: totals.fare };
    }

    ride.pendingStopRequest = undefined;
    await ride.save();
    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      const payload = sanitizeRideDoc(ride);
      io.to(`ride_${ride._id}`).emit('ride_updated', payload);
      io.to(`ride_${ride._id}`).emit('stop_added', { rideId: String(ride._id), ride: payload });
      const passengerId = passengerIdOfRide(ride);
      if (passengerId) io.to(`passenger_${passengerId}`).emit('stop_added', { rideId: String(ride._id), ride: payload });
      await emitShareUpdate(io, ride._id, 'ride_status');
    }

    console.log(`[stop-accept] ride ${ride._id} accepted by driver`);
    res.json({ success: true, ride: sanitizeRideDoc(ride) });
  } catch (error) {
    console.error('[accept-stop] error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Reject (by driver) OR cancel (by passenger) the pending mid-trip stop.
// Same endpoint so passenger can cancel while waiting.
router.patch('/:id/reject-stop', async (req, res) => {
  try {
    const token = getBearerPayload(req);
    if (!token) return res.status(401).json({ message: 'Missing or invalid token' });

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    const isDriver =
      token.role === 'driver' && String(driverIdOfRide(ride)) === String(token.userId);
    const isPassenger =
      token.role === 'passenger' && String(passengerIdOfRide(ride)) === String(token.userId);
    if (!isDriver && !isPassenger) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    if (!ride.pendingStopRequest?.coordinates?.lat) {
      return res.status(400).json({ message: 'No pending stop request' });
    }

    const rejectedAddress = ride.pendingStopRequest.address;
    ride.pendingStopRequest = undefined;
    await ride.save();

    const io = req.app.get('io');
    if (io) {
      const payload = {
        rideId: String(ride._id),
        address: rejectedAddress,
        reason: isDriver ? 'driver_declined' : 'passenger_cancelled'
      };
      io.to(`ride_${ride._id}`).emit('stop_rejected', payload);
      const driverId = driverIdOfRide(ride);
      const passengerId = passengerIdOfRide(ride);
      if (driverId) io.to(`tracking_${driverId}`).emit('stop_rejected', payload);
      if (passengerId) io.to(`passenger_${passengerId}`).emit('stop_rejected', payload);
    }

    console.log(`[stop-reject] ride ${ride._id} (${isDriver ? 'driver' : 'passenger'})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[reject-stop] error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Driver marks a stop visited (e.g. has dropped off / picked up there).
// Requires driver to be within ~80m of the stop coordinates as a guard.
router.patch('/:id/stops/:index/visit', async (req, res) => {
  try {
    const token = getBearerPayload(req);
    if (!token) return res.status(401).json({ message: 'Missing or invalid token' });
    if (token.role !== 'driver') {
      return res.status(403).json({ message: 'Only the driver can mark a stop visited' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (String(driverIdOfRide(ride)) !== String(token.userId)) {
      return res.status(403).json({ message: 'You can only modify your own trips' });
    }

    const idx = Number.parseInt(req.params.index, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= (ride.stops || []).length) {
      return res.status(400).json({ message: 'Invalid stop index' });
    }
    const stop = ride.stops[idx];
    if (!stop) return res.status(404).json({ message: 'Stop not found' });
    if (stop.status === 'visited') {
      return res.status(200).json({ success: true, ride: sanitizeRideDoc(ride) });
    }

    // Soft geofence: allow override with `?force=1` so drivers aren't stuck if GPS drifts.
    const driverLoc = req.body?.location || null;
    if (!req.query.force) {
      if (
        driverLoc &&
        !isWithinMeters(driverLoc, stop.coordinates, STOP_VISIT_RADIUS_METERS)
      ) {
        return res.status(400).json({
          message: 'You are not at this stop yet. Move closer or override.'
        });
      }
    }

    stop.status = 'visited';
    stop.visitedAt = new Date();
    await ride.save();
    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      const payload = sanitizeRideDoc(ride);
      io.to(`ride_${ride._id}`).emit('ride_updated', payload);
      io.to(`ride_${ride._id}`).emit('stop_visited', {
        rideId: String(ride._id),
        index: idx,
        ride: payload
      });
      await emitShareUpdate(io, ride._id, 'ride_status');
    }
    res.json({ success: true, ride: sanitizeRideDoc(ride) });
  } catch (error) {
    console.error('[stop-visit] error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Accept ride (driver)
router.patch('/:id/accept', async (req, res) => {
  try {
    const { driverId } = req.body;

    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (!['pending', 'scheduled'].includes(ride.status)) {
      return res.status(400).json({ message: 'Ride is no longer available' });
    }

    if (new Date() > ride.expiresAt) {
      return res.status(400).json({ message: 'Ride request has expired' });
    }

    ride.driverId = driverId;
    // For scheduled rides, keep status as "scheduled" until pickup time.
    // This prevents passenger/driver apps from showing "arriving" too early.
    ride.status = ride.isScheduled ? 'scheduled' : 'accepted';
    ride.acceptedAt = new Date();

    // Update driver's online status (only if it's an immediate ride)
    // For scheduled rides, driver remains free until the scheduled time
    if (!ride.isScheduled) {
      await Driver.findByIdAndUpdate(driverId, {
        'driverInfo.isOnline': false // Driver is now on a ride
      });
    }

    const updatedRide = await ride.save();
    await updatedRide.populate('driverId', 'name phone driverInfo');
    await updatedRide.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      if (!ride.isScheduled) {
        await assignPickupOtpAndNotify(io, req.params.id);
      } else {
        io.to(`ride_${req.params.id}`).emit('ride_updated', sanitizeRideDoc(updatedRide));
      }

      const driverOid =
        updatedRide.driverId?._id != null ? String(updatedRide.driverId._id) : String(driverId);
      const loc = updatedRide.driverId?.driverInfo?.currentLocation;
      if (
        driverOid &&
        loc &&
        typeof loc.lat === 'number' &&
        typeof loc.lng === 'number' &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        io.to(`tracking_${driverOid}`).emit('driver_location_update', {
          driverId: driverOid,
          location: { lat: loc.lat, lng: loc.lng }
        });
      }

      // If it's a scheduled ride, emit a specific event so other drivers remove it from their lists
      if (ride.isScheduled) {
        io.to('drivers').emit('scheduled_ride_accepted', { rideId: updatedRide._id });
        const passengerRef = updatedRide.passengerId;
        const passengerId =
          passengerRef && typeof passengerRef === 'object' && passengerRef._id
            ? passengerRef._id.toString()
            : passengerRef?.toString?.();
        if (passengerId) {
          io.to(`passenger_${passengerId}`).emit('prebook_driver_assigned', {
            rideId: updatedRide._id.toString()
          });
        }
      }

      // Push driver assignment to the public share page (if anyone's watching).
      await emitShareUpdate(io, req.params.id, 'ride_status');
    }

    const responseRide = await Ride.findById(req.params.id)
      .populate('driverId', 'name phone driverInfo')
      .populate('passengerId', 'name phone profilePhoto');

    res.json(sanitizeRideDoc(responseRide));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Decline ride (driver) - just update status to cancelled
router.patch('/:id/decline', async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        status: 'cancelled',
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    res.json(ride);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Start ride (driver picked up passenger — accepted/arriving → in_progress; requires passenger OTP)
router.patch('/:id/start', async (req, res) => {
  try {
    const { driverId, otp } = req.body;
    const ride = await Ride.findById(req.params.id).select('+pickupOtp +pickupOtpExpiresAt');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (!['accepted', 'arriving'].includes(ride.status)) {
      return res.status(400).json({ message: 'Ride cannot be started in its current state' });
    }

    if (!ride.driverId || String(ride.driverId) !== String(driverId)) {
      return res.status(403).json({ message: 'Only the assigned driver can start this ride' });
    }

    if (ride.isScheduled && ride.scheduledFor && new Date(ride.scheduledFor).getTime() > Date.now()) {
      return res.status(400).json({ message: 'Cannot start before scheduled pickup time' });
    }

    if (!ride.pickupOtp) {
      return res.status(400).json({ message: 'Pickup OTP not available. Ask the passenger to open their app.' });
    }

    if (ride.pickupOtpExpiresAt && new Date(ride.pickupOtpExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    if (!timingSafeOtpEquals(ride.pickupOtp, otp)) {
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    ride.status = 'in_progress';
    ride.startedAt = new Date();
    ride.pickupOtp = null;
    ride.pickupOtpExpiresAt = null;
    await ride.save();

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', sanitizeRideDoc(ride));
      await emitShareUpdate(io, req.params.id, 'ride_status');
    }

    res.json(sanitizeRideDoc(ride));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Complete ride
router.patch('/:id/complete', async (req, res) => {
  try {
    const { finalFare } = req.body;

    const existing = await Ride.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    if (existing.status !== 'in_progress') {
      return res.status(400).json({ message: 'Ride must be in progress before it can be completed' });
    }

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          'fare.final': finalFare || existing.fare.estimated,
          paymentStatus: 'completed'
        },
        $unset: { pickupOtp: '', pickupOtpExpiresAt: '' }
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Create earning record for driver
    if (ride.driverId) {
      const earning = new Earning({
        driverId: ride.driverId,
        rideId: ride._id,
        amount: finalFare || ride.fare.estimated,
        date: new Date(),
        status: 'completed'
      });
      await earning.save();

      // Update driver stats
      await Driver.findByIdAndUpdate(ride.driverId, {
        $inc: { 'driverInfo.totalRides': 1 },
        'driverInfo.isOnline': true // Driver is available again
      });
    }

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', sanitizeRideDoc(ride));
      await emitShareUpdate(io, req.params.id, 'ride_status');
    }

    res.json(sanitizeRideDoc(ride));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Cancel ride
router.patch('/:id/cancel', async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date()
        },
        $unset: { pickupOtp: '', pickupOtpExpiresAt: '' }
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // If driver was assigned, make them available again
    if (ride.driverId && ride.status !== 'completed') {
      await Driver.findByIdAndUpdate(ride.driverId, {
        'driverInfo.isOnline': true
      });
    }

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    const rideIdStr = String(ride._id);
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', sanitizeRideDoc(ride));
      io.to('drivers').emit('ride_cancelled', { rideId: rideIdStr });
      await emitShareUpdate(io, req.params.id, 'ride_status');
    }

    res.json(sanitizeRideDoc(ride));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get user's rides
router.get('/user/:userId', async (req, res) => {
  try {
    const rides = await Ride.find({
      $or: [
        { passengerId: req.params.userId },
        { driverId: req.params.userId }
      ]
    })
      .populate('passengerId', 'name phone profilePhoto')
      .populate('driverId', 'name phone driverInfo')
      .sort({ requestedAt: -1 });

    res.json(rides.map((r) => sanitizeRideDoc(r)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Rate ride
router.patch('/:id/rate', async (req, res) => {
  try {
    const { passengerRating, driverRating, passengerReview, driverReview } = req.body;

    const update = {};
    if (passengerRating !== undefined) update['rating.passengerRating'] = passengerRating;
    if (driverRating !== undefined) update['rating.driverRating'] = driverRating;
    if (passengerReview) update['rating.passengerReview'] = passengerReview;
    if (driverReview) update['rating.driverReview'] = driverReview;

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // Update driver's average rating if passenger rated
    if (passengerRating && ride.driverId) {
      const driver = await Driver.findById(ride.driverId);
      if (driver) {
        // Calculate new average rating
        const totalRides = driver.driverInfo.totalRides || 1;
        const currentRating = driver.driverInfo.rating || 0;
        const newRating = ((currentRating * (totalRides - 1)) + passengerRating) / totalRides;

        await Driver.findByIdAndUpdate(ride.driverId, {
          'driverInfo.rating': newRating
        });
      }
    }

    res.json(ride);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;





