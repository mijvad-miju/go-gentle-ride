import express from 'express';
import Earning from '../models/Earning.js';

const router = express.Router();

// Get all earnings
router.get('/', async (req, res) => {
  try {
    const earnings = await Earning.find()
      .populate('driverId', 'name phone')
      .populate('rideId')
      .sort({ date: -1 });
    res.json(earnings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get earnings by driver ID
router.get('/driver/:driverId', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = { driverId: req.params.driverId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const earnings = await Earning.find(query)
      .populate('rideId')
      .sort({ date: -1 });
    
    // Calculate totals
    const totalEarnings = earnings.reduce((sum, earning) => sum + earning.amount, 0);
    const totalTrips = earnings.length;
    
    res.json({
      earnings,
      summary: {
        totalEarnings,
        totalTrips,
        averagePerTrip: totalTrips > 0 ? totalEarnings / totalTrips : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get today's earnings for a driver
router.get('/driver/:driverId/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const earnings = await Earning.find({
      driverId: req.params.driverId,
      date: {
        $gte: today,
        $lt: tomorrow
      },
      status: 'completed'
    })
      .populate('rideId');

    const totalEarnings = earnings.reduce((sum, earning) => sum + earning.amount, 0);
    const totalTrips = earnings.length;

    res.json({
      earnings,
      totalEarnings,
      totalTrips
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get weekly earnings for a driver
router.get('/driver/:driverId/week', async (req, res) => {
  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const earnings = await Earning.find({
      driverId: req.params.driverId,
      date: {
        $gte: weekAgo,
        $lte: today
      },
      status: 'completed'
    })
      .populate('rideId')
      .sort({ date: -1 });

    const totalEarnings = earnings.reduce((sum, earning) => sum + earning.amount, 0);
    const totalTrips = earnings.length;

    res.json({
      earnings,
      totalEarnings,
      totalTrips
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;





