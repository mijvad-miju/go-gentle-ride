import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PassengerLogin from "./pages/PassengerLogin";
import Booking from "./pages/Booking";
import PassengerHome from "./pages/PassengerHome";
import DriverLogin from "./pages/DriverLogin";
import TripTracking from "./pages/TripTracking";
import DriverDashboard from "./pages/DriverDashboard";
import DriverTrips from "./pages/DriverTrips";
import DriverProfile from "./pages/DriverProfile";
import DriverEarnings from "./pages/DriverEarnings";
import Emergency from "./pages/Emergency";
import TripHistory from "./pages/TripHistory";
import PassengerPrebooks from "./pages/PassengerPrebooks";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import DriverPrebooks from "./pages/DriverPrebooks";
import PassengerLayout from "./components/layout/PassengerLayout";
import DriverLayout from "./components/layout/DriverLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/passenger/login" element={<PassengerLogin />} />

          <Route
            path="/booking"
            element={
              <ProtectedRoute allowedRole="passenger">
                <Booking />
              </ProtectedRoute>
            }
          />

          {/* Passenger Routes */}
          <Route
            path="/passenger"
            element={
              <ProtectedRoute allowedRole="passenger">
                <PassengerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PassengerHome />} />
            <Route path="trips" element={<TripHistory />} />
            <Route path="prebookings" element={<PassengerPrebooks />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route
            path="/tracking/:rideId"
            element={
              <ProtectedRoute allowedRole="passenger">
                <TripTracking />
              </ProtectedRoute>
            }
          />

          <Route path="/driver/login" element={<DriverLogin />} />
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRole="driver">
                <DriverLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DriverDashboard />} />
            <Route path="trips" element={<DriverTrips />} />
            <Route path="prebookings" element={<DriverPrebooks />} />
            <Route path="profile" element={<DriverProfile />} />
            <Route path="earnings" element={<DriverEarnings />} />
          </Route>
          <Route
            path="/emergency"
            element={
              <ProtectedRoute>
                <Emergency />
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
