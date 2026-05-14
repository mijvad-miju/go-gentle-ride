import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleUser, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GenderValue = 'male' | 'female' | 'other' | 'any';

interface GenderCardGroupProps {
    value?: GenderValue | null;
    onChange: (next: GenderValue) => void;
    /** Subset of options to render, in the order they should appear. */
    options: GenderValue[];
    /** 'sm' for tight settings rows; 'md' (default) for signup forms. */
    size?: 'sm' | 'md';
    /** Forwarded to the buttons. */
    disabled?: boolean;
    /** Optional className for the wrapping row. */
    className?: string;
}

// Lucide 0.462 doesn't ship Venus/Mars — inline the standard astrological symbols
// using the same stroke-based style as the rest of the lucide icon set.
const VenusIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="9" r="5" />
        <line x1="12" y1="14" x2="12" y2="22" />
        <line x1="9" y1="19" x2="15" y2="19" />
    </svg>
);

const MarsIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="10" cy="14" r="5" />
        <line x1="14" y1="10" x2="20" y2="4" />
        <polyline points="15 4 20 4 20 9" />
    </svg>
);

const ICONS: Record<GenderValue, React.ComponentType<{ className?: string }>> = {
    female: VenusIcon,
    male: MarsIcon,
    other: CircleUser,
    any: Users
};

const LABEL_KEYS: Record<GenderValue, string> = {
    female: 'gender_female',
    male: 'gender_male',
    other: 'gender_other',
    any: 'gender_any'
};

const FALLBACK_LABELS: Record<GenderValue, string> = {
    female: 'Female',
    male: 'Male',
    other: 'Other',
    any: 'No preference'
};

/**
 * Reusable gender card row used for:
 *  - Capturing a user's own gender at signup (options: male/female/other)
 *  - Capturing a user's preference for the other role (options: female/male/any)
 *
 * Pure brand-primary tints, glassmorphism, no bespoke colors.
 */
const GenderCardGroup: React.FC<GenderCardGroupProps> = ({
    value,
    onChange,
    options,
    size = 'md',
    disabled = false,
    className
}) => {
    const { t } = useTranslation();
    const isSm = size === 'sm';

    return (
        <div
            className={cn(
                'grid gap-2',
                options.length === 2
                    ? 'grid-cols-2'
                    : options.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-4',
                className
            )}
            role="radiogroup"
        >
            {options.map((opt) => {
                const Icon = ICONS[opt];
                const selected = value === opt;
                return (
                    <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => onChange(opt)}
                        className={cn(
                            'flex flex-col items-center justify-center gap-1.5 rounded-2xl border transition-all duration-200',
                            'backdrop-blur-xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            isSm ? 'px-2 py-2.5' : 'px-3 py-4',
                            selected
                                ? 'border-primary/50 bg-primary/15 shadow-[0_4px_18px_-8px_hsl(45_93%_47%/0.45)]'
                                : 'border-border/60 bg-background/30 hover:bg-primary/5',
                            disabled && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        <span
                            className={cn(
                                'flex items-center justify-center rounded-xl border',
                                isSm ? 'w-8 h-8' : 'w-10 h-10',
                                selected
                                    ? 'border-primary/30 bg-primary/15'
                                    : 'border-border/60 bg-background/40'
                            )}
                        >
                            <Icon
                                className={cn(
                                    isSm ? 'w-4 h-4' : 'w-5 h-5',
                                    selected ? 'text-primary' : 'text-muted-foreground'
                                )}
                            />
                        </span>
                        <span
                            className={cn(
                                'font-semibold leading-tight text-center',
                                isSm ? 'text-xs' : 'text-sm',
                                selected ? 'text-foreground' : 'text-muted-foreground'
                            )}
                        >
                            {t(LABEL_KEYS[opt], FALLBACK_LABELS[opt])}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default GenderCardGroup;
