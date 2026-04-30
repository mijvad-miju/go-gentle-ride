import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Register new passenger
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    // Validate required fields
    if (!name || !phone || !password) {
      return res.status(400).json({
        message: 'Name, phone, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this phone number already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      phone,
      email: email || '',
      password: hashedPassword,
      role: 'passenger'
    });

    const savedUser = await user.save();
    console.log(`✅ New passenger registered: ${savedUser.name} (${savedUser.phone}) - Saved to MongoDB`);

    // Generate JWT token
    const token = jwt.sign(
      { userId: savedUser._id, role: savedUser.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Error registering user',
      error: error.message
    });
  }
});

// Login passenger
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate required fields
    if (!phone || !password) {
      return res.status(400).json({
        message: 'Phone and password are required'
      });
    }

    // Find user by phone
    const user = await User.findOne({ phone, role: 'passenger' });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid phone number or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid phone number or password'
      });
    }

    console.log(`✅ Passenger logged in: ${user.name} (${user.phone}) - From MongoDB`);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Error logging in',
      error: error.message
    });
  }
});

// Register new driver
router.post('/driver/register', async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      gender,
      address,
      vehicleNumber,
      licenseNumber,
      aadharNumber,
      panNumber,
      bankDetails
    } = req.body;

    // Validate required fields
    if (!name || !phone || !password || !vehicleNumber || !licenseNumber || !aadharNumber || !panNumber) {
      return res.status(400).json({
        message: 'Name, phone, password, vehicle number, license number, Aadhar, and PAN are required'
      });
    }

    // Validate Aadhar (12 digits)
    if (!/^\d{12}$/.test(aadharNumber)) {
      return res.status(400).json({ message: 'Invalid Aadhar Number. Must be 12 digits.' });
    }

    // Validate PAN (Standard format)
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid PAN Number format.' });
    }

    // Validate Indian vehicle number plate format
    // Format: XX XX XX XXXX (e.g., KA 01 AB 1234)
    const vehicleNumberRegex = /^[A-Z]{2}\s[0-9]{1,2}\s[A-Z]{1,2}\s[0-9]{4}$/;
    if (!vehicleNumberRegex.test(vehicleNumber.toUpperCase())) {
      return res.status(400).json({
        message: 'Invalid vehicle number format. Use format: KA 01 AB 1234'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this phone number already exists'
      });
    }

    // Check if vehicle number already exists
    const existingVehicle = await User.findOne({
      'driverInfo.vehicleNumber': vehicleNumber.toUpperCase()
    });
    if (existingVehicle) {
      return res.status(400).json({
        message: 'Vehicle number already registered'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new driver user
    const user = new User({
      name,
      phone,
      email: email || '',
      password: hashedPassword,
      gender: gender || '',
      address: address || {},
      role: 'driver',
      driverInfo: {
        licenseNumber,
        vehicleNumber: vehicleNumber.toUpperCase(),
        vehicleType: 'auto',
        isOnline: false,
        rating: 0,
        totalRides: 0,
        isTrusted: false,
        aadharNumber,
        panNumber: panNumber.toUpperCase(),
        bankDetails: bankDetails || {},
        isVerified: false
      }
    });

    const savedUser = await user.save();
    console.log(`✅ New driver registered: ${savedUser.name} (${savedUser.phone}) - Vehicle: ${savedUser.driverInfo.vehicleNumber} - Saved to MongoDB`);

    // Generate JWT token
    const token = jwt.sign(
      { userId: savedUser._id, role: savedUser.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'Driver registered successfully',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Driver registration error:', error);
    res.status(500).json({
      message: 'Error registering driver',
      error: error.message
    });
  }
});

// Login driver
router.post('/driver/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // Validate required fields
    if (!phone || !password) {
      return res.status(400).json({
        message: 'Phone and password are required'
      });
    }

    // Find user by phone and role
    const user = await User.findOne({ phone, role: 'driver' });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid phone number or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid phone number or password'
      });
    }

    console.log(`✅ Driver logged in: ${user.name} (${user.phone}) - Vehicle: ${user.driverInfo.vehicleNumber} - From MongoDB`);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    });
  } catch (error) {
    console.error('Driver login error:', error);
    res.status(500).json({
      message: 'Error logging in',
      error: error.message
    });
  }
});

// Verify token (optional middleware for protected routes)
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key-change-in-production'
    );

    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user, valid: true });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token', valid: false });
  }
});

export default router;

