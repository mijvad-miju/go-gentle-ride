import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Lock,
  Mail,
  ArrowLeft,
  Eye,
  EyeOff,
  Car,
  MapPin,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import GenderCardGroup, { GenderValue } from '@/components/common/GenderCardGroup';

type AuthMode = 'login' | 'register';

import { getUser, isAuthenticated, setAuth } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

// Indian vehicle number plate validation
const validateVehicleNumber = (vehicleNumber: string): boolean => {
  // Format: XX XX XX XXXX (e.g., KA 01 AB 1234)
  // State code (2 letters) + space + District (1-2 digits) + space + Series (1-2 letters) + space + Number (4 digits)
  const vehicleNumberRegex = /^[A-Z]{2}\s[0-9]{1,2}\s[A-Z]{1,2}\s[0-9]{4}$/;
  return vehicleNumberRegex.test(vehicleNumber.toUpperCase());
};

const DriverLogin: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated('driver')) {
      const user = getUser('driver');
      if (user?.role === 'driver') {
        navigate('/driver', { replace: true });
      }
    }
  }, [navigate]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    gender: '',
    address: {
      street: '',
      city: '',
      state: '',
      pincode: '',
      fullAddress: ''
    },
    vehicleNumber: '',
    licenseNumber: '',
    aadharNumber: '',
    panNumber: '',
    bankDetails: {
      accountNumber: '',
      ifscCode: '',
      bankName: ''
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      setFormData({
        ...formData,
        address: {
          ...formData.address,
          [addressField]: value
        }
      });
    } else if (name.startsWith('bank.')) {
      const bankField = name.split('.')[1];
      setFormData({
        ...formData,
        bankDetails: {
          ...formData.bankDetails,
          [bankField]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleGenderChange = (value: GenderValue) => {
    setFormData({
      ...formData,
      gender: value
    });
  };

  const formatVehicleNumber = (value: string) => {
    // Remove all spaces and convert to uppercase
    let formatted = value.replace(/\s/g, '').toUpperCase();

    // Add spaces in the correct positions: XX XX XX XXXX
    if (formatted.length > 2) {
      formatted = formatted.slice(0, 2) + ' ' + formatted.slice(2);
    }
    if (formatted.length > 5) {
      formatted = formatted.slice(0, 5) + ' ' + formatted.slice(5);
    }
    if (formatted.length > 8) {
      formatted = formatted.slice(0, 8) + ' ' + formatted.slice(8);
    }

    return formatted;
  };

  const handleVehicleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatVehicleNumber(e.target.value);
    setFormData({
      ...formData,
      vehicleNumber: formatted
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const API_URL = getApiOrigin();

      if (mode === 'register') {
        // Validate required fields
        if (!formData.name || !formData.phone || !formData.password ||
          !formData.vehicleNumber || !formData.licenseNumber ||
          !formData.aadharNumber || !formData.panNumber) {
          toast({
            title: 'Validation Error',
            description: 'Please fill in all required fields',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }
        if (!formData.gender) {
          toast({
            title: 'Please select your gender',
            description: 'We use this to enforce safety preferences between drivers and passengers.',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Validate Aadhar (12 digits)
        if (!/^\d{12}$/.test(formData.aadharNumber)) {
          toast({
            title: 'Invalid Aadhar Number',
            description: 'Aadhar must be 12 digits',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Validate PAN
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.toUpperCase())) {
          toast({
            title: 'Invalid PAN Number',
            description: 'Please enter a valid PAN number',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Validate vehicle number format
        if (!validateVehicleNumber(formData.vehicleNumber)) {
          toast({
            title: 'Invalid Vehicle Number',
            description: 'Please use format: KA 01 AB 1234',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        // Build address string
        const addressParts = [
          formData.address.street,
          formData.address.city,
          formData.address.state,
          formData.address.pincode
        ].filter(Boolean);
        const fullAddress = addressParts.join(', ');

        const response = await fetch(`${API_URL}/api/auth/driver/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            password: formData.password,
            gender: formData.gender,
            address: {
              ...formData.address,
              fullAddress: fullAddress || formData.address.fullAddress
            },
            vehicleNumber: formData.vehicleNumber.toUpperCase(),
            licenseNumber: formData.licenseNumber.toUpperCase(),
            aadharNumber: formData.aadharNumber,
            panNumber: formData.panNumber.toUpperCase(),
            bankDetails: formData.bankDetails
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Registration failed');
        }

        setAuth(data.token, data.user);

        toast({
          title: 'Success!',
          description: 'Driver account created successfully',
        });

        // Navigate to driver dashboard
        navigate('/driver');
      } else {
        // Login
        if (!formData.phone || !formData.password) {
          toast({
            title: 'Validation Error',
            description: 'Please enter phone and password',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }


        const response = await fetch(`${API_URL}/api/auth/driver/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: formData.phone,
            password: formData.password
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Login failed');
        }

        setAuth(data.token, data.user);

        toast({
          title: 'Welcome back!',
          description: 'Login successful',
        });

        // Navigate to driver dashboard
        navigate('/driver');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="pt-safe-top px-4 py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="mb-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 overflow-hidden">
            <img
              src="/auto.png"

              alt="Auto Rickshaw Logo"
              className="w-full h-full object-cover rounded-2xl"
            />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {mode === 'login' ? 'Driver Login' : 'Driver Registration'}
          </h1>
          <p className="text-muted-foreground text-center text-sm">
            {mode === 'login'
              ? 'Sign in to your driver account'
              : 'Register to start driving'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto pb-8">
          {mode === 'register' && (
            <>
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Gender — required for lady-safety matching */}
              <div className="space-y-2">
                <Label>Gender *</Label>
                <GenderCardGroup
                  value={(formData.gender || null) as GenderValue | null}
                  onChange={handleGenderChange}
                  options={['female', 'male', 'other']}
                />
              </div>

              {/* Vehicle Number */}
              <div className="space-y-2">
                <Label htmlFor="vehicleNumber">Vehicle Number Plate *</Label>
                <div className="relative">
                  <Car className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="vehicleNumber"
                    name="vehicleNumber"
                    type="text"
                    placeholder="KA 01 AB 1234"
                    value={formData.vehicleNumber}
                    onChange={handleVehicleNumberChange}
                    className="pl-10 uppercase"
                    maxLength={13}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: State Code + District + Series + Number (e.g., KA 01 AB 1234)
                </p>
              </div>

              {/* License Number */}
              <div className="space-y-2">
                <Label htmlFor="licenseNumber">Driving License Number *</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="licenseNumber"
                    name="licenseNumber"
                    type="text"
                    placeholder="Enter license number"
                    value={formData.licenseNumber}
                    onChange={handleInputChange}
                    className="pl-10 uppercase"
                    required
                  />
                </div>
              </div>

              {/* Aadhar Number */}
              <div className="space-y-2">
                <Label htmlFor="aadharNumber">Aadhar Number (12 digits) *</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="aadharNumber"
                    name="aadharNumber"
                    type="text"
                    placeholder="1234 5678 9012"
                    value={formData.aadharNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setFormData({ ...formData, aadharNumber: val });
                    }}
                    className="pl-10"
                    maxLength={12}
                    required
                  />
                </div>
              </div>

              {/* PAN Number */}
              <div className="space-y-2">
                <Label htmlFor="panNumber">PAN Number *</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="panNumber"
                    name="panNumber"
                    type="text"
                    placeholder="ABCDE1234F"
                    value={formData.panNumber}
                    onChange={handleInputChange}
                    className="pl-10 uppercase"
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              {/* Address Fields */}
              <div className="space-y-4 pt-2">
                <Label className="text-base">Address</Label>

                <div className="space-y-2">
                  <Label htmlFor="address.street" className="text-sm">Street</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="address.street"
                      name="address.street"
                      type="text"
                      placeholder="Street address"
                      value={formData.address.street}
                      onChange={handleInputChange}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="address.city" className="text-sm">City</Label>
                    <Input
                      id="address.city"
                      name="address.city"
                      type="text"
                      placeholder="City"
                      value={formData.address.city}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address.state" className="text-sm">State</Label>
                    <Input
                      id="address.state"
                      name="address.state"
                      type="text"
                      placeholder="State"
                      value={formData.address.state}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address.pincode" className="text-sm">Pincode</Label>
                  <Input
                    id="address.pincode"
                    name="address.pincode"
                    type="text"
                    placeholder="Pincode"
                    value={formData.address.pincode}
                    onChange={handleInputChange}
                    maxLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address.fullAddress" className="text-sm">Full Address (Optional)</Label>
                  <Textarea
                    id="address.fullAddress"
                    name="address.fullAddress"
                    placeholder="Complete address (optional)"
                    value={formData.address.fullAddress}
                    onChange={handleInputChange}
                    rows={3}
                  />
                </div>
              </div>
            </>
          )}

          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={handleInputChange}
                className="pl-10"
                required
              />
            </div>
          </div>

          {/* Email */}
          {mode === 'register' && (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter email (optional)"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10"
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={formData.password}
                onChange={handleInputChange}
                className="pl-10 pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-xs text-muted-foreground">
                Password must be at least 6 characters
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="touch"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Register as Driver'}
          </Button>
        </form>

        {/* Toggle mode */}
        <div className="text-center pb-8">
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setFormData({
                  name: '',
                  phone: '',
                  email: '',
                  password: '',
                  gender: '',
                  address: {
                    street: '',
                    city: '',
                    state: '',
                    pincode: '',
                    fullAddress: ''
                  },
                  vehicleNumber: '',
                  licenseNumber: '',
                  aadharNumber: '',
                  panNumber: '',
                  bankDetails: {
                    accountNumber: '',
                    ifscCode: '',
                    bankName: ''
                  }
                });
              }}
              className="text-primary font-semibold hover:underline"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default DriverLogin;

