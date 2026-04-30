import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema({
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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





