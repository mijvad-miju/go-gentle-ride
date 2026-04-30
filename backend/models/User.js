import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
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
    enum: ['passenger', 'driver'],
    required: true
  },
  // Passenger specific fields
  emergencyContacts: [{
    name: String,
    phone: String,
    relationship: String
  }],
  savedLocations: [{
    name: String,
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  }],
  // Driver specific fields
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
  // Common fields
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

// Update the updatedAt field before saving
userSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const User = mongoose.model('User', userSchema);

export default User;

