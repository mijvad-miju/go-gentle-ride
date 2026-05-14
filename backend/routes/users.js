import express from 'express';
import mongoose from 'mongoose';
import Passenger from '../models/Passenger.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import { getBearerPayload } from '../utils/authToken.js';
import { emitShareUpdate } from './share.js';

const router = express.Router();

// Get online drivers
router.get('/drivers/online', async (req, res) => {
  try {
    const drivers = await Driver.find({
      'driverInfo.isOnline': true
    });
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update driver online status
router.patch('/drivers/:id/online-status', async (req, res) => {
  try {
    const { isOnline, currentLocation } = req.body;
    const update = { 'driverInfo.isOnline': isOnline };

    if (currentLocation) {
      update['driverInfo.currentLocation'] = currentLocation;
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.json(driver);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update driver location (real-time tracking)
router.patch('/drivers/:id/location', async (req, res) => {
  try {
    const { currentLocation } = req.body;

    if (!currentLocation || typeof currentLocation.lat !== 'number' || typeof currentLocation.lng !== 'number') {
      return res.status(400).json({ message: 'Invalid location data' });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          'driverInfo.currentLocation': currentLocation,
          updatedAt: Date.now()
        }
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const io = req.app.get('io');
    if (io) {
      const trackingId = String(req.params.id);
      io.to(`tracking_${trackingId}`).emit('driver_location_update', {
        driverId: trackingId,
        location: driver.driverInfo.currentLocation
      });

      // Also forward to any public share rooms for active rides this driver is on.
      // Best-effort: failures don't block the response.
      try {
        const activeRides = await Ride.find({
          driverId: req.params.id,
          status: { $in: ['accepted', 'arriving', 'in_progress'] },
          shareToken: { $ne: null }
        })
          .select('+shareToken +shareExpiresAt')
          .lean();
        for (const ride of activeRides) {
          if (!ride.shareToken) continue;
          if (ride.shareExpiresAt && new Date(ride.shareExpiresAt).getTime() < Date.now()) continue;
          io.to(`track_${ride.shareToken}`).emit('driver_location_update', {
            driverId: trackingId,
            location: driver.driverInfo.currentLocation
          });
        }
      } catch (shareErr) {
        console.warn('[location] share broadcast failed:', shareErr?.message || shareErr);
      }
    }

    res.json({
      success: true,
      currentLocation: driver.driverInfo.currentLocation
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all users
router.get('/', async (req, res) => {
  try {
    const [passengers, drivers] = await Promise.all([
      Passenger.find(),
      Driver.find()
    ]);
    const users = [...passengers, ...drivers];
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new user
router.post('/', async (req, res) => {
  try {
    const Model = req.body.role === 'driver' ? Driver : Passenger;
    const user = new Model(req.body);
    const savedUser = await user.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// --- Emergency contacts (passenger-only) ----------------------------------
// Registered before `GET /:id` so paths like `/:id/emergency-contacts` are never captured as a user id.
const MAX_EMERGENCY_CONTACTS = 5;
const INDIAN_PHONE = /^[6-9]\d{9}$/;

function normalizeIndianPhone(raw) {
  if (raw == null) return null;
  const digits = String(raw).trim().replace(/\D/g, '');
  if (!digits) return null;

  let local = digits;
  // Strip leading 00 / 0 used in India before STD/mobile
  while (local.length > 10 && local.startsWith('0')) {
    local = local.slice(1);
  }
  // +91 / 91 prefix
  if (local.length >= 12 && local.startsWith('91')) {
    local = local.slice(-10);
  } else if (local.length === 11 && local.startsWith('0')) {
    local = local.slice(1);
  } else if (local.length > 10) {
    local = local.slice(-10);
  }

  return INDIAN_PHONE.test(local) ? local : null;
}

function authorizePassenger(req, paramId) {
  const token = getBearerPayload(req);
  if (!token) return { ok: false, status: 401, message: 'Missing or invalid token' };
  if (token.role !== 'passenger') {
    return { ok: false, status: 403, message: 'Only passengers manage emergency contacts' };
  }
  const jwtUserId = token.userId ?? token.id ?? token.sub;
  if (String(jwtUserId) !== String(paramId)) {
    return { ok: false, status: 403, message: 'You can only manage your own emergency contacts' };
  }
  return { ok: true, token };
}

router.get('/:id/emergency-contacts', async (req, res) => {
  try {
    const auth = authorizePassenger(req, req.params.id);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

    const passenger = await Passenger.findById(req.params.id).select('emergencyContacts');
    if (!passenger) return res.status(404).json({ message: 'Passenger not found' });
    res.json({ contacts: passenger.emergencyContacts || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/emergency-contacts', async (req, res) => {
  try {
    const auth = authorizePassenger(req, req.params.id);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

    const { name, phone, relationship } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Contact name is required' });
    }
    const normalized = normalizeIndianPhone(phone);
    if (!normalized) {
      return res.status(400).json({ message: 'Enter a valid Indian mobile number (10 digits, starts 6-9)' });
    }

    const passenger = await Passenger.findById(req.params.id);
    if (!passenger) return res.status(404).json({ message: 'Passenger not found' });

    passenger.emergencyContacts = passenger.emergencyContacts || [];

    const existing = passenger.emergencyContacts.find((c) => normalizeIndianPhone(c.phone) === normalized);
    if (existing) {
      existing.name = name.trim();
      existing.phone = normalized;
      if (relationship) existing.relationship = String(relationship).trim();
    } else {
      if (passenger.emergencyContacts.length >= MAX_EMERGENCY_CONTACTS) {
        return res.status(400).json({
          message: `You can save up to ${MAX_EMERGENCY_CONTACTS} emergency contacts`
        });
      }
      passenger.emergencyContacts.push({
        name: name.trim(),
        phone: normalized,
        relationship: relationship ? String(relationship).trim() : undefined
      });
    }

    passenger.markModified('emergencyContacts');
    await passenger.save();
    res.status(201).json({ contacts: passenger.emergencyContacts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id/emergency-contacts/:contactId', async (req, res) => {
  try {
    const auth = authorizePassenger(req, req.params.id);
    if (!auth.ok) return res.status(auth.status).json({ message: auth.message });

    if (!mongoose.isValidObjectId(req.params.contactId)) {
      return res.status(400).json({ message: 'Invalid contact id' });
    }
    const passenger = await Passenger.findById(req.params.id);
    if (!passenger) return res.status(404).json({ message: 'Passenger not found' });

    passenger.emergencyContacts = (passenger.emergencyContacts || []).filter(
      (c) => String(c._id) !== String(req.params.contactId)
    );
    passenger.markModified('emergencyContacts');
    await passenger.save();
    res.json({ contacts: passenger.emergencyContacts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await Driver.findById(req.params.id) || await Passenger.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update lady-safety gender preferences for either role.
// Accepts: { gender?, preferredDriverGender? } for passengers
// or       { gender?, preferredPassengerGender? } for drivers.
router.patch('/:id/safety-prefs', async (req, res) => {
  try {
    const { gender, preferredDriverGender, preferredPassengerGender } = req.body || {};

    if (gender && !['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ message: 'Invalid gender value' });
    }
    if (preferredDriverGender && !['male', 'female', 'any'].includes(preferredDriverGender)) {
      return res.status(400).json({ message: 'Invalid preferredDriverGender value' });
    }
    if (preferredPassengerGender && !['male', 'female', 'any'].includes(preferredPassengerGender)) {
      return res.status(400).json({ message: 'Invalid preferredPassengerGender value' });
    }

    // Try driver first, then passenger. Each role only gets the fields it owns.
    let driver = await Driver.findById(req.params.id);
    if (driver) {
      if (gender) driver.gender = gender;
      if (preferredPassengerGender) driver.preferredPassengerGender = preferredPassengerGender;
      await driver.save();
      return res.json({ success: true, user: driver });
    }

    const passenger = await Passenger.findById(req.params.id);
    if (passenger) {
      if (gender) passenger.gender = gender;
      if (preferredDriverGender) passenger.preferredDriverGender = preferredDriverGender;
      await passenger.save();
      return res.json({ success: true, user: passenger });
    }

    return res.status(404).json({ message: 'User not found' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    let user = await Driver.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!user) {
      user = await Passenger.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await Driver.findByIdAndDelete(req.params.id) || await Passenger.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;





