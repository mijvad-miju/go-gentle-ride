import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    ShieldCheck,
    Construction,
    MoonStar,
    AlertTriangle,
    ArrowRight,
    Sparkles,
    Loader2,
    Info,
    Gauge
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SafetyDimension {
    score: number;
    note: string;
}

export interface SafetyAnalysis {
    safetyScore: number;
    risk: 'low' | 'medium' | 'high';
    dimensions: {
        accidentHistory: SafetyDimension;
        roadCondition: SafetyDimension;
        lightingAndTime: SafetyDimension;
        crime: SafetyDimension;
        traffic: SafetyDimension;
    };
    summary: string;
    warnings: string[];
}

export interface AnalyzedRoute {
    id: string;
    distanceKm: number;
    durationMin: number;
    geometry: [number, number][];
    streetNames: string[];
    middleLocality?: string | null;
    analysis: SafetyAnalysis | null;
    analysisError?: string | null;
}

interface SafetyCardProps {
    loading: boolean;
    error?: string | null;
    routes: AnalyzedRoute[];
    selectedRouteId: string | null;
    recommendedId: string | null;
    onSwitchRoute: (routeId: string) => void;
}

function riskTextClass(risk: 'low' | 'medium' | 'high' | undefined) {
    if (risk === 'low') return 'text-success';
    if (risk === 'medium') return 'text-warning';
    if (risk === 'high') return 'text-destructive';
    return 'text-muted-foreground';
}

function riskRingClass(risk: 'low' | 'medium' | 'high' | undefined) {
    if (risk === 'low') return 'ring-success/40';
    if (risk === 'medium') return 'ring-warning/40';
    if (risk === 'high') return 'ring-destructive/40';
    return 'ring-border';
}

function trafficDotClass(score: number | null | undefined) {
    if (typeof score !== 'number') return 'bg-muted-foreground/50';
    if (score >= 7.5) return 'bg-success';
    if (score >= 5) return 'bg-warning';
    return 'bg-destructive';
}

function viaLabel(route: AnalyzedRoute, fallback: string) {
    const street = (route.streetNames || []).find((s) => s && s.length > 1);
    if (street) return street;
    if (route.middleLocality) return route.middleLocality;
    return fallback;
}

function DimensionRow({
    icon: Icon,
    label,
    dimension
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    dimension: SafetyDimension | undefined;
}) {
    const score = dimension?.score;
    const note = dimension?.note;
    const tone =
        typeof score === 'number'
            ? score >= 7.5
                ? 'text-success'
                : score >= 5
                ? 'text-warning'
                : 'text-destructive'
            : 'text-muted-foreground';
    return (
        <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span className={cn('text-sm font-bold tabular-nums', tone)}>
                        {typeof score === 'number' ? `${score.toFixed(1)}/10` : '—'}
                    </span>
                </div>
                {note && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">
                        {note}
                    </p>
                )}
            </div>
        </div>
    );
}

const SafetyCard: React.FC<SafetyCardProps> = ({
    loading,
    error,
    routes,
    selectedRouteId,
    recommendedId,
    onSwitchRoute
}) => {
    const { t } = useTranslation();

    const selected =
        routes.find((r) => r.id === selectedRouteId) ||
        routes.find((r) => r.id === recommendedId) ||
        routes[0];
    const recommended = routes.find((r) => r.id === recommendedId);
    const analysis = selected?.analysis ?? null;
    const isRecommended = selected?.id === recommendedId;

    const baseShell =
        'rounded-2xl border border-border/60 bg-background/40 backdrop-blur-xl shadow-[0_4px_24px_-12px_rgba(0,0,0,0.25)] p-5 space-y-4';

    if (loading) {
        return (
            <div className={baseShell} role="status" aria-live="polite">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">
                            {t('safety_card_title', 'Route safety')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t('safety_loading', 'Analyzing the safest route…')}
                        </p>
                    </div>
                </div>
                <div className="space-y-2 pt-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-9 rounded-xl bg-foreground/5 animate-pulse"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !analysis) {
        // Degraded mode: Gemini analysis failed or isn't ready, but OSRM routes might still
        // exist. Show the route chip strip so the passenger can still pick / preview routes
        // (Google-Maps-style), plus a small explanation that the safety analysis is missing.
        return (
            <div className={baseShell}>
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Info className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">
                            {t('safety_card_title', 'Route safety')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {error || t('safety_failed_fallback', 'Safety check unavailable right now. Your ride is still safe to book.')}
                        </p>
                    </div>
                </div>

                {routes.length > 1 && (
                    <div className="-mx-1 overflow-x-auto pt-1">
                        <div className="flex gap-2 px-1 pb-1">
                            {routes.map((r) => {
                                const isSel = r.id === selected?.id;
                                const isRec = r.id === recommendedId;
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => onSwitchRoute(r.id)}
                                        className={cn(
                                            'min-w-[150px] shrink-0 text-left rounded-xl border px-3 py-2 transition-colors',
                                            isSel
                                                ? 'border-primary/40 bg-primary/15'
                                                : 'border-border/60 bg-background/30 hover:bg-primary/5'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold text-foreground tabular-nums">
                                                {r.durationMin} min
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate">
                                            {r.distanceKm.toFixed(1)} km
                                            {' · '}
                                            {t('route_via', 'via {{place}}', {
                                                place: viaLabel(r, '—')
                                            })}
                                        </p>
                                        {isRec && (
                                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                                                <Sparkles className="w-3 h-3" />
                                                {t('safer_recommended_pill', 'Recommended')}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const riskKey =
        analysis.risk === 'low'
            ? 'risk_low'
            : analysis.risk === 'medium'
            ? 'risk_medium'
            : 'risk_high';

    const showSwitch =
        recommended &&
        recommended.id !== selected?.id &&
        recommended.analysis &&
        recommended.analysis.safetyScore - analysis.safetyScore >= 0.5;

    const deltaMin = recommended ? recommended.durationMin - (selected?.durationMin || 0) : 0;
    const deltaKm = recommended
        ? Math.round((recommended.distanceKm - (selected?.distanceKm || 0)) * 10) / 10
        : 0;

    return (
        <div className={baseShell}>
            {/* Header: score + risk badge */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={cn(
                            'w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center ring-4',
                            riskRingClass(analysis.risk)
                        )}
                    >
                        <ShieldCheck className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-foreground">
                                {t('safety_card_title', 'Route safety')}
                            </h3>
                            {isRecommended && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary">
                                    <Sparkles className="w-3 h-3" />
                                    {t('safer_recommended_pill', 'Recommended')}
                                </span>
                            )}
                        </div>
                        <p className={cn('text-xs font-semibold uppercase tracking-wide', riskTextClass(analysis.risk))}>
                            {t(riskKey, analysis.risk)}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-black text-foreground tabular-nums leading-none">
                        {analysis.safetyScore.toFixed(1)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        {t('safety_score_label', 'Safety score / 10')}
                    </p>
                </div>
            </div>

            {/* Route chip strip — appears only when there are alternatives */}
            {routes.length > 1 && (
                <div className="-mx-1 overflow-x-auto">
                    <div className="flex gap-2 px-1 pb-1">
                        {routes.map((r) => {
                            const isSel = r.id === selected?.id;
                            const isRec = r.id === recommendedId;
                            const trafficScore = r.analysis?.dimensions?.traffic?.score ?? null;
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => onSwitchRoute(r.id)}
                                    className={cn(
                                        'min-w-[150px] shrink-0 text-left rounded-xl border px-3 py-2 transition-colors',
                                        isSel
                                            ? 'border-primary/40 bg-primary/15'
                                            : 'border-border/60 bg-background/30 hover:bg-primary/5'
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-bold text-foreground tabular-nums">
                                            {r.durationMin} min
                                        </span>
                                        <span
                                            className={cn(
                                                'w-2.5 h-2.5 rounded-full shrink-0',
                                                trafficDotClass(trafficScore)
                                            )}
                                            aria-hidden
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        {r.distanceKm.toFixed(1)} km
                                        {' · '}
                                        {t('route_via', 'via {{place}}', {
                                            place: viaLabel(r, '—')
                                        })}
                                    </p>
                                    {isRec && (
                                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                                            <Sparkles className="w-3 h-3" />
                                            {t('safer_recommended_pill', 'Recommended')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Summary */}
            {analysis.summary && (
                <p className="text-sm text-muted-foreground leading-snug">{analysis.summary}</p>
            )}

            {/* Dimensions */}
            <div className="space-y-3 pt-1">
                <DimensionRow
                    icon={ShieldCheck}
                    label={t('dim_accident_history', 'Accident history')}
                    dimension={analysis.dimensions.accidentHistory}
                />
                <DimensionRow
                    icon={Construction}
                    label={t('dim_road_condition', 'Road condition')}
                    dimension={analysis.dimensions.roadCondition}
                />
                <DimensionRow
                    icon={MoonStar}
                    label={t('dim_lighting', 'Lighting & time of day')}
                    dimension={analysis.dimensions.lightingAndTime}
                />
                <DimensionRow
                    icon={AlertTriangle}
                    label={t('dim_crime', 'Crime risk')}
                    dimension={analysis.dimensions.crime}
                />
                <DimensionRow
                    icon={Gauge}
                    label={t('dim_traffic', 'Traffic')}
                    dimension={analysis.dimensions.traffic}
                />
            </div>

            {/* Warnings */}
            {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                    {analysis.warnings.slice(0, 3).map((w, idx) => (
                        <li
                            key={idx}
                            className="flex items-start gap-2 text-xs text-foreground/80"
                        >
                            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                            <span className="leading-snug">{w}</span>
                        </li>
                    ))}
                </ul>
            )}

            {/* Switch route CTA */}
            {showSwitch && recommended && (
                <button
                    type="button"
                    onClick={() => onSwitchRoute(recommended.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/30 transition-colors group"
                >
                    <div className="flex items-center gap-2 text-left">
                        <Sparkles className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground leading-tight">
                                {t('switch_safer_route', 'Switch to safer route')}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                +{recommended.analysis?.safetyScore !== undefined
                                    ? (recommended.analysis.safetyScore - analysis.safetyScore).toFixed(1)
                                    : '0'}{' '}
                                pts
                                {deltaMin !== 0 && (
                                    <>
                                        {' · '}
                                        {deltaMin > 0 ? '+' : ''}
                                        {deltaMin} min
                                    </>
                                )}
                                {deltaKm !== 0 && (
                                    <>
                                        {' · '}
                                        {deltaKm > 0 ? '+' : ''}
                                        {deltaKm} km
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
                </button>
            )}
        </div>
    );
};

export default SafetyCard;
