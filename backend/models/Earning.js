import mongoose from 'mongoose';

const earningSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
    index: true
  },
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Breakdown of earnings
  breakdown: {
    baseFare: Number,
    distanceFare: Number,
    timeFare: Number,
    surgeMultiplier: {
      type: Number,
      default: 1
    },
    commission: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  }
});

// Index for efficient queries
earningSchema.index({ driverId: 1, date: -1 });
earningSchema.index({ date: 1 });

const Earning = mongoose.model('Earning', earningSchema);

export default Earning;





