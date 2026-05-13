import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    fullAddress: String
  },
  role: {
    type: String,
    default: 'driver'
  },
  driverInfo: {
    licenseNumber: String,
    vehicleNumber: String,
    vehicleType: {
      type: String,
      default: 'auto'
    },
    isOnline: {
      type: Boolean,
      default: false
    },
    currentLocation: {
      lat: Number,
      lng: Number
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRides: {
      type: Number,
      default: 0
    },
    isTrusted: {
      type: Boolean,
      default: false
    },
    aadharNumber: {
      type: String,
      trim: true
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true
    },
    bankDetails: {
      accountNumber: String,
      ifscCode: {
        type: String,
        uppercase: true,
        trim: true
      },
      bankName: String
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    photoUrl: String
  },
  profilePhoto: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

driverSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Driver = mongoose.model('Driver', driverSchema);

export default Driver;
