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

type Role = User['role'];

const AUTH_TOKEN_KEY = 'authToken';
const USER_KEY = 'user';

const getRoleFromPath = (): Role | undefined => {
  const pathname = window.location.pathname;
  if (pathname.startsWith('/driver')) return 'driver';
  if (pathname.startsWith('/passenger') || pathname.startsWith('/booking') || pathname.startsWith('/tracking')) {
    return 'passenger';
  }
  return undefined;
};

const parseUser = (value: string | null): User | null => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getScopedKey = (base: string, role: Role) => `${base}:${role}`;

export const getAuthToken = (role?: Role): string | null => {
  const resolvedRole = role ?? getRoleFromPath();
  if (resolvedRole) {
    const scopedToken = localStorage.getItem(getScopedKey(AUTH_TOKEN_KEY, resolvedRole));
    if (scopedToken) return scopedToken;

    // Legacy migration fallback: only accept legacy token if legacy user matches the role.
    const legacyUser = parseUser(localStorage.getItem(USER_KEY));
    if (legacyUser?.role === resolvedRole) {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    }
    return null;
  }
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const getUser = (role?: Role): User | null => {
  const resolvedRole = role ?? getRoleFromPath();
  if (resolvedRole) {
    const scopedUser = parseUser(localStorage.getItem(getScopedKey(USER_KEY, resolvedRole)));
    if (scopedUser) return scopedUser;
  }

  const fallbackUser = parseUser(localStorage.getItem(USER_KEY));
  if (role && fallbackUser?.role !== role) {
    return null;
  }
  return fallbackUser;
};

export const setAuth = (token: string, user: User): void => {
  localStorage.setItem(getScopedKey(AUTH_TOKEN_KEY, user.role), token);
  localStorage.setItem(getScopedKey(USER_KEY, user.role), JSON.stringify(user));
  // Keep legacy keys populated for routes that don't enforce role.
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuth = (role?: Role): void => {
  if (role) {
    localStorage.removeItem(getScopedKey(AUTH_TOKEN_KEY, role));
    localStorage.removeItem(getScopedKey(USER_KEY, role));

    const fallbackUser = parseUser(localStorage.getItem(USER_KEY));
    if (fallbackUser?.role === role) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return;
  }

  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(getScopedKey(AUTH_TOKEN_KEY, 'driver'));
  localStorage.removeItem(getScopedKey(USER_KEY, 'driver'));
  localStorage.removeItem(getScopedKey(AUTH_TOKEN_KEY, 'passenger'));
  localStorage.removeItem(getScopedKey(USER_KEY, 'passenger'));
};

export const isAuthenticated = (role?: Role): boolean => {
  const token = getAuthToken(role);
  return !!token && token !== 'undefined' && token !== 'null' && token.length > 10;
};

export const getAuthHeaders = (role?: Role): HeadersInit => {
  const token = getAuthToken(role);
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
};





