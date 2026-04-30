# Auto Rickshaw Booking - Backend API

Backend server for the Auto Rickshaw Booking application using Node.js, Express, and MongoDB.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   # Copy the example file
   cp env.example .env
   
   # Edit .env and add your MongoDB connection string
   ```

3. **Start the server:**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

4. **Test the API:**
   ```bash
   curl http://localhost:5000/api/health
   ```

## API Endpoints

### Authentication

**Passenger:**
- `POST /api/auth/register` - Register new passenger
  - Body: `{ name, phone, email (optional), password }`
  - Returns: `{ token, user }`
- `POST /api/auth/login` - Login passenger
  - Body: `{ phone, password }`
  - Returns: `{ token, user }`

**Driver:**
- `POST /api/auth/driver/register` - Register new driver
  - Body: `{ name, phone, email (optional), password, gender, address, vehicleNumber, licenseNumber }`
  - Vehicle number format: `KA 01 AB 1234` (State + District + Series + Number)
  - Returns: `{ token, user }`
- `POST /api/auth/driver/login` - Login driver
  - Body: `{ phone, password }`
  - Returns: `{ token, user }`

**Common:**
- `GET /api/auth/verify` - Verify JWT token
  - Headers: `Authorization: Bearer <token>`
  - Returns: `{ user, valid }`

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/drivers/online` - Get online drivers
- `PATCH /api/users/drivers/:id/online-status` - Update driver online status

### Rides
- `GET /api/rides` - Get all rides
- `GET /api/rides/:id` - Get ride by ID
- `POST /api/rides` - Create new ride request
- `GET /api/rides/pending/available` - Get pending rides
- `PATCH /api/rides/:id/accept` - Accept ride
- `PATCH /api/rides/:id/decline` - Decline ride
- `PATCH /api/rides/:id/start` - Start ride
- `PATCH /api/rides/:id/complete` - Complete ride
- `PATCH /api/rides/:id/cancel` - Cancel ride
- `GET /api/rides/user/:userId` - Get user's rides
- `PATCH /api/rides/:id/rate` - Rate ride

### Earnings
- `GET /api/earnings` - Get all earnings
- `GET /api/earnings/driver/:driverId` - Get driver earnings
- `GET /api/earnings/driver/:driverId/today` - Get today's earnings
- `GET /api/earnings/driver/:driverId/week` - Get weekly earnings

## Database Models

- **User**: Stores passengers and drivers
- **Ride**: Stores ride bookings and trips
- **Earning**: Stores driver earnings records

For detailed setup instructions, see [MONGODB_SETUP.md](../MONGODB_SETUP.md)

## Database Management

- `npm run clear-data` - Clear all dummy/test data from database
- `GET /api/admin/stats` - Get database statistics
- `DELETE /api/admin/clear-all-data` - Clear all data via API

For more information, see [DATABASE_CONNECTION_GUIDE.md](../DATABASE_CONNECTION_GUIDE.md)

