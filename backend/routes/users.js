import express from 'express';
import Passenger from '../models/Passenger.js';
import Driver from '../models/Driver.js';

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





