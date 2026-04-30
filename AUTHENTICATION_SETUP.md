# Authentication Setup Guide

This guide explains how the passenger authentication system works in the Auto Rickshaw Booking app.

## Overview

The app now includes a complete authentication system for passengers:
- **Registration**: New users can create an account
- **Login**: Existing users can sign in
- **Protected Routes**: Passenger pages require authentication
- **JWT Tokens**: Secure token-based authentication

## Backend Setup

### 1. Install Dependencies

Navigate to the backend directory and install the new dependencies:

```bash
cd backend
npm install
```

This will install:
- `bcryptjs` - For password hashing
- `jsonwebtoken` - For JWT token generation

### 2. Configure Environment Variables

Make sure your `.env` file includes the JWT secret:

```env
MONGODB_URI=your-mongodb-connection-string
PORT=5000
NODE_ENV=development
JWT_SECRET=your-secret-key-change-this-in-production
```

**Important:** Change `JWT_SECRET` to a random, secure string in production!

### 3. Start the Backend Server

```bash
npm run dev
```

## Frontend Setup

### 1. Configure API URL (Optional)

If your backend is running on a different URL, create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:5000
```

If not set, it defaults to `http://localhost:5000`.

### 2. Start the Frontend

```bash
npm run dev
```

## How It Works

### User Flow

1. **User clicks "Passenger"** on the home page
2. **Redirected to login page** (`/passenger/login`)
3. **User can:**
   - **Sign In** if they have an account
   - **Sign Up** to create a new account
4. **After successful login/registration:**
   - JWT token is stored in `localStorage`
   - User data is stored in `localStorage`
   - User is redirected to `/passenger` (booking page)

### Protected Routes

The `/passenger` route is protected. If a user tries to access it without being logged in, they'll be automatically redirected to the login page.

## API Usage Examples

### Register a New User

```javascript
const response = await fetch('http://localhost:5000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'John Doe',
    phone: '1234567890',
    email: 'john@example.com', // optional
    password: 'password123'
  })
});

const data = await response.json();
// data.token - JWT token
// data.user - User object (without password)
```

### Login

```javascript
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phone: '1234567890',
    password: 'password123'
  })
});

const data = await response.json();
// data.token - JWT token
// data.user - User object (without password)
```

### Using Authentication in Frontend

The app includes utility functions in `src/lib/auth.ts`:

```typescript
import { getAuthToken, getUser, isAuthenticated, getAuthHeaders } from '@/lib/auth';

// Check if user is authenticated
if (isAuthenticated()) {
  // User is logged in
}

// Get current user
const user = getUser();

// Get auth token
const token = getAuthToken();

// Get headers for API requests
const headers = getAuthHeaders();
```

### Making Authenticated API Requests

```typescript
import { getAuthHeaders } from '@/lib/auth';

const response = await fetch('http://localhost:5000/api/rides', {
  method: 'POST',
  headers: getAuthHeaders(),
  body: JSON.stringify({
    // ride data
  })
});
```

## Database Schema

The User model now includes a `password` field:

```javascript
{
  name: String,
  phone: String (unique),
  email: String (optional),
  password: String (hashed),
  role: 'passenger' | 'driver',
  // ... other fields
}
```

Passwords are automatically hashed using bcrypt before being stored in the database.

## Security Features

1. **Password Hashing**: All passwords are hashed using bcrypt before storage
2. **JWT Tokens**: Secure token-based authentication
3. **Token Expiration**: Tokens expire after 7 days
4. **Protected Routes**: Frontend routes are protected
5. **Password Validation**: Minimum 6 characters required

## Testing

### Test Registration

1. Go to the app homepage
2. Click "Passenger"
3. Click "Sign Up" (if not already on register mode)
4. Fill in:
   - Name: Test User
   - Phone: 1234567890
   - Password: test123
5. Click "Create Account"
6. You should be redirected to the booking page

### Test Login

1. Go to `/passenger/login`
2. Enter your phone and password
3. Click "Sign In"
4. You should be redirected to the booking page

### Test Protected Route

1. Clear your browser's localStorage
2. Try to navigate to `/passenger`
3. You should be automatically redirected to `/passenger/login`

## Troubleshooting

### "Invalid phone number or password"
- Check that the phone number matches exactly
- Ensure the password is correct
- Verify the user exists in the database

### "User with this phone number already exists"
- The phone number is already registered
- Try logging in instead of registering
- Or use a different phone number

### "Cannot read property 'token' of undefined"
- Check that the backend server is running
- Verify the API URL is correct
- Check browser console for network errors

### Token not persisting
- Check browser's localStorage settings
- Ensure cookies/localStorage are enabled
- Try clearing and logging in again

## Next Steps

1. **Add logout functionality** - Clear token and redirect to login
2. **Add password reset** - Email/SMS-based password recovery
3. **Add profile page** - Let users update their information
4. **Add driver authentication** - Similar system for drivers
5. **Add refresh tokens** - For better security

## Files Created/Modified

### Backend
- `backend/models/User.js` - Added password field
- `backend/routes/auth.js` - Authentication routes
- `backend/server.js` - Added auth routes
- `backend/package.json` - Added bcryptjs and jsonwebtoken

### Frontend
- `src/pages/PassengerLogin.tsx` - Login/Register page
- `src/components/auth/ProtectedRoute.tsx` - Route protection
- `src/lib/auth.ts` - Authentication utilities
- `src/App.tsx` - Updated routing
- `src/pages/Index.tsx` - Updated navigation

---

**Note:** Remember to change the JWT_SECRET in production to a secure random string!





