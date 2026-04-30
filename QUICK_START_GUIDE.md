# Quick Start Guide - Step by Step

Follow these simple steps to get your app running with MongoDB.

## ✅ Step 1: Make Sure MongoDB is Running

### If you installed MongoDB locally:
- **Windows**: MongoDB should start automatically as a service. If not, open Services (Win + R, type `services.msc`) and start "MongoDB" service.
- **macOS/Linux**: Run `brew services start mongodb-community` (macOS) or `sudo systemctl start mongod` (Linux)

### If you're using MongoDB Atlas (Cloud):
- No need to install anything! Just make sure you have your connection string.

**You don't need to open MongoDB shell for this step!**

---

## ✅ Step 2: Clear Dummy Data (Optional)

If you want to start with a clean database, run this command:

```bash
cd backend
npm run clear-data
```

This will automatically:
- Connect to MongoDB
- Delete all existing data
- Show you what was deleted

**You don't need to type anything in MongoDB shell!**

---

## ✅ Step 3: Start the Backend Server

Open a terminal/command prompt and run:

```bash
cd backend
npm install
npm run dev
```

You should see:
```
✅ MongoDB Connected: 127.0.0.1
🚀 Server running on port 5000
📍 Environment: development
```

**If you see "MongoDB Connected", you're all set! No MongoDB shell needed.**

---

## ✅ Step 4: Start the Frontend

Open a **NEW** terminal/command prompt (keep the backend running) and run:

```bash
npm run dev
```

The app should open in your browser.

---

## ✅ Step 5: Test Registration

1. Click **"Passenger"** button
2. Click **"Sign Up"**
3. Fill in:
   - Name: Test User
   - Phone: 1234567890
   - Password: test123
4. Click **"Create Account"**

**Check the backend terminal** - you should see:
```
✅ New passenger registered: Test User (1234567890) - Saved to MongoDB
```

**That's it! Your data is saved to MongoDB automatically!**

---

## ✅ Step 6: Test Login

1. On the login page, enter:
   - Phone: 1234567890
   - Password: test123
2. Click **"Sign In"**

**Check the backend terminal** - you should see:
```
✅ Passenger logged in: Test User (1234567890) - From MongoDB
```

**Perfect! Login is working with MongoDB!**

---

## 🎉 That's All!

**You DON'T need to:**
- ❌ Open MongoDB shell
- ❌ Type any MongoDB commands
- ❌ Manually create databases
- ❌ Manually create collections

**Everything happens automatically!**

---

## 🔍 Optional: Verify Data in MongoDB (Only if you want to check)

If you want to see the data in MongoDB shell (optional):

1. Open a new terminal
2. Type: `mongosh`
3. Type: `use auto-taxi-booking-app`
4. Type: `db.users.find().pretty()`

You'll see all registered users. But this is **optional** - you don't need to do this!

---

## 🐛 Troubleshooting

### "MongoDB connection error"

**Solution:**
1. Make sure MongoDB is running (Step 1)
2. Check that your `.env` file exists in the `backend` folder
3. The `.env` file should have: `MONGODB_URI=mongodb://127.0.0.1:27017/auto-taxi-booking-app`

### "Cannot find module"

**Solution:**
```bash
cd backend
npm install
```

### Backend won't start

**Solution:**
1. Make sure MongoDB is running
2. Check that port 5000 is not already in use
3. Make sure you're in the `backend` folder when running `npm run dev`

---

## 📋 Summary Checklist

- [ ] MongoDB is running
- [ ] Backend server is running (shows "MongoDB Connected")
- [ ] Frontend is running
- [ ] Can register a new user
- [ ] Backend shows "Saved to MongoDB" message
- [ ] Can login with registered user
- [ ] Backend shows "From MongoDB" message

**If all checkboxes are done, you're all set! 🎉**

---

## 💡 What Happens Automatically

When you register or login:
1. Frontend sends data to backend API
2. Backend connects to MongoDB
3. Data is saved/validated in MongoDB
4. Response is sent back to frontend
5. You see success message

**All of this happens automatically - no manual steps needed!**





