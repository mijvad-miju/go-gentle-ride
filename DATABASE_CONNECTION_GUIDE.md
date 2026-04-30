# Database Connection & Data Management Guide

This guide explains how to connect login/signup credentials to MongoDB and manage database data.

## ✅ Current Setup

The application is **fully connected** to MongoDB. All login and signup credentials are automatically saved to the database:

- **Passenger Registration** → Saves to MongoDB `users` collection
- **Passenger Login** → Validates against MongoDB
- **Driver Registration** → Saves to MongoDB `users` collection with driver info
- **Driver Login** → Validates against MongoDB

## 🗑️ Clearing Dummy Data

### Option 1: Using the Script (Recommended)

Run the cleanup script to clear all dummy data:

```bash
cd backend
npm run clear-data
```

This will:
- Delete all users (passengers and drivers)
- Delete all rides
- Delete all earnings
- Show a summary of deleted records

### Option 2: Using the API Endpoint

You can also clear data via API (use with caution):

```bash
curl -X DELETE http://localhost:5000/api/admin/clear-all-data
```

### Option 3: Manual MongoDB Commands

If you have MongoDB shell access:

```bash
mongosh
use auto-taxi-booking-app
db.users.deleteMany({})
db.rides.deleteMany({})
db.earnings.deleteMany({})
```

## 📊 Check Database Statistics

View current database statistics:

```bash
curl http://localhost:5000/api/admin/stats
```

Response:
```json
{
  "users": {
    "total": 5,
    "passengers": 3,
    "drivers": 2
  },
  "rides": 10,
  "earnings": 8
}
```

## 🔍 Verify Data is Being Saved

### 1. Check Backend Logs

When you register or login, you should see logs like:

```
✅ New passenger registered: John Doe (1234567890) - Saved to MongoDB
✅ Passenger logged in: John Doe (1234567890) - From MongoDB
✅ New driver registered: Ramesh Kumar (9876543210) - Vehicle: KA 01 AB 1234 - Saved to MongoDB
✅ Driver logged in: Ramesh Kumar (9876543210) - Vehicle: KA 01 AB 1234 - From MongoDB
```

### 2. Check MongoDB Directly

Using MongoDB shell:

```bash
mongosh
use auto-taxi-booking-app
db.users.find().pretty()
```

You should see all registered users with their details (passwords are hashed).

### 3. Check via API

```bash
# Get all users
curl http://localhost:5000/api/users

# Get specific user
curl http://localhost:5000/api/users/USER_ID
```

## 🚀 Testing the Connection

### Step 1: Start MongoDB

Make sure MongoDB is running:

```bash
# Windows (if installed as service, it should be running)
# Check with: services.msc

# Or start manually
mongod
```

### Step 2: Start Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
✅ MongoDB Connected: 127.0.0.1
🚀 Server running on port 5000
📍 Environment: development
```

### Step 3: Test Registration

**Test Passenger Registration:**
1. Open the app
2. Click "Passenger"
3. Click "Sign Up"
4. Fill in:
   - Name: Test User
   - Phone: 1234567890
   - Password: test123
5. Click "Create Account"

**Check Backend Console:**
You should see:
```
✅ New passenger registered: Test User (1234567890) - Saved to MongoDB
```

**Verify in MongoDB:**
```bash
mongosh
use auto-taxi-booking-app
db.users.findOne({ phone: "1234567890" })
```

### Step 4: Test Login

1. Go to login page
2. Enter phone: 1234567890
3. Enter password: test123
4. Click "Sign In"

**Check Backend Console:**
You should see:
```
✅ Passenger logged in: Test User (1234567890) - From MongoDB
```

## 📝 Data Structure in MongoDB

### Users Collection

```javascript
{
  _id: ObjectId("..."),
  name: "John Doe",
  phone: "1234567890",
  email: "john@example.com",
  password: "$2a$10$...", // Hashed with bcrypt
  role: "passenger" | "driver",
  gender: "male" | "female" | "other",
  address: {
    street: "123 Main St",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560001",
    fullAddress: "123 Main St, Bangalore, Karnataka 560001"
  },
  // Driver specific
  driverInfo: {
    licenseNumber: "DL1234567890123",
    vehicleNumber: "KA 01 AB 1234",
    vehicleType: "auto",
    isOnline: false,
    rating: 0,
    totalRides: 0,
    isTrusted: false
  },
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

## 🔒 Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt before storage
2. **No Plain Text Passwords**: Passwords are never stored in plain text
3. **JWT Tokens**: Secure token-based authentication
4. **Phone Uniqueness**: Each phone number can only be registered once
5. **Vehicle Uniqueness**: Each vehicle number can only be registered once

## 🐛 Troubleshooting

### "MongoDB connection error"

**Solution:**
1. Make sure MongoDB is running
2. Check connection string in `.env` file
3. Verify MongoDB is accessible at `127.0.0.1:27017`

### "User already exists"

**Solution:**
- The phone number is already registered
- Try logging in instead
- Or clear the database and try again

### "Cannot connect to MongoDB"

**Solution:**
1. Check if MongoDB service is running
2. Verify the connection string: `mongodb://127.0.0.1:27017/auto-taxi-booking-app`
3. Check MongoDB logs for errors

### Data not saving

**Check:**
1. Backend server is running
2. MongoDB is running
3. Check backend console for errors
4. Verify `.env` file has correct `MONGODB_URI`

## 📚 API Endpoints for Data Management

- `GET /api/admin/stats` - Get database statistics
- `DELETE /api/admin/clear-all-data` - Clear all data (use with caution!)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get specific user

## ✅ Verification Checklist

- [ ] MongoDB is running
- [ ] Backend server is running
- [ ] `.env` file exists with correct `MONGODB_URI`
- [ ] Can register a new passenger
- [ ] Can login with registered passenger
- [ ] Can register a new driver
- [ ] Can login with registered driver
- [ ] Data appears in MongoDB
- [ ] Backend logs show "Saved to MongoDB" messages

---

**All credentials are now automatically saved to MongoDB!** 🎉





