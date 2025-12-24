import React from 'react';
import { Home, Clock, User, Wallet } from 'lucide-react';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}

interface BottomNavProps {
  items: NavItem[];
}

const BottomNav: React.FC<BottomNavProps> = ({ items }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border pb-safe-bottom z-40">
      <div className="flex items-center justify-around h-16">
        {items.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={`
              flex flex-col items-center justify-center gap-1 px-4 py-2 min-w-[64px] transition-all duration-200
              ${item.isActive 
                ? 'text-primary' 
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            <div className={`
              p-2 rounded-xl transition-all duration-200
              ${item.isActive ? 'bg-primary/10' : ''}
            `}>
              {item.icon}
            </div>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

// Pre-built nav configs
export const passengerNavItems: NavItem[] = [
  { icon: <Home className="w-5 h-5" />, label: 'Home', isActive: true },
  { icon: <Clock className="w-5 h-5" />, label: 'Trips' },
  { icon: <User className="w-5 h-5" />, label: 'Profile' },
];

export const driverNavItems: NavItem[] = [
  { icon: <Home className="w-5 h-5" />, label: 'Home', isActive: true },
  { icon: <Wallet className="w-5 h-5" />, label: 'Earnings' },
  { icon: <Clock className="w-5 h-5" />, label: 'Trips' },
  { icon: <User className="w-5 h-5" />, label: 'Profile' },
];

export default BottomNav;
