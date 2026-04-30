import express from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Earning from '../models/Earning.js';

const router = express.Router();

// Clear all dummy/test data (use with caution!)
router.delete('/clear-all-data', async (req, res) => {
  try {
    // Delete all users
    const userResult = await User.deleteMany({});
    
    // Delete all rides
    const rideResult = await Ride.deleteMany({});
    
    // Delete all earnings
    const earningResult = await Earning.deleteMany({});

    res.json({
      message: 'All data cleared successfully',
      deleted: {
        users: userResult.deletedCount,
        rides: rideResult.deletedCount,
        earnings: earningResult.deletedCount
      }
    });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ 
      message: 'Error clearing data',
      error: error.message 
    });
  }
});

// Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const passengerCount = await User.countDocuments({ role: 'passenger' });
    const driverCount = await User.countDocuments({ role: 'driver' });
    const rideCount = await Ride.countDocuments();
    const earningCount = await Earning.countDocuments();

    res.json({
      users: {
        total: userCount,
        passengers: passengerCount,
        drivers: driverCount
      },
      rides: rideCount,
      earnings: earningCount
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error getting statistics',
      error: error.message 
    });
  }
});

export default router;





