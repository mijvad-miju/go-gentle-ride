import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title?: string;
  showMenu?: boolean;
  showNotifications?: boolean;
  notificationCount?: number;
  onMenuClick?: () => void;
  onNotificationClick?: () => void;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({
  title,
  showMenu = true,
  showNotifications = true,
  notificationCount = 0,
  onMenuClick,
  onNotificationClick,
  rightContent,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50 pt-safe-top">
      <div className="flex items-center justify-between h-16 px-4">
        {showMenu ? (
          <Button variant="icon" size="icon" onClick={onMenuClick} aria-label="Menu">
            <Menu className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-12" />
        )}
        
        {title && (
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        )}
        
        <div className="flex items-center gap-2">
          {rightContent}
          
          {showNotifications && (
            <Button 
              variant="icon" 
              size="icon" 
              onClick={onNotificationClick}
              className="relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
