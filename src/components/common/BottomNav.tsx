import React from 'react';
import { Home, Clock, User, Wallet, Calendar } from 'lucide-react';

interface NavItem {
  icon: React.ReactNode;
  /** i18n key under `translation` */
  tKey: string;
  path?: string;
  isActive?: boolean;
  onClick?: () => void;
}

interface BottomNavProps {
  items: NavItem[];
}

import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const BottomNav: React.FC<BottomNavProps> = ({ items }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border pb-safe-bottom z-40">
      <div className="flex items-center justify-around h-16">
        {items.map((item, index) => {
          const isActive = item.isActive !== undefined
            ? item.isActive
            : (item.path ? location.pathname === item.path : false);

          const translatedLabel = t(item.tKey);

          return (
            <button
              key={index}
              onClick={() => {
                if (item.path) {
                  navigate(item.path);
                }
                if (item.onClick) {
                  item.onClick();
                }
              }}
              className={`
                flex flex-col items-center justify-center gap-1 px-4 py-2 min-w-[64px] transition-all duration-200
                ${isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <div className={`
                p-2 rounded-xl transition-all duration-200
                ${isActive ? 'bg-primary/10' : ''}
              `}>
                {isActive ? item.icon : item.icon}
              </div>
              <span className="text-xs font-medium">{translatedLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

// Pre-built nav configs
export const passengerNavItems: NavItem[] = [
  { icon: <Home className="w-5 h-5" />, tKey: 'home', path: '/passenger' },
  { icon: <Calendar className="w-5 h-5" />, tKey: 'prebookings', path: '/passenger/prebookings' },
  { icon: <Clock className="w-5 h-5" />, tKey: 'trips', path: '/passenger/trips' },
  { icon: <User className="w-5 h-5" />, tKey: 'profile', path: '/passenger/profile' },
];

export const driverNavItems: NavItem[] = [
  { icon: <Home className="w-5 h-5" />, tKey: 'home', path: '/driver' },
  { icon: <Wallet className="w-5 h-5" />, tKey: 'earnings', path: '/driver/earnings' },
  { icon: <Calendar className="w-5 h-5" />, tKey: 'prebookings', path: '/driver/prebookings' },
  { icon: <Clock className="w-5 h-5" />, tKey: 'trips', path: '/driver/trips' },
  { icon: <User className="w-5 h-5" />, tKey: 'profile', path: '/driver/profile' },
];

export default BottomNav;
