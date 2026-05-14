import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Passenger',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  pickupLocation: {
    address: {
      type: String,
      required: true
    },
    coordinates: {
      lat: {
        type: Number,
        required: true
      },
      lng: {
        type: Number,
        required: true
      }
    }
  },
  dropoffLocation: {
    address: {
      type: String,
      required: true
    },
    coordinates: {
      lat: {
        type: Number,
        required: true
      },
      lng: {
        type: Number,
        required: true
      }
    }
  },
  // Multi-stop itinerary. Visited in array order between pickup and dropoff.
  // `source` distinguishes stops added at booking-time vs mid-trip (driver-approved).
  stops: [{
    address: { type: String, required: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    source: { type: String, enum: ['booking', 'mid_trip'], default: 'booking' },
    status: { type: String, enum: ['pending', 'visited', 'skipped'], default: 'pending' },
    addedAt: { type: Date, default: Date.now },
    visitedAt: { type: Date, default: null }
  }],
  // Mid-trip stop awaiting driver acceptance. Auto-rejects after `expiresAt`.
  pendingStopRequest: {
    address: { type: String, default: null },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    },
    fareDelta: { type: Number, default: 0 },
    distanceDeltaKm: { type: Number, default: 0 },
    durationDeltaMin: { type: Number, default: 0 },
    requestedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  fare: {
    estimated: {
      type: Number,
      required: true
    },
    final: {
      type: Number,
      default: null
    }
  },
  distance: {
    value: {
      type: Number, // in kilometers
      required: true
    },
    text: {
      type: String, // e.g., "3.2 km"
      required: true
    }
  },
  duration: {
    value: {
      type: Number, // in minutes
      required: true
    },
    text: {
      type: String, // e.g., "12 min"
      required: true
    }
  },
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  // Payment
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'card', 'wallet'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  // Rating and review
  rating: {
    passengerRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    driverRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null
    },
    passengerReview: String,
    driverReview: String
  },
  // Voice Booking Info
  isVoiceBooking: {
    type: Boolean,
    default: false
  },
  voiceTranscript: {
    type: String,
    default: null
  },
  /** 4-digit OTP: passenger shares with driver to start trip. Hidden from default queries. */
  pickupOtp: {
    type: String,
    default: null,
    select: false
  },
  pickupOtpExpiresAt: {
    type: Date,
    default: null,
    select: false
  },
  // Live-share token: lets the passenger generate a public read-only tracking URL.
  // `select: false` keeps the token out of the default ride payloads — only the
  // share routes opt-in to read it.
  shareToken: {
    type: String,
    index: true,
    sparse: true,
    select: false,
    default: null
  },
  shareExpiresAt: {
    type: Date,
    default: null,
    select: false
  },
  // Lady-safety: gender preference snapshot at ride creation time.
  // Driver's own preferredPassengerGender is read live from the Driver doc when matching.
  passengerGender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null
  },
  preferredDriverGender: {
    type: String,
    enum: ['male', 'female', 'any'],
    default: 'any'
  },
  /** When true, the passenger-side gender filter is enforced during dispatch.
   *  Cleared (false) when the passenger taps "expand search" after 60s. */
  genderFilterActive: {
    type: Boolean,
    default: true
  },
  // Scheduled Ride Info
  isScheduled: {
    type: Boolean,
    default: false
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  // Request expiry (for driver acceptance)
  expiresAt: {
    type: Date,
    default: function () {
      // If it's a scheduled ride, don't expire it immediately
      if (this.isScheduled && this.scheduledFor) {
        // Expire 30 mins after scheduled time if not accepted/started
        return new Date(this.scheduledFor.getTime() + 30 * 60 * 1000);
      }
      return new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now for immediate rides
    }
  }
});

// Index for finding available rides
rideSchema.index({ status: 1, requestedAt: -1 });
rideSchema.index({ driverId: 1, status: 1 });
rideSchema.index({ passengerId: 1, status: 1 });

const Ride = mongoose.model('Ride', rideSchema);

export default Ride;





