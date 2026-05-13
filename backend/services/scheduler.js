import Ride from '../models/Ride.js';

/**
 * Starts a background worker to periodically check for scheduled rides
 * that are due or approaching pickup time.
 * @param {object} io - Socket.io instance to broadcast events
 */
export const startScheduler = (io) => {
  console.log('⌛ Starting scheduled rides worker...');

  // Check every 30s so pickup-time handling is not skipped between sparse ticks
  setInterval(async () => {
    try {
      const now = new Date();

      // 1) Unassigned scheduled rides: pickup time has arrived (or passed) — broadcast as immediate requests.
      //    Old logic used only a ±1 minute window around "now", which permanently missed overdue rides.
      const dueUnassigned = await Ride.find({
        status: 'scheduled',
        isScheduled: true,
        driverId: null,
        scheduledFor: { $lte: now }
      })
        .populate('passengerId', 'name phone profilePhoto')
        .sort({ scheduledFor: 1 })
        .limit(50);

      for (const ride of dueUnassigned) {
        ride.status = 'pending';
        ride.expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
        await ride.save();
        io.to('drivers').emit('new_ride', ride);
        console.log(`Scheduled ride ${ride._id} is due with no driver — broadcast as pending`);
      }

      // 2) Assigned scheduled rides: ping drivers near pickup time (small window around scheduledFor).
      const winMs = 60 * 1000;
      const windowStart = new Date(now.getTime() - winMs);
      const windowEnd = new Date(now.getTime() + winMs);

      const approachingAssigned = await Ride.find({
        status: 'scheduled',
        isScheduled: true,
        driverId: { $ne: null },
        scheduledFor: {
          $gt: windowStart,
          $lte: windowEnd
        }
      }).populate('passengerId', 'name phone profilePhoto');

      for (const ride of approachingAssigned) {
        io.to('drivers').emit('scheduled_ride_approaching', ride);
        console.log(`Notified drivers about approaching assigned scheduled ride ${ride._id}`);
      }

      // 3) Assigned scheduled rides: pickup time has arrived — same "going" mode as an accepted immediate ride.
      const dueAssigned = await Ride.find({
        status: 'scheduled',
        isScheduled: true,
        driverId: { $ne: null },
        scheduledFor: { $lte: now }
      })
        .populate('passengerId', 'name phone profilePhoto')
        .populate('driverId', 'name phone driverInfo')
        .sort({ scheduledFor: 1 })
        .limit(40);

      for (const ride of dueAssigned) {
        ride.status = 'accepted';
        await ride.save();
        const payload = ride.toObject ? ride.toObject() : ride;
        io.to('drivers').emit('scheduled_ride_due', payload);
        console.log(`Scheduled ride ${ride._id} is due — status accepted, scheduled_ride_due emitted`);
      }
    } catch (error) {
      console.error('Error in scheduled rides worker:', error);
    }
  }, 30 * 1000);
};
