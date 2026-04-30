import express from 'express';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import Earning from '../models/Earning.js';

const router = express.Router();

// Get all rides
router.get('/', async (req, res) => {
  try {
    const rides = await Ride.find()
      .populate('passengerId', 'name phone profilePhoto')
      .populate('driverId', 'name phone driverInfo')
      .sort({ requestedAt: -1 });
    res.json(rides);
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
    res.json(ride);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new ride request
router.post('/', async (req, res) => {
  try {
    const { isScheduled, scheduledFor, ...rest } = req.body;
    
    const rideData = {
      ...rest,
      isScheduled: isScheduled || false,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      status: isScheduled ? 'scheduled' : 'pending' // Set status based on booking type
    };

    const ride = new Ride(rideData);
    const savedRide = await ride.save();

    // Populate the saved ride
    await savedRide.populate('passengerId', 'name phone profilePhoto');

    // Broadcast to drivers only if it's an immediate ride
    if (!rideData.isScheduled) {
      const io = req.app.get('io');
      if (io) {
        io.to('drivers').emit('new_ride', savedRide);
        console.log('Broadcasted new_ride event to drivers');
      }
    }

    res.status(201).json(savedRide);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get pending rides (for drivers)
router.get('/pending/available', async (req, res) => {
  try {
    const rides = await Ride.find({
      status: 'pending',
      expiresAt: { $gt: new Date() }
    })
      .populate('passengerId', 'name phone profilePhoto')
      .sort({ requestedAt: -1 })
      .limit(10);

    res.json(rides);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get upcoming scheduled rides (for drivers)
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
      .limit(20);

    res.json(upcomingScheduledRides);
  } catch (error) {
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
    ride.status = 'accepted';
    ride.acceptedAt = new Date();

    // Update driver's online status (only if it's an immediate ride)
    // For scheduled rides, driver remains free until the scheduled time
    if (!ride.isScheduled) {
      await User.findByIdAndUpdate(driverId, {
        'driverInfo.isOnline': false // Driver is now on a ride
      });
    }

    const updatedRide = await ride.save();
    await updatedRide.populate('driverId', 'name phone driverInfo');
    await updatedRide.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', updatedRide);
      
      // If it's a scheduled ride, emit a specific event so other drivers remove it from their lists
      if (ride.isScheduled) {
        io.to('drivers').emit('scheduled_ride_accepted', { rideId: updatedRide._id });
      }
    }

    res.json(updatedRide);
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

// Start ride
router.patch('/:id/start', async (req, res) => {
  try {
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        status: 'in_progress',
        startedAt: new Date()
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', ride);
    }

    res.json(ride);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Complete ride
router.patch('/:id/complete', async (req, res) => {
  try {
    const { finalFare } = req.body;

    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        completedAt: new Date(),
        'fare.final': finalFare || ride.fare.estimated,
        paymentStatus: 'completed'
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
      await User.findByIdAndUpdate(ride.driverId, {
        $inc: { 'driverInfo.totalRides': 1 },
        'driverInfo.isOnline': true // Driver is available again
      });
    }

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', ride);
    }

    res.json(ride);
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
        status: 'cancelled',
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    // If driver was assigned, make them available again
    if (ride.driverId && ride.status !== 'completed') {
      await User.findByIdAndUpdate(ride.driverId, {
        'driverInfo.isOnline': true
      });
    }

    await ride.populate('driverId', 'name phone driverInfo');
    await ride.populate('passengerId', 'name phone profilePhoto');

    const io = req.app.get('io');
    if (io) {
      io.to(`ride_${req.params.id}`).emit('ride_updated', ride);
      io.to('drivers').emit('ride_cancelled', { rideId: ride._id });
    }

    res.json(ride);
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

    res.json(rides);
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
      const driver = await User.findById(ride.driverId);
      if (driver) {
        // Calculate new average rating
        const totalRides = driver.driverInfo.totalRides || 1;
        const currentRating = driver.driverInfo.rating || 0;
        const newRating = ((currentRating * (totalRides - 1)) + passengerRating) / totalRides;

        await User.findByIdAndUpdate(ride.driverId, {
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





