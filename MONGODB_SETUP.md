# MongoDB Database Setup Guide for Auto Rickshaw Booking App

This guide will walk you through setting up MongoDB for your Auto Rickshaw Booking application step by step.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Option 1: MongoDB Atlas (Cloud - Recommended)](#option-1-mongodb-atlas-cloud---recommended)
3. [Option 2: Local MongoDB Installation](#option-2-local-mongodb-installation)
4. [Backend Setup](#backend-setup)
5. [Database Models Overview](#database-models-overview)
6. [Testing the Connection](#testing-the-connection)
7. [API Endpoints](#api-endpoints)

---

## Prerequisites

- Node.js installed (v16 or higher)
- npm or yarn package manager
- A code editor (VS Code recommended)

---

## Option 1: MongoDB Atlas (Cloud - Recommended)

MongoDB Atlas is a cloud-hosted MongoDB service. It's free for development and doesn't require local installation.

### Step 1: Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Click **"Try Free"** or **"Sign Up"**
3. Fill in your details and create an account
4. Verify your email address

### Step 2: Create a Cluster

1. After logging in, you'll see the **"Deploy a cloud database"** screen
2. Choose **"M0 FREE"** (Free tier) - This is perfect for development
3. Select a cloud provider (AWS, Google Cloud, or Azure)
4. Choose a region closest to you
5. Click **"Create"** (cluster name will be auto-generated)

**Note:** Cluster creation takes 3-5 minutes. Wait for it to finish.

### Step 3: Create Database User

1. Once the cluster is ready, you'll see a **"Get started"** screen
2. Under **"Create a Database User"**:
   - Enter a username (e.g., `admin` or `appuser`)
   - Enter a strong password (save this password!)
   - Click **"Create User"**

### Step 4: Configure Network Access

1. Under **"Network Access"**:
   - Click **"Add IP Address"**
   - For development, click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
   - Click **"Confirm"**

**Note:** For production, you should whitelist only specific IP addresses.

### Step 5: Get Connection String

1. Click **"Connect"** button on your cluster
2. Choose **"Connect your application"**
3. Select **"Node.js"** as the driver
4. Copy the connection string. It will look like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<username>` and `<password>` with your database user credentials
6. Add your database name at the end:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/auto-taxi-booking-app?retryWrites=true&w=majority
   ```

### Step 6: Save Connection String

You'll use this connection string in the `.env` file (see Backend Setup section below).

---

## Option 2: Local MongoDB Installation

If you prefer to run MongoDB on your local machine:

### Windows Installation

1. **Download MongoDB:**
   - Go to [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
   - Select Windows as your platform
   - Choose MSI installer
   - Click **"Download"**

2. **Install MongoDB:**
   - Run the downloaded `.msi` file
   - Choose **"Complete"** installation
   - Check **"Install MongoDB as a Service"**
   - Click **"Install"**

3. **Verify Installation:**
   - Open Command Prompt or PowerShell
   - Run: `mongod --version`
   - You should see the MongoDB version

4. **Start MongoDB:**
   - MongoDB should start automatically as a Windows service
   - If not, open Services (Win + R, type `services.msc`)
   - Find "MongoDB" and start it

5. **Connection String:**
   - Local MongoDB connection string: `mongodb://127.0.0.1:27017/auto-taxi-booking-app`

### macOS Installation

1. **Using Homebrew (Recommended):**
   ```bash
   brew tap mongodb/brew
   brew install mongodb-community
   ```

2. **Start MongoDB:**
   ```bash
   brew services start mongodb-community
   ```

3. **Connection String:**
   - `mongodb://127.0.0.1:27017/auto-taxi-booking-app`

### Linux Installation

1. **Install MongoDB:**
   ```bash
   # For Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y mongodb
   
   # For CentOS/RHEL
   sudo yum install -y mongodb
   ```

2. **Start MongoDB:**
   ```bash
   sudo systemctl start mongod
   sudo systemctl enable mongod
   ```

3. **Connection String:**
   - `mongodb://127.0.0.1:27017/auto-taxi-booking-app`

---

## Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- `express` - Web framework
- `mongoose` - MongoDB object modeling
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variables

### Step 3: Create Environment File

1. Copy the example environment file:
   ```bash
   # Windows
   copy .env.example .env
   
   # macOS/Linux
   cp .env.example .env
   ```

2. Open `.env` file and update it:

   **For MongoDB Atlas:**
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/auto-taxi-booking-app?retryWrites=true&w=majority
   PORT=5000
   NODE_ENV=development
   ```

   **For Local MongoDB:**
   ```env
   MONGODB_URI=mongodb://127.0.0.1:27017/auto-taxi-booking-app
   PORT=5000
   NODE_ENV=development
   ```

   **Important:** Replace `username` and `password` with your actual MongoDB credentials!

### Step 4: Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Or production mode
npm start
```

You should see:
```
✅ MongoDB Connected: ...
🚀 Server running on port 5000
```

---

## Database Models Overview

The database includes the following collections (tables):

### 1. **Users Collection**
Stores both passengers and drivers:
- User information (name, phone, email, role)
- Passenger data (emergency contacts, saved locations)
- Driver data (license, vehicle info, online status, location, ratings)

### 2. **Rides Collection**
Stores all ride bookings:
- Passenger and driver references
- Pickup and dropoff locations
- Fare information (estimated and final)
- Distance and duration
- Status (pending, accepted, in_progress, completed, cancelled)
- Payment information
- Ratings and reviews

### 3. **Earnings Collection**
Stores driver earnings:
- Driver reference
- Ride reference
- Amount earned
- Date and breakdown
- Status

---

## Testing the Connection

### Test 1: Health Check

Open your browser or use curl:
```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "Auto Rickshaw Booking API is running",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Test 2: Create a Test User

Using curl or Postman:
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "1234567890",
    "role": "passenger"
  }'
```

### Test 3: View All Users

```bash
curl http://localhost:5000/api/users
```

---

## API Endpoints

### Users Endpoints
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/drivers/online` - Get online drivers
- `PATCH /api/users/drivers/:id/online-status` - Update driver online status

### Rides Endpoints
- `GET /api/rides` - Get all rides
- `GET /api/rides/:id` - Get ride by ID
- `POST /api/rides` - Create new ride request
- `GET /api/rides/pending/available` - Get pending rides (for drivers)
- `PATCH /api/rides/:id/accept` - Accept ride (driver)
- `PATCH /api/rides/:id/decline` - Decline ride (driver)
- `PATCH /api/rides/:id/start` - Start ride
- `PATCH /api/rides/:id/complete` - Complete ride
- `PATCH /api/rides/:id/cancel` - Cancel ride
- `GET /api/rides/user/:userId` - Get user's rides
- `PATCH /api/rides/:id/rate` - Rate ride

### Earnings Endpoints
- `GET /api/earnings` - Get all earnings
- `GET /api/earnings/driver/:driverId` - Get driver earnings
- `GET /api/earnings/driver/:driverId/today` - Get today's earnings
- `GET /api/earnings/driver/:driverId/week` - Get weekly earnings

---

## Common Issues and Solutions

### Issue 1: "MongoServerError: Authentication failed"
**Solution:** Check your username and password in the connection string. Make sure there are no special characters that need URL encoding.

### Issue 2: "MongooseServerSelectionError: connect ECONNREFUSED"
**Solution:** 
- For Atlas: Check your IP whitelist in Network Access
- For Local: Make sure MongoDB service is running

### Issue 3: "Cannot find module 'express'"
**Solution:** Run `npm install` in the backend directory

### Issue 4: Port already in use
**Solution:** Change the PORT in `.env` file or stop the process using port 5000

---

## Next Steps

1. **Connect Frontend to Backend:**
   - Update your React app to call these API endpoints
   - Use `fetch` or `axios` to make HTTP requests
   - Example: `fetch('http://localhost:5000/api/rides')`

2. **Add Authentication:**
   - Consider adding JWT authentication for secure API access
   - Implement user login/registration

3. **Add Validation:**
   - Add input validation using libraries like `joi` or `express-validator`

4. **Add Error Handling:**
   - Implement comprehensive error handling
   - Add logging (e.g., using `winston`)

5. **Deploy:**
   - Deploy backend to services like Heroku, Railway, or Render
   - Update MongoDB Atlas network access for production

---

## Useful MongoDB Commands

If you're using local MongoDB, you can use the MongoDB shell:

```bash
# Connect to MongoDB
mongosh

# Or for older versions
mongo

# List databases
show dbs

# Use your database
use auto-taxi-booking-app

# Show collections
show collections

# Query users
db.users.find()

# Count documents
db.users.countDocuments()
```

---

## Support

If you encounter any issues:
1. Check the MongoDB connection string format
2. Verify your network/firewall settings
3. Check MongoDB service status (for local installation)
4. Review the error messages in the console

---

**Congratulations!** 🎉 Your MongoDB database is now set up and ready to use!

