# Database Schema Design

<br>

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| id | ObjectId | Unique identifier for each user |
| name | String | Full name of the user |
| phone | String | Phone number of the user (unique) |
| email | String | User email address |
| password | String | Encrypted password |
| gender | String | Gender (male / female / other) |
| address | Object | User's address details |
| role | String | Role (passenger / driver) |
| emergencyContacts | Array | List of emergency contacts |
| savedLocations | Array | User's saved locations |
| driverInfo | Object | Specific details and documents for driver |
| profilePhoto | String | URL of the user's profile photo |
| createdAt | Date | Account creation time |
| updatedAt | Date | Account last update time |

<div align="center">
  <caption>Table 6.1: User Table Schema</caption>
</div>

<br><br>

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| id | ObjectId | Unique identifier for each ride |
| passengerId | ObjectId | Reference to the passenger |
| driverId | ObjectId | Reference to the driver |
| status | String | Ride status (pending, accepted, completed, etc.) |
| pickupLocation | Object | Pickup coordinates and address |
| dropoffLocation | Object | Dropoff coordinates and address |
| fare | Object | Estimated and final fare |
| distance | Object | Distance value and text |
| duration | Object | Duration value and text |
| requestedAt | Date | Time when ride was requested |
| acceptedAt | Date | Time when driver accepted |
| startedAt | Date | Time when ride started |
| completedAt | Date | Time when ride completed |
| paymentMethod | String | Payment method (cash, upi, card, wallet) |
| paymentStatus | String | Status of the payment |
| rating | Object | Ratings and reviews by passenger/driver |
| isVoiceBooking| Boolean | Whether booking was done via voice |
| isScheduled | Boolean | Whether it is a scheduled ride |
| scheduledFor | Date | Time the ride is scheduled for |

<div align="center">
  <caption>Table 6.2: Ride Table Schema</caption>
</div>

<br><br>

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| id | ObjectId | Unique identifier for each earning record |
| driverId | ObjectId | Reference to the earning driver |
| rideId | ObjectId | Reference to the completed ride |
| amount | Number | Earning amount |
| date | Date | Date of the earning |
| breakdown | Object | Fare components (base, distance, time, etc.) |
| status | String | Status of earning (pending, completed, cancelled) |

<div align="center">
  <caption>Table 6.3: Earning Table Schema</caption>
</div>

<br>
