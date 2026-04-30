import Ride from '../models/Ride.js';

/**
 * Starts a background worker to periodically check for scheduled rides
 * that are approaching their pickup time.
 * @param {object} io - Socket.io instance to broadcast events
 */
export const startScheduler = (io) => {
  console.log('⌛ Starting scheduled rides worker...');

  // Check every 1 minute
  setInterval(async () => {
    try {
      const now = new Date();
      // Look for rides exactly 15 minutes away from now
      // Using a window to ensure we don't miss rides if the interval is slightly off
      const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60 * 1000);
      const fourteenMinsFromNow = new Date(now.getTime() + 14 * 60 * 1000);

      const approachingRides = await Ride.find({
        status: 'scheduled',
        isScheduled: true,
        scheduledFor: {
          $lte: fifteenMinsFromNow,
          $gt: fourteenMinsFromNow
        }
      }).populate('passengerId', 'name phone profilePhoto');

      if (approachingRides.length > 0) {
        console.log(`Found ${approachingRides.length} scheduled rides approaching pickup time.`);

        for (const ride of approachingRides) {
          if (ride.driverId) {
            // Driver has already accepted this scheduled ride in advance
            // Notify drivers (the client will check if they are the assigned driver)
            io.to('drivers').emit('scheduled_ride_approaching', ride);
            console.log(`Notified drivers about approaching scheduled ride ${ride._id}`);
          } else {
            // No driver has accepted it yet, broadcast it as a high-priority immediate ride now
            // We temporarily change its status so it acts like a normal pending ride
            ride.status = 'pending';
            // Extend expiry another 5 mins from now
            ride.expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
            await ride.save();

            io.to('drivers').emit('new_ride', ride);
            console.log(`Broadcasted unaccepted scheduled ride ${ride._id} to all drivers`);
          }
        }
      }
    } catch (error) {
      console.error('Error in scheduled rides worker:', error);
    }
  }, 60 * 1000); // Run every minute
};
