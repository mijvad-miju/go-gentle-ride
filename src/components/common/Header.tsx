import React from 'react';
import { Menu, Bell, User, Settings, Clock, CreditCard, LogOut, ChevronRight, Shield, HelpCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { getUser, clearAuth } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';

interface HeaderProps {
  title?: string;
  showMenu?: boolean;
  onMenuClick?: () => void;
  rightContent?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({
  title,
  showMenu = true,
  onMenuClick,
  rightContent,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const inferredRole = location.pathname.startsWith('/driver') ? 'driver' : 'passenger';
  const user = getUser(inferredRole);

  const handleLogout = () => {
    clearAuth(inferredRole);
    toast({
      title: t('sign_out'),
      description: t('sign_out')
    });
    navigate(inferredRole === 'driver' ? '/driver/login' : '/passenger/login');
  };

  const menuItems = inferredRole === 'driver'
    ? [
      { icon: User, label: t('profile'), path: '/driver/profile' },
      { icon: Clock, label: t('my_rides'), path: '/driver/trips' },
      { icon: CreditCard, label: t('earnings'), path: '/driver/earnings' },
    ]
    : [
      { icon: User, label: t('profile'), path: '/passenger/profile' },
      { icon: Clock, label: t('my_rides'), path: '/passenger/trips' },
      { icon: Settings, label: t('settings'), path: '/passenger/settings' },
    ];

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50 pt-safe-top">
      <div className="flex items-center justify-between h-16 px-4">
        {showMenu ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0 flex flex-col border-r-border/50">
              <SheetHeader className="p-6 text-left border-b border-border/50 bg-muted/30">
                <SheetTitle className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-foreground">{user?.name || 'User'}</span>
                    <span className="text-xs text-muted-foreground font-medium">{user?.phone || 'Connected'}</span>
                  </div>
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto py-2">
                <nav className="flex flex-col px-2 gap-1">
                  {menuItems.map((item, idx) => (
                    <SheetClose asChild key={idx}>
                      <button
                        onClick={() => item.path !== '#' && navigate(item.path)}
                        className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-2xl transition-all group active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <item.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-foreground text-left">{item.label}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </button>
                    </SheetClose>
                  ))}
                </nav>
              </div>

              <div className="p-4 border-t border-border/50">
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-4 h-14 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold group"
                    onClick={handleLogout}
                  >
                    <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
                      <LogOut className="w-5 h-5 text-destructive" />
                    </div>
                    {t('sign_out')}
                  </Button>
                </SheetClose>
                <p className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] mt-6">
                  AutoRide v1.0.0
                </p>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="w-12" />
        )}

        {title && (
          <h1 className="text-lg font-bold text-foreground">{title}</h1>
        )}

        <div className="flex items-center gap-2">
          {rightContent}
        </div>
      </div>
    </header>
  );
};

export default Header;
