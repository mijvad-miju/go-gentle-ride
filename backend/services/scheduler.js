import Ride from '../models/Ride.js';
import { sanitizeRideDoc } from '../utils/ridePayload.js';
import { assignPickupOtpAndNotify } from './pickupOtp.js';

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
        io.to('drivers').emit('new_ride', sanitizeRideDoc(ride));
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
        await assignPickupOtpAndNotify(io, ride._id, { emitScheduledDue: true });
        console.log(`Scheduled ride ${ride._id} is due — status accepted, OTP assigned, scheduled_ride_due emitted`);
      }

      // 4) Mid-trip stop requests: auto-reject anything past its expiresAt.
      //    Runs on the same 30s tick — fine because the request TTL itself is 30s.
      const expiredStopReqs = await Ride.find({
        'pendingStopRequest.expiresAt': { $ne: null, $lte: now }
      })
        .select('_id passengerId driverId pendingStopRequest')
        .limit(50);

      for (const ride of expiredStopReqs) {
        const rejectedAddress = ride.pendingStopRequest?.address;
        ride.pendingStopRequest = undefined;
        await ride.save();

        const driverId = ride.driverId ? String(ride.driverId) : null;
        const passengerId = ride.passengerId ? String(ride.passengerId) : null;
        const payload = {
          rideId: String(ride._id),
          address: rejectedAddress,
          reason: 'timeout'
        };
        io.to(`ride_${ride._id}`).emit('stop_rejected', payload);
        if (driverId) io.to(`tracking_${driverId}`).emit('stop_rejected', payload);
        if (passengerId) io.to(`passenger_${passengerId}`).emit('stop_rejected', payload);
        console.log(`[stop-expire] auto-rejected pending stop on ride ${ride._id}`);
      }
    } catch (error) {
      console.error('Error in scheduled rides worker:', error);
    }
  }, 30 * 1000);
};
