import mongoose from 'mongoose';

const passengerSchema = new mongoose.Schema({
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
  role: {
    type: String,
    default: 'passenger'
  },
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

passengerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Passenger = mongoose.model('Passenger', passengerSchema);

export default Passenger;
