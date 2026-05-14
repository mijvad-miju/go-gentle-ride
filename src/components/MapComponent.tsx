import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

// Fix for default marker icon missing in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Custom Icons for Uber-like feel
const pickupIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const dropoffIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const defaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

const userLocationIcon = new L.DivIcon({
    className: 'user-location-marker',
    html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

/** Same dot shape as passenger (blue); brand primary yellow for driver. */
const driverLocationIcon = new L.DivIcon({
    className: 'driver-location-marker',
    html: `<div style="background-color: hsl(45, 93%, 47%); width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px hsl(45 93% 47% / 0.55);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

L.Marker.prototype.options.icon = defaultIcon;

export interface SafetyRouteShape {
    id: string;
    geometry: [number, number][];
    durationMin: number;
    /** 0-10 Gemini-inferred traffic score (10 = free-flowing). Optional. */
    trafficScore?: number | null;
    isSelected: boolean;
}

export interface ItineraryStop {
    address: string;
    coordinates: { lat: number; lng: number };
    /** 'pending' | 'visited' | 'skipped' — visited ones render faded. */
    status?: 'pending' | 'visited' | 'skipped';
    /** 'booking' | 'mid_trip' — only used for hover/popup label. */
    source?: 'booking' | 'mid_trip';
}

interface MapComponentProps {
    onLocationSelect?: (lat: number, lng: number) => void;
    height?: string;
    pickupPosition?: [number, number] | null;
    dropoffPosition?: [number, number] | null;
    pickupName?: string;
    dropoffName?: string;
    driverPosition?: [number, number] | null;
    userPosition?: [number, number] | null;
    centerPosition?: [number, number] | null;
    className?: string;
    onRouteCalculated?: (distanceStr: string, durationStr: string, distanceKm: number) => void;
    /**
     * Google-Maps-style multi-route overlay. When provided, the built-in routing-machine
     * is suppressed and we draw each route ourselves (selected one in brand primary,
     * alternates dimmed/dashed). Tapping a route or its time pill triggers onSelectRoute.
     */
    safetyRoutes?: SafetyRouteShape[];
    onSelectRoute?: (routeId: string) => void;
    /**
     * Multi-stop itinerary. Renders numbered pins (1,2,3...) along pickup -> drop
     * and replaces the simple two-waypoint routing with a multi-waypoint OSRM route.
     */
    stops?: ItineraryStop[];
}

function trafficDotColor(score: number | null | undefined): string {
    if (typeof score !== 'number') return 'hsl(0, 0%, 60%)';
    if (score >= 7.5) return 'hsl(145, 60%, 40%)';
    if (score >= 5) return 'hsl(35, 90%, 50%)';
    return 'hsl(0, 70%, 50%)';
}

function buildRoutePillIcon(opts: {
    durationMin: number;
    trafficScore: number | null | undefined;
    selected: boolean;
}): L.DivIcon {
    const dotColor = trafficDotColor(opts.trafficScore);
    const bg = opts.selected ? 'hsl(45, 93%, 47%)' : 'rgba(255,255,255,0.92)';
    const fg = opts.selected ? '#000' : '#111';
    const border = opts.selected ? 'hsl(45, 80%, 40%)' : 'rgba(0,0,0,0.12)';
    const shadow = opts.selected
        ? '0 6px 16px -4px hsl(45 93% 47% / 0.45)'
        : '0 4px 12px -4px rgba(0,0,0,0.25)';
    const html = `
        <div style="
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 9px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            background: ${bg};
            color: ${fg};
            border: 1px solid ${border};
            box-shadow: ${shadow};
            backdrop-filter: blur(6px);
            white-space: nowrap;
            pointer-events: auto;
            cursor: pointer;
            transform: translateY(-2px);
        ">
            <span style="
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: ${dotColor};
                box-shadow: 0 0 0 1px rgba(255,255,255,0.6);
            "></span>
            <span>${opts.durationMin} min</span>
        </div>
    `;
    return L.divIcon({
        className: 'safety-route-pill',
        html,
        iconSize: undefined as unknown as L.PointTuple, // size auto from html
        iconAnchor: [0, 0]
    });
}

/** Numbered glass pin for itinerary stops (1, 2, 3...). Visited stops fade. */
function buildStopIcon(index: number, status: 'pending' | 'visited' | 'skipped' = 'pending'): L.DivIcon {
    const visited = status === 'visited';
    const skipped = status === 'skipped';
    const bg = visited
        ? 'hsl(45, 35%, 80%)'
        : skipped
        ? 'rgba(255,255,255,0.65)'
        : 'hsl(45, 93%, 47%)';
    const fg = visited || skipped ? 'rgba(0,0,0,0.55)' : '#000';
    const border = visited
        ? 'hsl(45, 40%, 55%)'
        : skipped
        ? 'rgba(0,0,0,0.2)'
        : 'hsl(45, 80%, 40%)';
    const html = `
        <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: ${bg};
            color: ${fg};
            border: 2px solid white;
            outline: 1px solid ${border};
            box-shadow: 0 4px 12px -3px hsl(45 80% 30% / 0.45);
            font-weight: 800;
            font-size: 13px;
            line-height: 1;
            opacity: ${visited ? 0.7 : 1};
            text-decoration: ${visited ? 'line-through' : 'none'};
        ">${index}</div>
    `;
    return L.divIcon({
        className: 'itinerary-stop-pin',
        html,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -16]
    });
}

function midpointOf(coords: [number, number][]): [number, number] | null {
    if (!coords || coords.length === 0) return null;
    if (coords.length === 1) return coords[0];
    return coords[Math.floor(coords.length / 2)];
}

/**
 * Pick a point along the route at fraction `f` (0..1) — used so the time-pills of
 * 2-3 alternative routes don't all stack on the same midpoint.
 */
function pointAlong(coords: [number, number][], f: number): [number, number] | null {
    if (!coords || coords.length === 0) return null;
    const clamped = Math.max(0, Math.min(1, f));
    const idx = Math.min(coords.length - 1, Math.max(0, Math.floor(coords.length * clamped)));
    return coords[idx];
}

// Component to handle map clicks
const LocationMarker: React.FC<{ onLocationSelect?: (lat: number, lng: number) => void }> = ({ onLocationSelect }) => {
    useMapEvents({
        click(e) {
            if (onLocationSelect) {
                onLocationSelect(e.latlng.lat, e.latlng.lng);
            }
        },
    });
    return null;
};

// Component to fit bounds to markers
const FitBounds: React.FC<{
    pickup?: [number, number] | null;
    dropoff?: [number, number] | null;
    driver?: [number, number] | null;
    user?: [number, number] | null;
    /** Optional route coordinates (union of all alternates) so all polylines fit on screen. */
    routesCoords?: [number, number][];
    /** Itinerary stops — included in bounds so off-route waypoints stay visible. */
    stopPoints?: [number, number][];
}> = ({ pickup, dropoff, driver, user, routesCoords, stopPoints }) => {
    const map = useMap();

    // Stable signature so we only re-fit when geometry actually changes, not on every render.
    const routesSig = React.useMemo(() => {
        if (!routesCoords || routesCoords.length === 0) return '';
        return `${routesCoords.length}|${routesCoords[0]?.join(',')}|${routesCoords[routesCoords.length - 1]?.join(',')}`;
    }, [routesCoords]);
    const stopsSig = React.useMemo(() => {
        if (!stopPoints || stopPoints.length === 0) return '';
        return stopPoints.map((p) => p.join(',')).join('|');
    }, [stopPoints]);

    useEffect(() => {
        const points: [number, number][] = [];
        if (pickup && pickup[0] !== undefined) points.push(pickup);
        if (dropoff && dropoff[0] !== undefined) points.push(dropoff);
        if (driver && driver[0] !== undefined) points.push(driver);
        if (stopPoints && stopPoints.length > 0) points.push(...stopPoints);
        if (routesCoords && routesCoords.length > 0) {
            points.push(...routesCoords);
        }

        // If no markers to bound, use user location if available
        if (points.length === 0 && user && user[0] !== undefined) points.push(user);

        if (points.length >= 2) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (points.length === 1) {
            map.flyTo(points[0], 15);
        }
    }, [pickup, dropoff, driver, user, map, routesSig, stopsSig]);

    return null;
};

// Component to handle Routing — supports pickup -> stop1 -> stop2 ... -> dropoff
const RoutingControl: React.FC<{
    pickup: [number, number] | null;
    dropoff: [number, number] | null;
    stops?: ItineraryStop[];
    onRouteCalculated?: (distanceStr: string, durationStr: string, distanceKm: number) => void;
}> = ({ pickup, dropoff, stops, onRouteCalculated }) => {
    const map = useMap();
    const routingControlRef = React.useRef<any>(null);

    // Stable signature for stops so we only re-route when waypoints actually change.
    const stopsSig = React.useMemo(() => {
        if (!stops || stops.length === 0) return '';
        return stops
            .map((s, i) => `${i}:${s.coordinates?.lat?.toFixed(5)},${s.coordinates?.lng?.toFixed(5)}:${s.status || 'pending'}`)
            .join('|');
    }, [stops]);

    useEffect(() => {
        if (!pickup || !dropoff || pickup[0] === undefined || dropoff[0] === undefined) {
            if (routingControlRef.current) {
                map.removeControl(routingControlRef.current);
                routingControlRef.current = null;
            }
            return;
        }

        // Build waypoints: pickup -> each NOT-visited stop in order -> dropoff.
        // Visited stops are excluded so the live route reflects what's left.
        const stopWaypoints = (stops || [])
            .filter((s) => s.status !== 'visited' && s.coordinates && Number.isFinite(s.coordinates.lat))
            .map((s) => L.latLng(s.coordinates.lat, s.coordinates.lng));
        const waypoints = [
            L.latLng(pickup[0], pickup[1]),
            ...stopWaypoints,
            L.latLng(dropoff[0], dropoff[1])
        ];

        if (routingControlRef.current) {
            routingControlRef.current.setWaypoints(waypoints);
        } else {
            routingControlRef.current = L.Routing.control({
                waypoints,
                lineOptions: {
                    styles: [{ color: 'black', weight: 4, opacity: 0.6, dashArray: '10, 10' }],
                    extendToWaypoints: true,
                    missingRouteTolerance: 0
                },
                show: false,
                addWaypoints: false,
                routeWhileDragging: false,
                fitSelectedRoutes: false,
                // @ts-ignore - Leaflet Routing Machine types are incomplete
                createMarker: () => null
            }).addTo(map);

            routingControlRef.current.on('routesfound', (e: any) => {
                const routes = e.routes;
                if (routes && routes.length > 0) {
                    const summary = routes[0].summary;
                    if (onRouteCalculated) {
                        const distKm = summary.totalDistance / 1000;
                        const distStr = `${distKm.toFixed(1)} km`;
                        const timeMin = Math.round(summary.totalTime / 60);
                        const timeStr = `${timeMin} min`;
                        onRouteCalculated(distStr, timeStr, distKm);
                    }
                }
            });
        }

        return () => {
             // Cleanup handled by dependency changes or unmount
        };
    }, [pickup, dropoff, map, onRouteCalculated, stopsSig]);

    useEffect(() => {
        return () => {
            if (routingControlRef.current) {
                map.removeControl(routingControlRef.current);
            }
        };
    }, [map]);

    return null;
};

const MapComponent: React.FC<MapComponentProps> = ({
    onLocationSelect,
    height = '400px',
    pickupPosition,
    dropoffPosition,
    pickupName,
    dropoffName,
    driverPosition,
    userPosition,
    centerPosition,
    className,
    onRouteCalculated,
    safetyRoutes,
    onSelectRoute,
    stops
}) => {
    // No-data fallback: roughly center of India. We deliberately avoid using
    // a specific city like Kochi so that, when geolocation is still loading
    // or denied, we don't mislead the user into believing they're in Kerala.
    const defaultPosition: [number, number] = [22.5937, 78.9629];
    const center =
        centerPosition ||
        driverPosition ||
        pickupPosition ||
        dropoffPosition ||
        userPosition ||
        defaultPosition;
    // When we have nothing better than the India-wide default, zoom out so
    // the user can pan to their actual area instead of being dropped into
    // the middle of the country at street-level.
    const hasAnyRealPosition = Boolean(
        centerPosition || driverPosition || pickupPosition || dropoffPosition || userPosition
    );
    const initialZoom = hasAnyRealPosition ? 13 : 5;

    const hasSafetyRoutes = Array.isArray(safetyRoutes) && safetyRoutes.length > 0;

    // Selected route is rendered last (on top); alternates first so they sit behind.
    const orderedRoutes = React.useMemo(() => {
        if (!hasSafetyRoutes) return [] as SafetyRouteShape[];
        const sel = safetyRoutes!.filter((r) => r.isSelected);
        const alt = safetyRoutes!.filter((r) => !r.isSelected);
        return [...alt, ...sel];
    }, [safetyRoutes, hasSafetyRoutes]);

    const allRouteCoords = React.useMemo<[number, number][]>(() => {
        if (!hasSafetyRoutes) return [];
        const flat: [number, number][] = [];
        for (const r of safetyRoutes!) {
            if (Array.isArray(r.geometry)) flat.push(...r.geometry);
        }
        return flat;
    }, [safetyRoutes, hasSafetyRoutes]);

    const stopPoints = React.useMemo<[number, number][]>(() => {
        if (!stops || stops.length === 0) return [];
        return stops
            .filter((s) => s?.coordinates && Number.isFinite(s.coordinates.lat) && Number.isFinite(s.coordinates.lng))
            .map((s) => [s.coordinates.lat, s.coordinates.lng] as [number, number]);
    }, [stops]);

    return (
        <div className={className} style={{ height, width: '100%', borderRadius: '1rem', overflow: 'hidden', zIndex: 0 }}>
            <MapContainer
                center={center}
                zoom={initialZoom}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false} // Hide default zoom control for cleaner look
            >
                {/* CartoDB Voyager Tiles - Cleaner, minimal, standard for apps */}
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />

                <LocationMarker onLocationSelect={onLocationSelect} />

                {pickupPosition && pickupPosition[0] !== undefined && (
                    <Marker position={pickupPosition} icon={pickupIcon}>
                        <Popup>{pickupName || 'Pickup Location'}</Popup>
                    </Marker>
                )}

                {dropoffPosition && dropoffPosition[0] !== undefined && (
                    <Marker position={dropoffPosition} icon={dropoffIcon}>
                        <Popup>{dropoffName || 'Dropoff Location'}</Popup>
                    </Marker>
                )}

                {driverPosition && driverPosition[0] !== undefined && (
                    <Marker position={driverPosition} icon={driverLocationIcon}>
                        <Popup>Driver location</Popup>
                    </Marker>
                )}

                {userPosition && userPosition[0] !== undefined && (
                    <Marker position={userPosition} icon={userLocationIcon}>
                        <Popup>Your Location</Popup>
                    </Marker>
                )}

                {/* Multi-route overlay (Google-Maps style) */}
                {hasSafetyRoutes &&
                    orderedRoutes.map((r) => {
                        if (!r.geometry || r.geometry.length < 2) return null;
                        const selected = r.isSelected;
                        return (
                            <Polyline
                                key={`poly-${r.id}`}
                                positions={r.geometry}
                                pathOptions={{
                                    color: selected ? 'hsl(45, 93%, 47%)' : 'hsl(0, 0%, 55%)',
                                    weight: selected ? 6 : 4,
                                    opacity: selected ? 0.95 : 0.55,
                                    dashArray: selected ? undefined : '6 8',
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                }}
                                eventHandlers={{
                                    click: () => {
                                        if (!selected && onSelectRoute) onSelectRoute(r.id);
                                    }
                                }}
                            />
                        );
                    })}

                {/* Per-route time pill near route midpoint — always shown when we have
                    safety routes (Google-Maps shows time even with 1 route). */}
                {hasSafetyRoutes &&
                    orderedRoutes.map((r, idx) => {
                        // Offset each pill along the route so 2-3 pills don't all stack
                        // on the same point. Selected stays near mid; alternates shift.
                        const total = orderedRoutes.length;
                        const fraction =
                            total <= 1
                                ? 0.5
                                : r.isSelected
                                ? 0.5
                                : 0.32 + (idx / Math.max(1, total - 1)) * 0.32;
                        const pos = pointAlong(r.geometry, fraction) || midpointOf(r.geometry);
                        if (!pos) return null;
                        const icon = buildRoutePillIcon({
                            durationMin: r.durationMin,
                            trafficScore: r.trafficScore,
                            selected: r.isSelected
                        });
                        return (
                            <Marker
                                key={`pill-${r.id}`}
                                position={pos}
                                icon={icon}
                                interactive
                                eventHandlers={{
                                    click: () => {
                                        if (!r.isSelected && onSelectRoute) onSelectRoute(r.id);
                                    }
                                }}
                                // Selected pill on top of alternates
                                zIndexOffset={r.isSelected ? 1000 : 0}
                            />
                        );
                    })}

                {/* Numbered itinerary pins (1, 2, 3...) — drawn on top of route polylines. */}
                {stops && stops.length > 0 &&
                    stops
                        .filter(
                            (s) =>
                                s?.coordinates &&
                                Number.isFinite(s.coordinates.lat) &&
                                Number.isFinite(s.coordinates.lng)
                        )
                        .map((s, idx) => (
                            <Marker
                                key={`stop-${idx}-${s.coordinates.lat}-${s.coordinates.lng}`}
                                position={[s.coordinates.lat, s.coordinates.lng]}
                                icon={buildStopIcon(idx + 1, s.status || 'pending')}
                                zIndexOffset={500}
                            >
                                <Popup>
                                    <div style={{ fontWeight: 700, marginBottom: 2 }}>
                                        Stop {idx + 1}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{s.address}</div>
                                </Popup>
                            </Marker>
                        ))}

                {!hasSafetyRoutes && (
                    <RoutingControl
                        pickup={pickupPosition}
                        dropoff={dropoffPosition}
                        stops={stops}
                        onRouteCalculated={onRouteCalculated}
                    />
                )}

                <FitBounds
                    pickup={pickupPosition}
                    dropoff={dropoffPosition}
                    driver={driverPosition}
                    user={userPosition}
                    routesCoords={allRouteCoords}
                    stopPoints={stopPoints}
                />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
