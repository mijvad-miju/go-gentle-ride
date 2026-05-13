import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Phone, Lock, Mail, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

import { getUser, isAuthenticated, setAuth } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

type AuthMode = 'login' | 'register';

const PassengerLogin: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated('passenger')) {
      const user = getUser('passenger');
      if (user?.role === 'passenger') {
        navigate('/passenger', { replace: true });
      }
    }
  }, [navigate]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const API_URL = getApiOrigin();

      if (mode === 'register') {
        // Register
        if (!formData.name || !formData.phone || !formData.password) {
          toast({
            title: 'Validation Error',
            description: 'Please fill in all required fields',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_URL}/api/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            password: formData.password
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Registration failed');
        }

        setAuth(data.token, data.user);

        toast({
          title: 'Success!',
          description: 'Account created successfully',
        });

        // Navigate to passenger home
        navigate('/passenger');
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


        const response = await fetch(`${API_URL}/api/auth/login`, {
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

        // Navigate to passenger home
        navigate('/passenger');
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Logo */}
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 overflow-hidden">
          <img
            src="/auto.png"

            alt="Auto Rickshaw Logo"
            className="w-full h-full object-cover rounded-2xl"
          />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {mode === 'login' ? t('auth_welcome_back') : t('auth_create_account')}
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          {mode === 'login' ? t('auth_signin_passenger') : t('auth_register_passenger')}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          {mode === 'register' && (
            <div className="space-y-2">
              <Label htmlFor="name">{t('full_name')}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder={t('placeholder_name')}
                  value={formData.name}
                  onChange={handleInputChange}
                  className="pl-10"
                  required={mode === 'register'}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone_number')}</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder={t('placeholder_phone')}
                value={formData.phone}
                onChange={handleInputChange}
                className="pl-10"
                required
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-2">
              <Label htmlFor="email">{t('email_optional')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t('placeholder_email_optional')}
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-10"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('placeholder_password')}
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
              <p className="text-xs text-muted-foreground">{t('password_rule_min6')}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="touch"
            className="w-full"
            disabled={loading}
          >
            {loading ? t('please_wait') : mode === 'login' ? t('sign_in') : t('sign_up')}
          </Button>
        </form>

        {/* Toggle mode */}
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? t('toggle_signup_prompt') : t('toggle_login_prompt')}{' '}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setFormData({ name: '', phone: '', email: '', password: '' });
              }}
              className="text-primary font-semibold hover:underline"
            >
              {mode === 'login' ? t('sign_up') : t('sign_in')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PassengerLogin;

