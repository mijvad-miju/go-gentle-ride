import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft, 
  Globe, 
  Moon, 
  Bell, 
  Shield, 
  HelpCircle, 
  Info, 
  ChevronRight,
  User,
  Smartphone,
  MessageSquare,
  Lock,
  Check,
  Palette,
  Sun
} from 'lucide-react';
import Header from '@/components/common/Header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

const languages = [
  { id: 'en', name: 'English (India)', native: 'English' },
  { id: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { id: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { id: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { id: 'te', name: 'Telugu', native: 'తెలుగు' },
  { id: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { id: 'mr', name: 'Marathi', native: 'मराठी' },
];

const themes = [
  { id: 'light', name: 'Light Mode', icon: Sun },
  { id: 'dark', name: 'Dark Mode', icon: Moon },
  { id: 'system', name: 'System Default', icon: Smartphone },
];

const colorThemes = [
  { id: 'yellow', name: 'Auto Yellow', color: '#FFD700' },
  { id: 'blue', name: 'Classic Blue', color: '#2563EB' },
  { id: 'green', name: 'Forest Green', color: '#16A34A' },
  { id: 'red', name: 'Crimson Red', color: '#DC2626' },
  { id: 'purple', name: 'Royal Purple', color: '#9333EA' },
];

const Settings = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Settings State
  const baseLang = (code: string) => (code || 'en').split('-')[0].toLowerCase();

  const [language, setLanguageState] = useState(() => baseLang(localStorage.getItem('appLanguage') || i18n.language || 'en'));
  const [theme, setTheme] = useState(localStorage.getItem('appTheme') || 'light');
  const [accentColor, setAccentColor] = useState(localStorage.getItem('appAccentColor') || 'yellow');

  // Handle language change
  const handleLanguageChange = (newLang: string) => {
    const code = baseLang(newLang);
    setLanguageState(code);
    void i18n.changeLanguage(code);
    localStorage.setItem('appLanguage', code);
  };

  useEffect(() => {
    const sync = () => setLanguageState(baseLang(i18n.language));
    i18n.on('languageChanged', sync);
    return () => {
      i18n.off('languageChanged', sync);
    };
  }, [i18n]);

  // Persist other changes
  useEffect(() => {
    localStorage.setItem('appTheme', theme);
    localStorage.setItem('appAccentColor', accentColor);

    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System default
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme, accentColor]);

  const currentLangName = languages.find((l) => l.id === language)?.name || 'English';
  const currentThemeName = t(theme === 'system' ? 'system_default' : `${theme}_mode`);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Custom Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50 pt-safe-top">
        <div className="flex items-center h-16 px-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="mr-2 rounded-full"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">{t('settings')}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div className="max-w-md mx-auto px-4 mt-6 space-y-8">
          
          {/* Appearance Section */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2">
              {t('appearance')}
            </h2>
            <div className="bg-muted/30 rounded-3xl border border-border/50 overflow-hidden shadow-sm">
              
              {/* Theme Selection */}
              <Sheet>
                <SheetTrigger asChild>
                  <button className="w-full flex items-center justify-between p-4 border-b border-border/50 hover:bg-muted/50 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-background rounded-2xl flex items-center justify-center border border-border/50 shadow-sm group-hover:scale-105 transition-transform">
                        {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold">{t('display_theme')}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          {t(theme === 'system' ? 'system_default' : `${theme}_mode`)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-12 border-t-primary/20">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="text-center font-bold text-xl uppercase tracking-tighter">{t('select_theme')}</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-1 gap-3">
                    {themes.map((t_item) => (
                      <SheetClose asChild key={t_item.id}>
                        <Button
                          variant={theme === t_item.id ? "default" : "outline"}
                          className={`justify-between h-14 rounded-2xl px-4 ${theme === t_item.id ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'border-border/50 hover:bg-muted/50'}`}
                          onClick={() => setTheme(t_item.id)}
                        >
                          <div className="flex items-center gap-3">
                            <t_item.icon className="w-5 h-5" />
                            <span className="font-bold">
                              {t(t_item.id === 'system' ? 'system_default' : `${t_item.id}_mode`)}
                            </span>
                          </div>
                          {theme === t_item.id && <Check className="w-5 h-5" />}
                        </Button>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>

              {/* Language Selection */}
              <Sheet>
                <SheetTrigger asChild>
                  <button className="w-full flex items-center justify-between p-4 border-b border-border/50 hover:bg-muted/50 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-background rounded-2xl flex items-center justify-center border border-border/50 shadow-sm group-hover:scale-105 transition-transform">
                        <Globe className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-semibold">{t('language')}</span>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{currentLangName}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-[2.5rem] p-6 pb-12 h-[60vh] overflow-y-auto border-t-primary/20">
                  <SheetHeader className="mb-6">
                    <SheetTitle className="text-center font-bold text-xl uppercase tracking-tighter">{t('choose_language')}</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-1 gap-2">
                    {languages.map((l) => (
                      <SheetClose asChild key={l.id}>
                        <Button
                          variant={language === l.id ? "default" : "ghost"}
                          className={`justify-between h-14 rounded-2xl px-6 ${language === l.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
                          onClick={() => handleLanguageChange(l.id)}
                        >
                          <div className="flex flex-col items-start translate-y-[-2px]">
                            <span className="font-bold">{l.name}</span>
                            <span className="text-[10px] font-medium opacity-70 uppercase tracking-widest">{l.native}</span>
                          </div>
                          {language === l.id && <Check className="w-5 h-5 animate-in zoom-in" />}
                        </Button>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>

            </div>
          </div>



          {/* Logout/Danger Area */}
          <div className="pt-8 space-y-4 text-center">
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-3xl border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold transition-all"
            >
              {t('sign_out')}
            </Button>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
              {t('handcrafted_india')} 🇮🇳
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;
