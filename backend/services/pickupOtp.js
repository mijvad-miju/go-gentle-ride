import crypto from 'crypto';
import twilio from 'twilio';
import Ride from '../models/Ride.js';
import { sanitizeRideDoc } from '../utils/ridePayload.js';

export function generatePickupOtp() {
  return String(crypto.randomInt(1000, 10000));
}

/** Best-effort E.164 for India (Twilio trial accounts often need verified numbers). */
export function toIndiaE164(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `+91${digits.slice(-10)}`;
}

export async function sendPassengerPickupOtpSms(toE164, otp) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  const body = `Your Auto ride OTP is ${otp}. Tell your driver this code only after you board. Do not share it before.`;

  if (!sid || !token || !from) {
    console.warn(
      '[pickup-otp] Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER. SMS skipped.'
    );
    return false;
  }
  if (!toE164) {
    console.warn('[pickup-otp] No valid passenger phone — SMS skipped.');
    return false;
  }

  try {
    const client = twilio(sid, token);
    await client.messages.create({ to: toE164, from, body });
    return true;
  } catch (e) {
    console.error('[pickup-otp] Twilio SMS error:', e.message || e);
    return false;
  }
}

/**
 * Sets a new pickup OTP, optionally SMS via Twilio, emits sanitized ride_updated,
 * and notifies the passenger room for in-app display.
 * @param {import('socket.io').Server | null} io
 * @param {import('mongoose').Types.ObjectId | string} rideId
 * @param {{ emitScheduledDue?: boolean }} [options]
 */
export async function assignPickupOtpAndNotify(io, rideId, options = {}) {
  const otp = generatePickupOtp();
  const pickupOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await Ride.updateOne({ _id: rideId }, { $set: { pickupOtp: otp, pickupOtpExpiresAt } });

  const ride = await Ride.findById(rideId)
    .populate('passengerId', 'name phone profilePhoto')
    .populate('driverId', 'name phone driverInfo');

  if (!ride) return;

  const passenger = ride.passengerId;
  const phone =
    passenger && typeof passenger === 'object' && 'phone' in passenger ? passenger.phone : null;
  const e164 = toIndiaE164(String(phone || ''));
  await sendPassengerPickupOtpSms(e164, otp);

  if (io) {
    const safe = sanitizeRideDoc(ride);
    io.to(`ride_${String(rideId)}`).emit('ride_updated', safe);
    if (options.emitScheduledDue) {
      io.to('drivers').emit('scheduled_ride_due', safe);
    }

    const pid =
      passenger && typeof passenger === 'object' && passenger._id != null
        ? String(passenger._id)
        : passenger != null
          ? String(passenger)
          : null;
    if (pid) {
      io.to(`passenger_${pid}`).emit('passenger_pickup_otp', {
        rideId: String(rideId),
        otp,
        pickupOtpExpiresAt: pickupOtpExpiresAt.toISOString()
      });
    }
  }
}
