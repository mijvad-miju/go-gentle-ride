import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
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
    const user = new User(req.body);
    const savedUser = await user.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
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
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get online drivers
router.get('/drivers/online', async (req, res) => {
  try {
    const drivers = await User.find({
      role: 'driver',
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

    const driver = await User.findByIdAndUpdate(
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

    const driver = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: { 'driverInfo.currentLocation': currentLocation },
        $set: { updatedAt: Date.now() }
      },
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`tracking_${req.params.id}`).emit('driver_location_update', {
        driverId: req.params.id,
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

export default router;





