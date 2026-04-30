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

const driverIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
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

L.Marker.prototype.options.icon = defaultIcon;

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
}> = ({ pickup, dropoff, driver, user }) => {
    const map = useMap();

    useEffect(() => {
        const points: [number, number][] = [];
        if (pickup && pickup[0] !== undefined) points.push(pickup);
        if (dropoff && dropoff[0] !== undefined) points.push(dropoff);
        if (driver && driver[0] !== undefined) points.push(driver);
        
        // If no markers to bound, use user location if available
        if (points.length === 0 && user && user[0] !== undefined) points.push(user);

        if (points.length >= 2) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else if (points.length === 1) {
            map.flyTo(points[0], 15);
        }
    }, [pickup, dropoff, driver, user, map]);

    return null;
};

// Component to handle Routing
const RoutingControl: React.FC<{
    pickup: [number, number] | null;
    dropoff: [number, number] | null;
    onRouteCalculated?: (distanceStr: string, durationStr: string, distanceKm: number) => void;
}> = ({ pickup, dropoff, onRouteCalculated }) => {
    const map = useMap();
    const routingControlRef = React.useRef<any>(null);

    useEffect(() => {
        if (!pickup || !dropoff || pickup[0] === undefined || dropoff[0] === undefined) {
            if (routingControlRef.current) {
                map.removeControl(routingControlRef.current);
                routingControlRef.current = null;
            }
            return;
        }

        if (routingControlRef.current) {
            routingControlRef.current.setWaypoints([
                L.latLng(pickup[0], pickup[1]),
                L.latLng(dropoff[0], dropoff[1])
            ]);
        } else {
            routingControlRef.current = L.Routing.control({
                waypoints: [
                    L.latLng(pickup[0], pickup[1]),
                    L.latLng(dropoff[0], dropoff[1])
                ],
                lineOptions: {
                    styles: [{ color: 'black', weight: 4, opacity: 0.6, dashArray: '10, 10' }],
                    extendToWaypoints: true,
                    missingRouteTolerance: 0
                },
                show: false, // Don't show the turn-by-turn instructions UI
                addWaypoints: false,
                routeWhileDragging: false,
                fitSelectedRoutes: false, // We handle bounds ourselves
                // @ts-ignore - Leaflet Routing Machine types are incomplete
                createMarker: () => null // We already render custom markers
            }).addTo(map);

            routingControlRef.current.on('routesfound', (e: any) => {
                const routes = e.routes;
                if (routes && routes.length > 0) {
                    const summary = routes[0].summary;
                    // summary.totalDistance is in meters, summary.totalTime is in seconds
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
    }, [pickup, dropoff, map, onRouteCalculated]);

    // Cleanup on complete unmount
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
    onRouteCalculated
}) => {
    // Default position: Kerala (Kochi)
    const defaultPosition: [number, number] = [9.9312, 76.2673];
    const center =
        centerPosition ||
        driverPosition ||
        pickupPosition ||
        dropoffPosition ||
        userPosition ||
        defaultPosition;

    return (
        <div className={className} style={{ height, width: '100%', borderRadius: '1rem', overflow: 'hidden', zIndex: 0 }}>
            <MapContainer
                center={center}
                zoom={13}
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
                    <Marker position={driverPosition} icon={driverIcon}>
                        <Popup>Driver Location</Popup>
                    </Marker>
                )}

                {userPosition && userPosition[0] !== undefined && (
                    <Marker position={userPosition} icon={userLocationIcon}>
                        <Popup>Your Location</Popup>
                    </Marker>
                )}

                <RoutingControl 
                    pickup={pickupPosition} 
                    dropoff={dropoffPosition} 
                    onRouteCalculated={onRouteCalculated} 
                />

                <FitBounds pickup={pickupPosition} dropoff={dropoffPosition} driver={driverPosition} user={userPosition} />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
