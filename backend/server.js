import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import rideRoutes from './routes/rides.js';
import earningRoutes from './routes/earnings.js';
import adminRoutes from './routes/admin.js';
import voiceRoutes from './routes/voice.js';
import geocodeRoutes from './routes/geocode.js';
import safetyRoutes from './routes/safety.js';
import shareRoutes from './routes/share.js';
import { startScheduler } from './services/scheduler.js';

// Always load backend/.env (works when Node cwd is repo root or backend/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to database
connectDB();

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust in production
    methods: ["GET", "POST"]
  }
});

// Pass io to routes via app
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));

// Socket.io Connection Logic
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join_driver_room', () => {
    socket.join('drivers');
    console.log(`Socket ${socket.id} joined drivers room`);
  });

  socket.on('join_passenger_room', (passengerId) => {
    if (!passengerId) return;
    socket.join(`passenger_${passengerId}`);
    console.log(`Socket ${socket.id} joined passenger_${passengerId}`);
  });

  socket.on('join_ride', (rideId) => {
    socket.join(`ride_${rideId}`);
    console.log(`Socket ${socket.id} joined ride_${rideId}`);
  });

  socket.on('join_share', (token) => {
    if (!token || typeof token !== 'string' || token.length < 16) return;
    socket.join(`track_${token}`);
    console.log(`Socket ${socket.id} joined share track_${token.slice(0, 8)}…`);
  });

  socket.on('join_driver_tracking', (driverId) => {
    let id = '';
    if (driverId == null) return;
    if (typeof driverId === 'object' && driverId._id != null) id = String(driverId._id);
    else id = String(driverId);
    if (!id || id === 'undefined' || id === 'null' || id === '[object Object]') return;
    socket.join(`tracking_${id}`);
    console.log(`Socket ${socket.id} joined tracking_${id}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start Background Workers
startScheduler(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/earnings', earningRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/voice-booking', voiceRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api', shareRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Auto Rickshaw Booking API is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Auto Rickshaw Booking API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      users: '/api/users',
      rides: '/api/rides',
      earnings: '/api/earnings'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = Number(process.env.PORT) || 5000;
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the other process or set PORT in backend/.env.`);
  } else {
    console.error('❌ HTTP server error:', err);
  }
  process.exit(1);
});
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
