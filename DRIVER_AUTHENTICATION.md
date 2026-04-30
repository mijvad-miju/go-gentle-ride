# Driver Authentication Setup

This document explains the driver authentication system for the Auto Rickshaw Booking app.

## Overview

Drivers can now register and login with comprehensive information including:
- Personal details (name, phone, email, gender)
- Vehicle information (number plate, license number)
- Address details (street, city, state, pincode)

## Features

### Registration Fields

**Required Fields:**
- Full Name
- Phone Number
- Password
- Vehicle Number Plate (Indian format)
- Driving License Number

**Optional Fields:**
- Email
- Gender (Male/Female/Other)
- Address (Street, City, State, Pincode)
- Full Address (Text area)

### Vehicle Number Plate Format

Indian vehicle number plates follow this format:
- **Format:** `XX XX XX XXXX`
- **Example:** `KA 01 AB 1234`
  - `KA` - State code (2 letters)
  - `01` - District code (1-2 digits)
  - `AB` - Series (1-2 letters)
  - `1234` - Number (4 digits)

The form automatically formats the input as you type and validates the format.

## Backend API Endpoints

### Register Driver

```http
POST /api/auth/driver/register
Content-Type: application/json

{
  "name": "Ramesh Kumar",
  "phone": "9876543210",
  "email": "ramesh@example.com",
  "password": "password123",
  "gender": "male",
  "address": {
    "street": "123 Main Street",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001",
    "fullAddress": "123 Main Street, Bangalore, Karnataka 560001"
  },
  "vehicleNumber": "KA 01 AB 1234",
  "licenseNumber": "DL1234567890123"
}
```

**Response:**
```json
{
  "message": "Driver registered successfully",
  "token": "jwt-token-here",
  "user": {
    "_id": "...",
    "name": "Ramesh Kumar",
    "phone": "9876543210",
    "role": "driver",
    "driverInfo": {
      "vehicleNumber": "KA 01 AB 1234",
      "licenseNumber": "DL1234567890123",
      "isOnline": false
    }
  }
}
```

### Login Driver

```http
POST /api/auth/driver/login
Content-Type: application/json

{
  "phone": "9876543210",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt-token-here",
  "user": {
    "_id": "...",
    "name": "Ramesh Kumar",
    "phone": "9876543210",
    "role": "driver"
  }
}
```

## Frontend Usage

### Accessing Driver Login

1. From the home page, click **"Driver"**
2. You'll be redirected to `/driver/login`
3. Toggle between **"Sign In"** and **"Sign Up"**

### Registration Process

1. Click **"Sign Up"** (if not already in register mode)
2. Fill in all required fields:
   - Name
   - Phone number
   - Vehicle number (format: `KA 01 AB 1234`)
   - License number
   - Password
3. Optionally fill in:
   - Email
   - Gender
   - Address details
4. Click **"Register as Driver"**
5. Upon success, you'll be redirected to the driver dashboard

### Login Process

1. Enter your phone number
2. Enter your password
3. Click **"Sign In"**
4. Upon success, you'll be redirected to the driver dashboard

## Validation

### Vehicle Number Validation

The system validates vehicle numbers using this regex pattern:
```javascript
/^[A-Z]{2}\s[0-9]{1,2}\s[A-Z]{1,2}\s[0-9]{4}$/
```

**Valid Examples:**
- `KA 01 AB 1234`
- `DL 1 CA 5678`
- `MH 12 XY 9012`
- `TN 05 CD 3456`

**Invalid Examples:**
- `KA01AB1234` (missing spaces)
- `KA 1 AB 123` (wrong number of digits)
- `K 01 AB 1234` (wrong state code length)

### Password Validation

- Minimum 6 characters required
- No maximum length (but recommended to keep it reasonable)

### Phone Number

- Must be unique across all users
- No specific format validation (but should be a valid phone number)

## Database Schema

The User model includes these driver-specific fields:

```javascript
{
  name: String (required),
  phone: String (required, unique),
  email: String (optional),
  password: String (required, hashed),
  gender: String (enum: 'male', 'female', 'other'),
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    fullAddress: String
  },
  role: 'driver',
  driverInfo: {
    licenseNumber: String (required),
    vehicleNumber: String (required, unique),
    vehicleType: 'auto' (default),
    isOnline: Boolean (default: false),
    rating: Number (default: 0),
    totalRides: Number (default: 0),
    isTrusted: Boolean (default: false)
  }
}
```

## Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt
2. **JWT Tokens**: Secure token-based authentication
3. **Vehicle Number Uniqueness**: Each vehicle can only be registered once
4. **Phone Number Uniqueness**: Each phone number can only be registered once
5. **Protected Routes**: Driver dashboard requires authentication

## Error Handling

### Common Errors

**"Invalid vehicle number format"**
- Solution: Use format `KA 01 AB 1234` (State + District + Series + Number)

**"Vehicle number already registered"**
- Solution: Each vehicle can only be registered once. Contact support if this is your vehicle.

**"User with this phone number already exists"**
- Solution: Phone number is already registered. Try logging in instead.

**"Invalid phone number or password"**
- Solution: Check your credentials. Make sure you're using the correct phone number and password.

## Testing

### Test Registration

1. Navigate to `/driver/login`
2. Click "Sign Up"
3. Fill in:
   - Name: Test Driver
   - Phone: 9876543210
   - Vehicle Number: KA 01 AB 1234
   - License: DL1234567890123
   - Password: test123
4. Click "Register as Driver"
5. Should redirect to driver dashboard

### Test Login

1. Navigate to `/driver/login`
2. Enter registered phone and password
3. Click "Sign In"
4. Should redirect to driver dashboard

## Files Created/Modified

### Backend
- `backend/models/User.js` - Added gender and address fields
- `backend/routes/auth.js` - Added driver registration and login routes

### Frontend
- `src/pages/DriverLogin.tsx` - Driver login/registration page
- `src/App.tsx` - Updated routing
- `src/pages/Index.tsx` - Updated navigation

## Next Steps

1. **Add profile editing** - Let drivers update their information
2. **Add document upload** - License and vehicle documents
3. **Add verification** - Admin verification of driver documents
4. **Add password reset** - Email/SMS-based password recovery
5. **Add two-factor authentication** - For enhanced security

---

**Note:** Remember to keep your JWT_SECRET secure in production!





