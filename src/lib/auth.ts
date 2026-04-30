// Authentication utility functions

export interface User {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  role: 'passenger' | 'driver';
  profilePhoto?: string;
  driverInfo?: {
    licenseNumber?: string;
    vehicleNumber?: string;
    vehicleType?: string;
    rating?: number;
    totalRides?: number;
    isTrusted?: boolean;
    isOnline?: boolean;
  };
}

export const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

export const getUser = (): User | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

export const setAuth = (token: string, user: User): void => {
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const clearAuth = (): void => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
};

export const isAuthenticated = (): boolean => {
  const token = getAuthToken();
  return !!token && token !== 'undefined' && token !== 'null' && token.length > 10;
};

export const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
};





