import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Passenger from '../models/Passenger.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Earning from '../models/Earning.js';

// Load environment variables
dotenv.config();

const clearDummyData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear all collections
    console.log('🗑️  Clearing dummy data...');

    // Delete all users
    const passengerResult = await Passenger.deleteMany({});
    const driverResult = await Driver.deleteMany({});
    console.log(`   Deleted ${passengerResult.deletedCount} passengers`);
    console.log(`   Deleted ${driverResult.deletedCount} drivers`);

    // Delete all rides
    const rideResult = await Ride.deleteMany({});
    console.log(`   Deleted ${rideResult.deletedCount} rides`);

    // Delete all earnings
    const earningResult = await Earning.deleteMany({});
    console.log(`   Deleted ${earningResult.deletedCount} earnings`);

    console.log('✅ All dummy data cleared successfully!');
    console.log('📊 Database is now clean and ready for new registrations.');

    // Close connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing dummy data:', error);
    process.exit(1);
  }
};

// Run the script
clearDummyData();





