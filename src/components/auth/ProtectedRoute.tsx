import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAuthenticated, getUser, getAuthHeaders, clearAuth } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: 'passenger' | 'driver';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = isAuthenticated();
      const user = getUser();

      if (!authenticated || !user) {
        clearAuth(); // Safety clear
        if (location.pathname.startsWith('/driver')) {
          navigate('/driver/login', { replace: true });
        } else {
          navigate('/passenger/login', { replace: true });
        }
        return;
      }

      // Role-based protection
      if (allowedRole && user.role !== allowedRole) {
        if (user.role === 'driver') {
          navigate('/driver', { replace: true });
        } else {
          navigate('/passenger', { replace: true });
        }
        return;
      }

      // Verify token with backend
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${API_URL}/api/auth/verify`, {
          headers: getAuthHeaders()
        });

        if (!response.ok) {
          throw new Error('Token invalid or expired');
        }
        
        setIsValid(true);
      } catch (error) {
        console.error('Auth verification failed:', error);
        clearAuth();
        if (location.pathname.startsWith('/driver')) {
          navigate('/driver/login', { replace: true });
        } else {
          navigate('/passenger/login', { replace: true });
        }
      } finally {
        setIsVerifying(false);
      }
    };

    checkAuth();
  }, [allowedRole, navigate, location.pathname]);

  if (isVerifying || !isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;





