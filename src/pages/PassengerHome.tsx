import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, ChevronRight, Plus, GripVertical, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
  DrawerFooter,
} from "@/components/ui/drawer";
import Header from '@/components/common/Header';
import LocationInput from '@/components/passenger/LocationInput';
import FareEstimate from '@/components/passenger/FareEstimate';
import MapView from '@/components/passenger/MapView';
import MapComponent from '@/components/MapComponent';
import SafetyCard, { AnalyzedRoute } from '@/components/passenger/SafetyCard';
import AutoRickshaw from '@/components/icons/AutoRickshaw';
import { toast } from '@/hooks/use-toast';
import { getAuthToken, getUser } from '@/lib/auth';
import { getApiOrigin } from '@/lib/apiOrigin';

const API_ORIGIN = getApiOrigin();

const INDIA_BOUNDS = { minLat: 6.746, maxLat: 37.09, minLng: 68.162, maxLng: 97.395 };

function isCoordInIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

type BookingStep = 'location' | 'confirm' | 'searching';

const PassengerHome = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<BookingStep>('location');
  type LocationData = { name: string; lat: number; lng: number } | null;
  const [source, setSource] = useState<LocationData>(null);
  const [destination, setDestination] = useState<LocationData>(null);
  const [liveUserPosition, setLiveUserPosition] = useState<[number, number] | null>(null);
  const [geoAccuracyM, setGeoAccuracyM] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  // Scheduled rides state
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  // Route calculation state
  const [routeStats, setRouteStats] = useState<{distanceStr: string, durationStr: string, distanceKm: number} | null>(null);

  // Route-safety state (Gemini-scored alternatives)
  const [safetyRoutes, setSafetyRoutes] = useState<AnalyzedRoute[]>([]);
  const [recommendedRouteId, setRecommendedRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const safetyAbortRef = React.useRef<AbortController | null>(null);

  // Lady-safety: 60s expand-search prompt state.
  const [currentRidePrefs, setCurrentRidePrefs] = useState<{
    preferredDriverGender: 'male' | 'female' | 'any';
    genderFilterActive: boolean;
  } | null>(null);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [showExpandPrompt, setShowExpandPrompt] = useState(false);
  const [expanding, setExpanding] = useState(false);

  // Multi-stop itinerary (booking-time stops only — mid-trip stops live on TripTracking).
  // Max 5. We render numbered chips with drag-reorder + remove on the location step,
  // and feed them to MapComponent for the multi-leg polyline + numbered pins.
  type ItineraryStop = { id: string; name: string; lat: number; lng: number };
  const [stops, setStops] = useState<ItineraryStop[]>([]);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const MAX_BOOKING_STOPS = 5;

  // Map Popup State
  const [isMapOpen, setIsMapOpen] = useState(false);
  // `activeField` extends to 'stop:<id>' so the same map picker can write to a specific stop slot.
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff' | `stop:${string}`>('pickup');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [voicePickup, setVoicePickup] = useState('');
  const [voiceDropoff, setVoiceDropoff] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [sttTranscriptDisplay, setSttTranscriptDisplay] = useState('');
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);

  const waitingFareMeta = React.useMemo(() => {
    if (step !== 'searching' || !source || !destination) return null;
    const approxKm =
      routeStats?.distanceKm ?? haversineKm(source, destination) * 1.28;
    return {
      fare: Math.round(approxKm * 15 + 20),
      distanceStr: routeStats?.distanceStr ?? `${approxKm.toFixed(1)} km`,
      durationStr: routeStats?.durationStr ?? `${Math.round(approxKm * 3 + 2)} min`,
    };
  }, [step, source, destination, routeStats]);

  const getDefaultScheduleTime = () => new Date(Date.now() + 30 * 60000);
  const toDatetimeLocalValue = (date: Date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordedChunksRef = React.useRef<BlobPart[]>([]);
  const stopHandledRef = React.useRef(false);
  const recordingStartedAtRef = React.useRef<number>(0);

  /** While waiting for a driver: HTTP poll + socket `ride_updated` */
  const pollingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingSocketRef = React.useRef<{ disconnect: () => void } | null>(null);
  const acceptNavigatedRef = React.useRef(false);

  const clearRideWaitingPoll = React.useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const disconnectRideWaitingSocket = React.useCallback(() => {
    if (waitingSocketRef.current) {
      try {
        waitingSocketRef.current.disconnect();
      } catch {
        /* ignore */
      }
      waitingSocketRef.current = null;
    }
  }, []);

  const stopRideWaiting = React.useCallback(() => {
    clearRideWaitingPoll();
    disconnectRideWaitingSocket();
  }, [clearRideWaitingPoll, disconnectRideWaitingSocket]);

  const handleDriverAssignedForLiveTracking = React.useCallback(
    (updatedRide: any, rideId: string) => {
      if (acceptNavigatedRef.current) return;
      const status = updatedRide?.status;
      if (status !== 'accepted' && status !== 'in_progress') return;

      const isScheduledRide = Boolean(updatedRide?.isScheduled || updatedRide?.scheduledFor);
      if (isScheduledRide) {
        acceptNavigatedRef.current = true;
        stopRideWaiting();
        setStep('location');
        toast({
          title: t('scheduled_ride_accepted_title'),
          description: t('scheduled_ride_accepted_desc'),
        });
        return;
      }

      acceptNavigatedRef.current = true;
      stopRideWaiting();
      navigate(`/tracking/${rideId}`);
    },
    [navigate, stopRideWaiting, t]
  );

  React.useEffect(() => {
    // Fetch + watch current user location (live).
    // We intentionally do NOT fall back to a hardcoded city when geolocation fails —
    // a wrong default (e.g. Kochi) is worse than no map at all because it silently
    // routes the user from the wrong pickup. We instead surface a toast that asks
    // them to enable location or pick pickup manually.
    let watchId: number | null = null;
    if (!('geolocation' in navigator)) {
      toast({
        title: i18n.t('geolocation_unavailable', 'Location unavailable'),
        description: i18n.t(
          'geolocation_unavailable_desc',
          'Pick your pickup manually using the map.'
        ),
        variant: 'destructive'
      });
      return;
    }

    // Stage 1: try a fast cached fix (up to 5 min old) so the map shows
    // *something* near the user immediately. We still upgrade to a fresh
    // high-accuracy fix in stage 2.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLiveUserPosition(pos);
        setGeoAccuracyM(position.coords.accuracy);
        console.log('[geo] cached fix', { pos, accuracyM: position.coords.accuracy });
        setSource((prev) => prev ?? { name: i18n.t('current_location'), lat: pos[0], lng: pos[1] });
      },
      () => {
        // Ignore — stage 2 will retry with high accuracy.
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 }
    );

    // Stage 2: high-accuracy fresh fix. This overrides whatever stage 1 gave us
    // only if the user hasn't already picked a custom pickup.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLiveUserPosition(pos);
        setGeoAccuracyM(position.coords.accuracy);
        console.log('[geo] currentPosition', { pos, accuracyM: position.coords.accuracy });
        setSource((prev) => {
          // If the previously-set source was just the cached "current_location",
          // upgrade it to the fresh fix. Don't overwrite a manually-picked pickup.
          if (!prev || prev.name === i18n.t('current_location')) {
            return { name: i18n.t('current_location'), lat: pos[0], lng: pos[1] };
          }
          return prev;
        });

        if (position.coords.accuracy > 2000) {
          toast({
            title: i18n.t('location_approximate_title'),
            description: i18n.t('location_approximate_desc', {
              meters: Math.round(position.coords.accuracy),
            }),
            variant: 'destructive',
          });
        }
      },
      (error) => {
        console.error('Error getting exact location:', error);
        const code = (error && (error as any).code) as number | undefined;
        if (code === 1 /* PERMISSION_DENIED */) {
          toast({
            title: i18n.t('location_permission_denied_title', 'Location blocked'),
            description: i18n.t(
              'location_permission_denied_desc',
              'Enable location in your browser settings to auto-fill pickup.'
            ),
            variant: 'destructive'
          });
        } else if (code === 3 /* TIMEOUT */) {
          toast({
            title: i18n.t('location_timeout_title', 'Could not locate you'),
            description: i18n.t(
              'location_timeout_desc',
              'Pick your pickup manually using the map.'
            ),
            variant: 'destructive'
          });
        } else {
          toast({
            title: i18n.t('geolocation_unavailable', 'Location unavailable'),
            description: i18n.t(
              'geolocation_unavailable_desc',
              'Pick your pickup manually using the map.'
            ),
            variant: 'destructive'
          });
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
        setLiveUserPosition(pos);
        setGeoAccuracyM(position.coords.accuracy);
        console.log('[geo] watchPosition', { pos, accuracyM: position.coords.accuracy });
      },
      (error) => {
        console.error('Geolocation watch error:', error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    const checkActiveRide = async () => {
      try {
        const user = getUser('passenger');
        if (!user) return;

        const API_URL = getApiOrigin();
        const response = await fetch(`${API_URL}/api/rides/user/${user._id}`);
        const rides = await response.json();
        const now = Date.now();

        // Find any ride that isn't completed or cancelled
        const activeRide = rides.find((r: any) => {
          if (r.status === 'completed' || r.status === 'cancelled') return false;
          if (r.scheduledFor && new Date(r.scheduledFor).getTime() > now) return false;
          const isScheduledRide = Boolean(r.isScheduled || r.scheduledFor);
          // Scheduled rides never block immediate booking flow.
          // They are managed in Prebookings and should not force tracking here.
          if (isScheduledRide) return false;
          return ['pending', 'accepted', 'in_progress'].includes(r.status);
        });

        if (activeRide) {
          setCurrentRideId(activeRide._id);
          if (activeRide.pickupLocation.coordinates) {
             setSource({
               name: activeRide.pickupLocation.address,
               lat: activeRide.pickupLocation.coordinates.lat,
               lng: activeRide.pickupLocation.coordinates.lng
             });
          }
          if (activeRide.dropoffLocation.coordinates) {
             setDestination({
               name: activeRide.dropoffLocation.address,
               lat: activeRide.dropoffLocation.coordinates.lat,
               lng: activeRide.dropoffLocation.coordinates.lng
             });
          }

          if (activeRide.status === 'pending') {
            setStep('searching');
            startPolling(activeRide._id);
          } else {
            navigate(`/tracking/${activeRide._id}`);
          }
        }
      } catch (error) {
        console.error('Error checking active ride:', error);
      } finally {
        setLoading(false);
      }
    };

    checkActiveRide();

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      clearRideWaitingPoll();
      disconnectRideWaitingSocket();
    };
  }, [navigate, clearRideWaitingPoll, disconnectRideWaitingSocket]);

  const startPolling = (rideId: string) => {
    clearRideWaitingPoll();
    const API_URL = getApiOrigin();
    const tick = async () => {
      try {
        const rideRes = await fetch(`${API_URL}/api/rides/${rideId}`, {
          headers: {
            Authorization: `Bearer ${getAuthToken('passenger')}`,
          },
        });
        const updatedRide = await rideRes.json();
        handleDriverAssignedForLiveTracking(updatedRide, rideId);
      } catch (error) {
        console.error('Error polling ride status:', error);
      }
    };
    void tick();
    pollingIntervalRef.current = setInterval(tick, 2500);
  };

  React.useEffect(() => {
    if (step !== 'searching' || !currentRideId) return;
    acceptNavigatedRef.current = false;
  }, [step, currentRideId]);

  // Lady-safety: track whether the auto-prompt threshold (30s) has been crossed.
  // The expand-search UI is shown immediately as a small inline link whenever a
  // gender filter is active; after 30s it auto-promotes to a more prominent banner.
  const [autoPromoted, setAutoPromoted] = useState(false);
  React.useEffect(() => {
    if (step !== 'searching' || !currentRideId || !searchStartedAt) {
      setShowExpandPrompt(false);
      setAutoPromoted(false);
      return;
    }
    if (!currentRidePrefs) return;
    if (currentRidePrefs.preferredDriverGender === 'any' || !currentRidePrefs.genderFilterActive) {
      setShowExpandPrompt(false);
      setAutoPromoted(false);
      return;
    }
    // The prompt is always available when a filter is active — auto-promote after 30s
    // so users who don't notice still see a prominent banner.
    setShowExpandPrompt(true);
    const elapsed = Date.now() - searchStartedAt;
    if (elapsed >= 30_000) {
      setAutoPromoted(true);
      return;
    }
    const timeout = setTimeout(() => setAutoPromoted(true), 30_000 - elapsed);
    return () => clearTimeout(timeout);
  }, [step, currentRideId, searchStartedAt, currentRidePrefs]);

  const handleExpandSearch = React.useCallback(async () => {
    if (!currentRideId || expanding) return;
    setExpanding(true);
    try {
      const API_URL = getApiOrigin();
      const token = getAuthToken('passenger');
      if (!token) {
        throw new Error('You must be signed in to expand search');
      }
      const res = await fetch(`${API_URL}/api/rides/${currentRideId}/expand-search`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[expand-search] failed', res.status, data);
        throw new Error(data?.message || `Could not expand search (HTTP ${res.status})`);
      }
      setCurrentRidePrefs((prev) =>
        prev ? { ...prev, genderFilterActive: false } : prev
      );
      setShowExpandPrompt(false);
      setAutoPromoted(false);
      toast({
        title: t('expand_search_yes', 'Expanded search'),
        description: t(
          'expand_search_confirm_desc',
          'Searching all available drivers nearby.'
        )
      });
    } catch (e: any) {
      toast({
        title: t('error', 'Error'),
        description: e?.message || 'Could not expand search',
        variant: 'destructive'
      });
    } finally {
      setExpanding(false);
    }
  }, [currentRideId, expanding, t]);

  React.useEffect(() => {
    if (step !== 'searching' || !currentRideId) return;
    const rideId = currentRideId;
    let cancelled = false;

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return;
      const API_URL = getApiOrigin();
      const socket = API_URL === '' ? io() : io(API_URL);
      if (cancelled) {
        socket.disconnect();
        return;
      }
      waitingSocketRef.current = socket;

      const join = () => {
        socket.emit('join_ride', rideId);
        const passenger = getUser('passenger');
        if (passenger?._id) {
          socket.emit('join_passenger_room', passenger._id);
        }
      };
      socket.on('connect', join);
      if (socket.connected) join();

      socket.on('passenger_pickup_otp', (payload: { rideId: string }) => {
        if (!payload?.rideId || String(payload.rideId) !== String(rideId)) return;
        toast({
          title: t('pickup_otp_title'),
          description: t('pickup_otp_subtitle'),
        });
      });

      socket.on('ride_updated', (updatedRide: any) => {
        if (!updatedRide || String(updatedRide._id) !== String(rideId)) return;
        handleDriverAssignedForLiveTracking(updatedRide, rideId);
      });
    });

    return () => {
      cancelled = true;
      disconnectRideWaitingSocket();
    };
  }, [step, currentRideId, handleDriverAssignedForLiveTracking, disconnectRideWaitingSocket]);

  const handleVoiceInput = () => {
    if (isListening) return;

    setShowVoiceOverlay(true);
    setInterimTranscript(t('voice_prepare_mic'));
    setVoicePickup('');
    setVoiceDropoff('');
    setVoiceTranscript('');
    setSttTranscriptDisplay('');

    // Reliable path for Brave/Cursor: record audio and use Sarvam STT on backend
    startAudioRecording();
  };

  const startAudioRecording = async () => {
    try {
      recordedChunksRef.current = [];
      stopHandledRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Prefer webm/opus if available
      const preferredMime =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstart = () => {
        recordingStartedAtRef.current = Date.now();
        setIsListening(true);
        setInterimTranscript(t('voice_recording'));
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setInterimTranscript(t('voice_recording_error'));
        setIsListening(false);
      };

      recorder.onstop = async () => {
        if (stopHandledRef.current) return;
        stopHandledRef.current = true;
        setIsListening(false);
        // Stop mic
        mediaStreamRef.current?.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;

        // Let final ondataavailable settle in some browsers
        await new Promise((r) => setTimeout(r, 120));
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordedChunksRef.current = [];

        const recordingSeconds = (Date.now() - recordingStartedAtRef.current) / 1000;
        if (blob.size < 5000 && recordingSeconds > 2) {
          // Some devices/browsers produce tiny but still valid blobs (especially with compressed opus).
          // Warn the user but continue to STT instead of hard-blocking.
          toast({
            title: t('low_audio_title'),
            description: t('low_audio_desc'),
          });
        }

        // Convert to base64 (no data: prefix)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = String(reader.result || '');
            const commaIdx = result.indexOf(',');
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
          };
          reader.onerror = () => reject(new Error('Failed to read audio blob'));
          reader.readAsDataURL(blob);
        });

        await processVoiceAudio(base64, blob.type || recorder.mimeType || 'audio/webm');
      };

      // Record as a single blob; timeslice mode produced tiny chunks in this environment.
      recorder.start();
    } catch (error) {
      console.error('Mic capture error:', error);
      setInterimTranscript(t('voice_permission_blocked'));
      toast({
        title: t('microphone_error_title'),
        description: t('microphone_error_desc'),
        variant: 'destructive',
      });
      setIsListening(false);
    }
  };

  const stopAudioRecording = () => {
    try {
      // Update UI immediately so user doesn't see a stuck "recording" screen
      setIsListening(false);
      setInterimTranscript(t('voice_processing'));

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopHandledRef.current = false;
        mediaRecorderRef.current.stop();
        // Some browsers occasionally fail to fire onstop reliably; fallback after a short delay
        setTimeout(async () => {
          if (stopHandledRef.current) return;
          // If chunks are still arriving, wait for onstop path.
          if (recordedChunksRef.current.length === 0) return;
          stopHandledRef.current = true;
          try {
            mediaStreamRef.current?.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
            const fallbackMime = mediaRecorderRef.current?.mimeType || 'audio/webm';
            const blob = new Blob(recordedChunksRef.current, { type: fallbackMime });
            recordedChunksRef.current = [];
            if (blob.size === 0) {
              setInterimTranscript(t('voice_no_audio'));
              return;
            }
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = String(reader.result || '');
                const commaIdx = result.indexOf(',');
                resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
              };
              reader.onerror = () => reject(new Error('Failed to read audio blob'));
              reader.readAsDataURL(blob);
            });
            await processVoiceAudio(base64, blob.type || fallbackMime);
          } catch (e) {
            console.error('Fallback stop handling failed:', e);
            setInterimTranscript(t('voice_process_error'));
          }
        }, 4000);
      }
    } catch (e) {
      console.error('Stop recording failed:', e);
      setInterimTranscript(t('voice_stop_error'));
    }
  };

  const applyVoiceResult = async (data: { pickup?: string; drop?: string; message?: string; audioData?: string | null; transcript?: string }) => {
    const pickupLabel: string = data.pickup || i18n.t('current_location');
    const dropLabel: string = data.drop || '';
    setVoicePickup(pickupLabel);
    setVoiceDropoff(dropLabel);
    if (data.transcript) {
      setVoiceTranscript(data.transcript);
      setSttTranscriptDisplay(data.transcript);
    }

    const geocodePlaceSmart = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
      const trimmed = addr.replace(/[\u0964\.\s]+$/u, '').trim();
      if (trimmed.length < 2) return null;
      const variants = [trimmed, `${trimmed}, India`, `${trimmed}, Kerala, India`];
      const seen = new Set<string>();
      for (const q of variants) {
        if (seen.has(q)) continue;
        seen.add(q);
        try {
          const res = await fetch(
            `${API_ORIGIN}/api/geocode/search?q=${encodeURIComponent(q)}&limit=5`
          );
          const d = await res.json();
          if (!Array.isArray(d)) continue;
          for (const row of d) {
            const lat = parseFloat(row.lat);
            const lng = parseFloat(row.lon);
            if (Number.isFinite(lat) && Number.isFinite(lng) && isCoordInIndia(lat, lng)) {
              return { lat, lng };
            }
          }
        } catch {
          /* ignore */
        }
      }
      return null;
    };

    if (data.pickup) {
      const coords = await geocodePlaceSmart(data.pickup);
      if (coords) setSource({ name: data.pickup, lat: coords.lat, lng: coords.lng });
      else if (liveUserPosition) setSource({ name: i18n.t('current_location'), lat: liveUserPosition[0], lng: liveUserPosition[1] });
    } else if (liveUserPosition) {
      setSource({ name: i18n.t('current_location'), lat: liveUserPosition[0], lng: liveUserPosition[1] });
    }

    if (data.drop) {
      const coords = await geocodePlaceSmart(data.drop);
      if (coords) setDestination({ name: data.drop, lat: coords.lat, lng: coords.lng });
      else {
        toast({
          title: t('destination_not_found_title'),
          description: t('destination_not_found_desc', { place: data.drop }),
          variant: 'destructive',
        });
      }
    }

    if (data.audioData) {
      const audio = new Audio(`data:audio/mp3;base64,${data.audioData}`);
      audio.play().catch(() => { });
    }
    setInterimTranscript(data.message || `Detected: ${pickupLabel} to ${dropLabel || '(missing destination)'}`);
  };

  const processVoiceAudio = async (audioBase64: string, mimeType: string) => {
    setInterimTranscript(t('voice_processing'));
    try {
      const API_URL = getApiOrigin();
      const normalizedMime = (mimeType || 'audio/webm').split(';')[0].trim();
      const extension = normalizedMime.includes('ogg') ? 'ogg' : normalizedMime.includes('mp4') ? 'mp4' : 'webm';
      const requestBody = JSON.stringify({
        audioBase64,
        mimeType: normalizedMime,
        filename: `voice.${extension}`
      });

      // Backend runs in watch mode during development and can restart briefly.
      // Retry a few times to avoid failing voice flow on transient disconnects.
      let response: Response | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch(`${API_URL}/api/voice-booking/audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody
          });
          break;
        } catch (err) {
          lastError = err;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 700 * attempt));
          }
        }
      }

      if (!response) {
        throw lastError || new Error('Voice service unreachable');
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Voice service returned invalid response (${response.status})`);
      }
      if (!data.success) {
        setInterimTranscript(data.message || t('voice_processing_failed'));
        return;
      }
      await applyVoiceResult({ ...data, transcript: data.transcript || '' });
    } catch (error) {
      console.error('Voice audio processing error:', error);
      setInterimTranscript(t('voice_service_error'));
    }
  };

  const handleVoiceConfirm = () => {
    setShowVoiceOverlay(false);
    if (destination) {
      handleConfirmBooking();
    }
  };

  const calculateFare = (distKm: number) => {
    return Math.round(distKm * 15 + 20); // 20 base + 15 per km
  };

  const handleConfirmBooking = async (options?: { scheduledFor?: Date | null }) => {
    try {
      const user = getUser('passenger');
      if (!user?._id) throw new Error('Passenger session not found');

      const API_URL = getApiOrigin();

      if (!source || !destination) {
        toast({ title: t('error'), description: t('select_both_locations'), variant: "destructive" });
        setStep('location');
        return;
      }
      
      const pCoords = { lat: source.lat, lng: source.lng };
      const dCoords = { lat: destination.lat, lng: destination.lng };

      // Use routing machine distance if available, otherwise fallback to Haversine straight line
      let dist = routeStats?.distanceKm || 0;
      let durationStr = routeStats?.durationStr || '';
      let distanceStr = routeStats?.distanceStr || '';
      
      if (!dist) {
        // A* Pathfinding Distance Calculation Approximation fallback 
        // Generates a grid between the two points to approximate road travel length 
        // more accurately than a simple straight line (Haversine)
        
        type Node = { lat: number, lng: number, f: number, g: number, h: number, parent: Node | null };
        
        const heuristic = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
          // Haversine base heuristic for A*
          const R = 6371;
          const dLat = (p2.lat - p1.lat) * Math.PI / 180;
          const dLng = (p2.lng - p1.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        const calculateAStarDistance = (start: {lat: number, lng: number}, target: {lat: number, lng: number}) => {
          // Simplified grid abstraction for AStar
          const gridSize = 0.01; // Approx 1km grid steps
          let openList: Node[] = [];
          let closedList: Set<string> = new Set();
          
          let startNode: Node = { ...start, f: 0, g: 0, h: heuristic(start, target), parent: null };
          openList.push(startNode);
          
          const maxIterations = 500; // Prevent infinite loop on massive distances
          let iterations = 0;
          let bestNode = startNode;

          while (openList.length > 0 && iterations < maxIterations) {
            iterations++;
            
            // Get node with lowest f cost
            openList.sort((a, b) => a.f - b.f);
            let currentNode = openList.shift()!;
            
            // Check if we reached target (within a threshold)
            if (heuristic(currentNode, target) < gridSize * 2) {
              bestNode = currentNode;
              break;
            }
            
            closedList.add(`${currentNode.lat.toFixed(4)},${currentNode.lng.toFixed(4)}`);
            bestNode = currentNode; // Keep track of closest node if we hit max iterations
            
            // Generate 8 neighbor directions (Manhattan + Diagonal approximation)
            const directions = [
              { lat: gridSize, lng: 0 }, { lat: -gridSize, lng: 0 },
              { lat: 0, lng: gridSize }, { lat: 0, lng: -gridSize },
              { lat: gridSize, lng: gridSize }, { lat: gridSize, lng: -gridSize },
              { lat: -gridSize, lng: gridSize }, { lat: -gridSize, lng: -gridSize }
            ];
            
            for (let dir of directions) {
              let neighborLat = currentNode.lat + dir.lat;
              let neighborLng = currentNode.lng + dir.lng;
              let neighborKey = `${neighborLat.toFixed(4)},${neighborLng.toFixed(4)}`;
              
              if (closedList.has(neighborKey)) continue;
              
              // Add some artificial weight/obstacles (e.g. slight randomization to simulate non-straight roads)
              let movementCost = heuristic(currentNode, {lat: neighborLat, lng: neighborLng});
              // Simulate road curvature penalty (1.2 to 1.4x straight line)
              let roadPenalty = 1.2 + (Math.abs(Math.sin(neighborLat * 100)) * 0.2); 
              
              let g = currentNode.g + (movementCost * roadPenalty);
              let h = heuristic({lat: neighborLat, lng: neighborLng}, target);
              let f = g + h;
              
              let existingNode = openList.find(n => n.lat.toFixed(4) === neighborLat.toFixed(4) && n.lng.toFixed(4) === neighborLng.toFixed(4));
              
              if (!existingNode || g < existingNode.g) {
                if (!existingNode) {
                  openList.push({ lat: neighborLat, lng: neighborLng, f, g, h, parent: currentNode });
                } else {
                  existingNode.g = g;
                  existingNode.f = f;
                  existingNode.parent = currentNode;
                }
              }
            }
          }
          
          // Reconstruct distance from accumulated g-cost
          // If we hit max iterations, we add the remaining straight-line distance to the best node
          let totalDist = bestNode.g;
          let remainingDist = heuristic(bestNode, target);
          // Apply average road penalty to remaining distance
          return Math.max(0.5, totalDist + (remainingDist * 1.3)); 
        };

        dist = calculateAStarDistance(pCoords, dCoords);
        distanceStr = `${dist.toFixed(1)} km`;
        durationStr = `${Math.round(dist * 3 + 2)} min`;
      }

      const estFare = calculateFare(dist);

      // Build payload based on if it's a scheduled ride
      const requestPayload: any = {
        passengerId: user._id,
        pickupLocation: {
          address: source.name,
          coordinates: pCoords
        },
        dropoffLocation: {
          address: destination.name,
          coordinates: dCoords
        },
        // Multi-stop itinerary. The backend re-runs OSRM with these waypoints and
        // overrides the distance/duration/fare we send here, so it's safe to keep
        // our client-side estimates as-is.
        stops: placedStops.map((s) => ({
          address: s.name,
          coordinates: { lat: s.lat, lng: s.lng }
        })),
        fare: {
          estimated: estFare,
        },
        distance: {
          value: parseFloat(dist.toFixed(1)),
          text: distanceStr
        },
        duration: {
          value: parseInt(durationStr) || Math.round(dist * 3 + 2), 
          text: durationStr
        },
        isVoiceBooking: !!voiceTranscript || !!voicePickup || !!voiceDropoff,
        voiceTranscript: voiceTranscript || null
      };

      const effectiveScheduledFor = options?.scheduledFor ?? (isScheduled ? scheduledFor : null);
      const SCHEDULE_MIN_LEAD_MS = 5 * 60 * 1000;
      if (effectiveScheduledFor) {
        if (effectiveScheduledFor.getTime() < Date.now() + SCHEDULE_MIN_LEAD_MS) {
          toast({
            title: t('pickup_time_too_soon'),
            description: t('pickup_time_too_soon_desc'),
            variant: 'destructive',
          });
          return;
        }
        requestPayload.isScheduled = true;
        requestPayload.scheduledFor = effectiveScheduledFor.toISOString();
      } else {
        setStep('searching');
      }

      const response = await fetch(`${API_URL}/api/rides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('passenger')}`
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        let detail = 'Failed to create ride';
        try {
          const errBody = await response.json();
          if (errBody?.message && typeof errBody.message === 'string') detail = errBody.message;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const ride = await response.json();

      // If scheduled ride, show success directly without polling
      if (effectiveScheduledFor) {
        toast({
          title: t('ride_scheduled_title'),
          description: t('ride_scheduled_desc', { time: effectiveScheduledFor.toLocaleString() }),
        });
        setStep('location');
        setDestination(null);
        setStops([]);
        setIsScheduled(false);
        setScheduledFor(null);
      } else {
        setCurrentRideId(ride._id);
        // Lady-safety: track gender prefs + start countdown for "expand search" prompt.
        setCurrentRidePrefs({
          preferredDriverGender: ride.preferredDriverGender || 'any',
          genderFilterActive: ride.genderFilterActive !== false
        });
        setSearchStartedAt(Date.now());
        setShowExpandPrompt(false);
        // Start polling for driver acceptance
        startPolling(ride._id);
      }

    } catch (error) {
      console.error('Error booking ride:', error);
      setStep('location');
      toast({
        title: t('booking_failed_title'),
        description:
          error instanceof Error
            ? error.message
            : t('booking_generic_error'),
        variant: "destructive"
      });
    }
  };

  const handleCancelRide = async () => {
    if (!currentRideId) return;

    try {
      const API_URL = getApiOrigin();
      const response = await fetch(`${API_URL}/api/rides/${currentRideId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken('passenger')}`
        }
      });

      if (!response.ok) throw new Error('Failed to cancel ride');

      stopRideWaiting();

      toast({
        title: t('ride_cancelled_title'),
        description: t('ride_cancelled_desc')
      });

      // Reset state
      setStep('location');
      setCurrentRideId(null);
      setDestination(null);
      setStops([]);
      setCurrentRidePrefs(null);
      setSearchStartedAt(null);
      setShowExpandPrompt(false);
      // Keep source as it might still be relevant
    } catch (error) {
      console.error('Error cancelling ride:', error);
      toast({
        title: t('cancellation_failed_title'),
        description: t('cancellation_failed_desc'),
        variant: "destructive"
      });
    }
  };

  const handleLocationSelect = async (lat: number, lng: number) => {
    // India Bounding Box Check (Approximate)
    const isInsideIndia =
      lat >= 6.7460 && lat <= 37.0902 &&
      lng >= 68.1624 && lng <= 97.3956;

    if (!isInsideIndia) {
      toast({
        title: t('service_unavailable_title'),
        description: t('service_unavailable_india'),
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch(`${API_ORIGIN}/api/geocode/reverse?lat=${lat}&lon=${lng}`);
      const data = await res.json();
      
      let placeName = "Selected on Map";
      if (data && data.display_name) {
        const parts = data.display_name.split(',');
        const mainName = parts[0];
        const subName = data.address?.suburb || data.address?.city_district || data.address?.city || data.address?.town || data.address?.state_district || parts[1]?.trim() || '';
        placeName = subName ? `${mainName}, ${subName}` : mainName;
      }

      applyPickedLocation(placeName, lat, lng);
    } catch (e) {
      console.error('Reverse geocode error', e);
      applyPickedLocation('Selected on Map', lat, lng);
    }
    
    // Reset route stats when locations change
    setRouteStats(null);
    setIsMapOpen(false);
  };

  // Routes the picked location to pickup / dropoff / a specific itinerary stop slot.
  const applyPickedLocation = (placeName: string, lat: number, lng: number) => {
    if (typeof activeField === 'string' && activeField.startsWith('stop:')) {
      const stopId = activeField.slice('stop:'.length);
      setStops((prev) =>
        prev.map((s) => (s.id === stopId ? { ...s, name: placeName, lat, lng } : s))
      );
      return;
    }
    if (activeField === 'pickup') {
      setSource({ name: placeName, lat, lng });
    } else {
      setDestination({ name: placeName, lat, lng });
    }
  };

  // Fetch route-safety analysis whenever pickup + drop are both set on the location step.
  React.useEffect(() => {
    if (step !== 'location' || !source || !destination) {
      // Cancel any in-flight analysis if the user changes their mind.
      if (safetyAbortRef.current) {
        safetyAbortRef.current.abort();
        safetyAbortRef.current = null;
      }
      setSafetyRoutes([]);
      setSelectedRouteId(null);
      setRecommendedRouteId(null);
      setSafetyError(null);
      setSafetyLoading(false);
      return;
    }

    // Abort any prior request — locations changed.
    if (safetyAbortRef.current) safetyAbortRef.current.abort();
    const controller = new AbortController();
    safetyAbortRef.current = controller;

    setSafetyLoading(true);
    setSafetyError(null);

    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/safety/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            source: { lat: source.lat, lng: source.lng, name: source.name },
            destination: {
              lat: destination.lat,
              lng: destination.lng,
              name: destination.name
            },
            departAt: new Date().toISOString()
          })
        });
        if (!res.ok) throw new Error(`Safety API ${res.status}`);
        const data = await res.json();
        if (controller.signal.aborted) return;
        const incomingRoutes: AnalyzedRoute[] = Array.isArray(data?.routes) ? data.routes : [];
        setSafetyRoutes(incomingRoutes);
        setRecommendedRouteId(data?.recommendedId ?? null);
        const nextSelectedId =
          selectedRouteId && incomingRoutes.some((r) => r.id === selectedRouteId)
            ? selectedRouteId
            : data?.recommendedId ?? incomingRoutes[0]?.id ?? null;
        setSelectedRouteId(nextSelectedId);

        // Seed routeStats from the chosen route so the fare/ETA reflect the safety API result
        // immediately — we suppress the leaflet-routing-machine default in MapComponent now.
        const seed = incomingRoutes.find((r) => r.id === nextSelectedId);
        if (seed) {
          setRouteStats({
            distanceKm: seed.distanceKm,
            distanceStr: `${seed.distanceKm.toFixed(1)} km`,
            durationStr: `${seed.durationMin} min`
          });
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.warn('Route safety analysis failed:', err?.message || err);
        setSafetyError(err?.message || 'Safety check failed');
        setSafetyRoutes([]);
        setRecommendedRouteId(null);
        setSelectedRouteId(null);
      } finally {
        if (!controller.signal.aborted) setSafetyLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, source?.lat, source?.lng, destination?.lat, destination?.lng]);

  const handleSwitchSaferRoute = React.useCallback(
    (routeId: string) => {
      const target = safetyRoutes.find((r) => r.id === routeId);
      if (!target) return;
      setSelectedRouteId(routeId);
      // Sync routeStats so fare estimate reflects the chosen alternative.
      setRouteStats({
        distanceKm: target.distanceKm,
        distanceStr: `${target.distanceKm.toFixed(1)} km`,
        durationStr: `${target.durationMin} min`
      });
      toast({
        title: t('safer_route_switched_title', 'Switched to safer route'),
        description: t('safer_route_switched_desc', 'We updated the map and fare for this route.')
      });
    },
    [safetyRoutes, t]
  );

  const mapSafetyRoutes = React.useMemo(
    () =>
      safetyRoutes
        .filter((r) => Array.isArray(r.geometry) && r.geometry.length > 1)
        .map((r) => ({
          id: r.id,
          geometry: r.geometry,
          durationMin: r.durationMin,
          trafficScore: r.analysis?.dimensions?.traffic?.score ?? null,
          isSelected: r.id === selectedRouteId
        })),
    [safetyRoutes, selectedRouteId]
  );

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Use Nominatim API for search, restricted to India
      const response = await fetch(
        `${API_ORIGIN}/api/geocode/search?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchResultClick = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Boundary check
    const isInsideIndia =
      lat >= 6.7460 && lat <= 37.0902 &&
      lng >= 68.1624 && lng <= 97.3956;

    if (!isInsideIndia) {
      toast({
        title: t('service_unavailable_title'),
        description: t('service_unavailable_india'),
        variant: "destructive",
      });
      return;
    }

    const parts = result.display_name.split(',');
    const mainName = parts[0];
    const subName = parts[1]?.trim() || parts[2]?.trim() || '';
    const placeName = subName ? `${mainName}, ${subName}` : mainName;

    applyPickedLocation(placeName, lat, lng);

    // Reset route stats when active field changes
    setRouteStats(null);
    setIsMapOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // --- Multi-stop itinerary helpers ----------------------------------------
  // We keep these inside the component so they close over setStops + setActiveField.
  const addEmptyStop = () => {
    if (stops.length >= MAX_BOOKING_STOPS) {
      toast({
        title: t('max_stops_reached', 'Max stops reached'),
        description: t('max_stops_reached_desc', `You can add up to ${MAX_BOOKING_STOPS} stops.`),
      });
      return;
    }
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setStops((prev) => [...prev, { id, name: '', lat: 0, lng: 0 }]);
    setActiveField(`stop:${id}`);
    setSearchQuery('');
    setSearchResults([]);
    setIsMapOpen(true);
  };
  const removeStop = (id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
    setRouteStats(null); // force recompute via the multi-leg OSRM effect
  };
  const openStopPicker = (id: string) => {
    setActiveField(`stop:${id}`);
    setSearchQuery('');
    setSearchResults([]);
    setIsMapOpen(true);
  };
  const reorderStops = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setStops((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === fromId);
      const toIdx = prev.findIndex((s) => s.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setRouteStats(null);
  };
  // List of "valid" placed stops (skip the empty placeholder while user is picking).
  const placedStops = React.useMemo(
    () =>
      stops.filter(
        (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.lat !== 0 || s.lng !== 0) && s.name
      ),
    [stops]
  );

  // Recompute total distance / duration / fare across pickup -> stops -> dropoff
  // whenever the itinerary changes. Uses the public OSRM demo server — same as backend.
  React.useEffect(() => {
    if (step !== 'location' || !source || !destination) return;
    if (placedStops.length === 0) return; // SafetyCard's seed routeStats already covers the simple case.
    const controller = new AbortController();
    (async () => {
      try {
        const coords = [
          { lat: source.lat, lng: source.lng },
          ...placedStops.map((s) => ({ lat: s.lat, lng: s.lng })),
          { lat: destination.lat, lng: destination.lng }
        ];
        const coordStr = coords.map((p) => `${p.lng},${p.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false&alternatives=false&steps=false`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) return;
        const r = data.routes[0];
        const distKm = Math.round((r.distance / 1000) * 100) / 100;
        const durMin = Math.max(1, Math.round(r.duration / 60));
        setRouteStats({
          distanceKm: distKm,
          distanceStr: `${distKm.toFixed(1)} km`,
          durationStr: `${durMin} min`
        });
      } catch (err: any) {
        if (controller.signal.aborted) return;
        console.warn('Itinerary OSRM recompute failed:', err?.message || err);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, source?.lat, source?.lng, destination?.lat, destination?.lng, placedStops]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg font-bold text-foreground">{t('finding_ride')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className={`${(isMapExpanded || isMapOpen || showVoiceOverlay) ? 'hidden' : 'block'}`}>
        <Header title={t('book_auto')} showMenu={true} />
      </div>

      {/* Main Map section - Hidden when location picker is open */}
      {!isMapOpen && (
        <div
          className={`transition-all duration-500 ease-in-out ${isMapExpanded
            ? 'fixed inset-0 z-50 h-screen w-screen bg-background'
            : 'w-full px-4 mt-2 h-[40vh] flex-shrink-0'
            }`}
        >
          <div
            className={`w-full h-full relative cursor-pointer ${!isMapExpanded ? 'rounded-2xl overflow-hidden shadow-md border border-border/50' : ''}`}
            onClick={() => !isMapExpanded && setIsMapExpanded(true)}
          >
            <MapComponent
              height="100%"
              className="w-full h-full"
              centerPosition={liveUserPosition}
              pickupPosition={source ? [source.lat, source.lng] : null}
              dropoffPosition={destination ? [destination.lat, destination.lng] : null}
              pickupName={source?.name}
              dropoffName={destination?.name}
              userPosition={liveUserPosition}
              safetyRoutes={placedStops.length === 0 ? mapSafetyRoutes : undefined}
              onSelectRoute={handleSwitchSaferRoute}
              stops={placedStops.map((s) => ({
                address: s.name,
                coordinates: { lat: s.lat, lng: s.lng },
                status: 'pending' as const,
                source: 'booking' as const
              }))}
              onRouteCalculated={(distStr, timeStr, distKm) => {
                setRouteStats({ distanceStr: distStr, durationStr: timeStr, distanceKm: distKm });
              }}
            />
          </div>

          {/* Expand/Collapse UI */}
          {isMapExpanded && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-6 right-6 z-[1000] shadow-[0_4px_20px_rgba(0,0,0,0.3)] rounded-full px-4 h-10 bg-background text-foreground border border-border hover:bg-muted font-bold"
              onClick={(e) => {
                e.stopPropagation();
                setIsMapExpanded(false);
              }}
            >
              Minimize Map
            </Button>
          )}

        </div>
      )}

      {/* Full-Screen Location Picker Overlay */}
      {isMapOpen && (
        <div className="fixed inset-0 z-[2000] bg-background flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="absolute top-6 left-6 right-6 z-[2010] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="bg-background/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-border">
                <p className="text-sm font-bold text-foreground">
                  {typeof activeField === 'string' && activeField.startsWith('stop:')
                    ? (() => {
                        const sid = activeField.slice('stop:'.length);
                        const idx = stops.findIndex((s) => s.id === sid);
                        return t('stop_n', { n: idx >= 0 ? idx + 1 : stops.length, defaultValue: `Stop ${idx >= 0 ? idx + 1 : stops.length}` });
                      })()
                    : t(activeField)}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full px-6 shadow-[0_4px_15px_rgba(239,68,68,0.4)] h-10 font-bold"
                onClick={() => {
                  // If we're picking a brand-new (empty) stop and the user cancels,
                  // remove the placeholder so the row doesn't dangle empty.
                  if (typeof activeField === 'string' && activeField.startsWith('stop:')) {
                    const sid = activeField.slice('stop:'.length);
                    setStops((prev) =>
                      prev.filter((s) => !(s.id === sid && (!s.name || (s.lat === 0 && s.lng === 0))))
                    );
                  }
                  setIsMapOpen(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                {t('cancel')}
              </Button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder={t('detecting')}
                className="w-full h-12 pl-4 pr-12 bg-background/95 backdrop-blur-md rounded-2xl shadow-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="bg-background/95 backdrop-blur-md rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[40vh] overflow-y-auto animate-in slide-in-from-top-2">
                {searchResults.map((result, idx) => (
                  <button
                    key={idx}
                    className="w-full text-left p-4 hover:bg-muted transition-colors border-b border-border last:border-0"
                    onClick={() => handleSearchResultClick(result)}
                  >
                    <p className="text-sm font-bold text-foreground truncate">{result.display_name.split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.display_name.split(',').slice(1).join(',').trim()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1">
            <MapComponent
              onLocationSelect={handleLocationSelect}
              height="100%"
              userPosition={liveUserPosition}
              centerPosition={liveUserPosition}
            />
          </div>

          {!searchResults.length && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[2010] w-full px-10 max-w-xs">
              <div className="bg-background/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-border text-center">
                <p className="text-sm font-bold text-foreground">{t('tap_map_search')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('select_exact_location')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom sheet UI */}
      <div className={`bg-background rounded-t-3xl relative z-10 shadow-elevated transition-all duration-500 flex-1 overflow-y-auto ${(isMapExpanded || isMapOpen || showVoiceOverlay) ? 'translate-y-full opacity-0 pointer-events-none absolute inset-x-0' : 'translate-y-0 opacity-100 mt-4'
        }`}>
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mt-3 mb-6 flex-shrink-0" />

        <div className="px-4 pb-24 space-y-4">
          {step === 'location' && (
            <>
              {/* Welcome message */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <AutoRickshaw className="text-primary" size={28} />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{t('app_name')}</p>
                  <p className="text-sm text-muted-foreground">{t('book_auto')}</p>
                </div>
              </div>

              {/* Location inputs */}
              <div className="space-y-3">
                <LocationInput
                  type="pickup"
                  value={source?.name || ''}
                  placeholder={t('pickup')}
                  onClick={() => {
                    setActiveField('pickup');
                    setIsMapOpen(true);
                  }}
                />

                <LocationInput
                  type="dropoff"
                  value={destination?.name || ''}
                  placeholder={t('dropoff')}
                  onClick={() => {
                    setActiveField('dropoff');
                    setIsMapOpen(true);
                  }}
                  onVoiceClick={() => handleVoiceInput()}
                  isActive={!destination}
                />
              </div>

              {/* Multi-stop itinerary: numbered, reorderable rows + Add stop button.
                  Glassmorphism on a brand-primary tint per the design system. */}
              <div className="space-y-2">
                {stops.length > 0 && (
                  <div className="space-y-2">
                    {stops.map((stop, idx) => {
                      const isPlaced = !!stop.name && (stop.lat !== 0 || stop.lng !== 0);
                      return (
                        <div
                          key={stop.id}
                          draggable={isPlaced}
                          onDragStart={(e) => {
                            setDraggingStopId(stop.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingStopId) reorderStops(draggingStopId, stop.id);
                            setDraggingStopId(null);
                          }}
                          onDragEnd={() => setDraggingStopId(null)}
                          className={`group flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md px-3 py-2.5 transition-colors ${
                            draggingStopId === stop.id ? 'opacity-50' : 'hover:bg-primary/10'
                          }`}
                        >
                          <button
                            type="button"
                            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
                            aria-label={t('reorder_stops_hint', 'Drag to reorder')}
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground font-black text-xs flex items-center justify-center">
                            {idx + 1}
                          </div>
                          <button
                            type="button"
                            onClick={() => openStopPicker(stop.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            {isPlaced ? (
                              <p className="text-sm font-semibold text-foreground truncate">
                                {stop.name}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground italic truncate">
                                {t('select_stop_location', 'Select stop location')}
                              </p>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStop(stop.id)}
                            aria-label={t('remove_stop', 'Remove stop')}
                            className="flex-shrink-0 w-7 h-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addEmptyStop}
                  disabled={stops.length >= MAX_BOOKING_STOPS}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 backdrop-blur-md px-4 py-3 text-sm font-semibold text-foreground hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span>
                    {stops.length === 0
                      ? t('add_stop', 'Add stop')
                      : t('add_another_stop', 'Add another stop')}
                  </span>
                  {stops.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {stops.length}/{MAX_BOOKING_STOPS}
                    </span>
                  )}
                </button>
              </div>

              {/* Quick destinations */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t('recent_places')}</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {(
                    [
                      { geocode: 'Home', labelKey: 'quick_place_home' },
                      { geocode: 'Office', labelKey: 'quick_place_office' },
                      { geocode: 'Market', labelKey: 'quick_place_market' },
                      { geocode: 'School', labelKey: 'quick_place_school' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.geocode}
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            `${API_ORIGIN}/api/geocode/search?q=${encodeURIComponent(item.geocode)}&limit=1`
                          );
                          const d = await res.json();
                          if (d && d[0]) {
                            setDestination({
                              name: t(item.labelKey),
                              lat: parseFloat(d[0].lat),
                              lng: parseFloat(d[0].lon),
                            });
                            setRouteStats(null);
                          }
                        } catch (e) {}
                      }}
                      className="flex-shrink-0 px-4 py-2.5 bg-muted rounded-xl text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fare Calculation Display */}
              {routeStats && source && destination && (
                <div className="bg-muted p-4 rounded-xl flex items-center justify-between shadow-sm border border-border/50 animate-in fade-in slide-in-from-bottom-2">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{t('estimated_fare')}</p>
                    <p className="text-2xl font-black text-foreground">₹{calculateFare(routeStats.distanceKm)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{routeStats.durationStr}</p>
                    <p className="text-xs text-muted-foreground">{routeStats.distanceStr}</p>
                  </div>
                </div>
              )}

              {/* Route safety (Gemini-scored alternatives) */}
              {source && destination && (safetyLoading || safetyRoutes.length > 0 || safetyError) && (
                <div className="animate-in fade-in slide-in-from-bottom-2">
                  <SafetyCard
                    loading={safetyLoading}
                    error={safetyError}
                    routes={safetyRoutes}
                    selectedRouteId={selectedRouteId}
                    recommendedId={recommendedRouteId}
                    onSwitchRoute={handleSwitchSaferRoute}
                  />
                </div>
              )}

              {/* Voice booking button */}
              <Button
                variant="touchSecondary"
                className="w-full"
                onClick={() => handleVoiceInput()}
              >
                <Mic className="w-5 h-5 text-primary" />
                <span>{t('book_with_voice')}</span>
              </Button>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="w-1/2 bg-transparent/10"
                  disabled={!destination || !source}
                  onClick={() => {
                    setScheduledFor((prev) => prev ?? getDefaultScheduleTime());
                    setShowSchedulePicker(true);
                  }}
                >
                  {t('schedule_later')}
                </Button>
                <Button
                  variant="touch"
                  className="w-1/2 flex-1"
                  disabled={!destination || !source}
                  onClick={() => {
                    if (destination && source) {
                      setIsScheduled(false);
                      setScheduledFor(null);
                      handleConfirmBooking();
                    }
                  }}
                >
                  <span>{t('look_for_ride')}</span>
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </div>

              {/* Schedule Date/Time Picker Modal */}
              {showSchedulePicker && (
                <div className="fixed inset-0 z-[4000] bg-black/50 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
                  <div className="bg-background w-full rounded-t-3xl p-6 shadow-2xl pb-10 transform transition-transform slide-in-from-bottom-full duration-300">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold">{t('schedule_ride')}</h3>
                      <Button variant="ghost" size="icon" onClick={() => setShowSchedulePicker(false)}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </Button>
                    </div>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">{t('select_time')}</label>
                        <input 
                          type="datetime-local" 
                          className="w-full h-14 px-4 bg-muted rounded-xl border-none focus:ring-2 focus:ring-primary text-lg"
                          value={scheduledFor ? toDatetimeLocalValue(scheduledFor) : toDatetimeLocalValue(getDefaultScheduleTime())}
                          min={toDatetimeLocalValue(new Date(Date.now() + 5 * 60 * 1000))}
                          onChange={(e) => {
                            if (e.target.value) {
                              setScheduledFor(new Date(e.target.value));
                            }
                          }}
                        />
                      </div>
                      
                      <Button 
                        className="w-full h-14 text-lg font-bold"
                        onClick={() => {
                          const finalScheduledFor = scheduledFor ?? getDefaultScheduleTime();
                          const minAt = Date.now() + 5 * 60 * 1000;
                          if (!finalScheduledFor || finalScheduledFor.getTime() < minAt) {
                            toast({
                              title: t('invalid_time_title'),
                              description: t('invalid_time_desc'),
                              variant: 'destructive',
                            });
                            return;
                          }
                          setIsScheduled(true);
                          setShowSchedulePicker(false);
                          handleConfirmBooking({ scheduledFor: finalScheduledFor });
                        }}
                      >
                        {t('confirm_scheduled_ride')}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'confirm' && (
            <>
              <FareEstimate
                fare={85}
                distance="3.2 km"
                duration="12 min"
                isTrustedDriver={true}
              />

              <Button
                variant="touch"
                className="w-full"
                onClick={handleConfirmBooking}
              >
                <span>{t('book_auto')}</span>
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setStep('location')}
              >
                {t('change_destination')}
              </Button>
            </>
          )}

          {step === 'searching' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center animate-pulse-gentle">
                <AutoRickshaw className="text-primary" size={48} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {currentRidePrefs?.genderFilterActive && currentRidePrefs.preferredDriverGender === 'female'
                    ? t('searching_female_driver', 'Searching for a female driver')
                    : currentRidePrefs?.genderFilterActive && currentRidePrefs.preferredDriverGender === 'male'
                      ? t('searching_male_driver', 'Searching for a male driver')
                      : t('finding_your_auto')}
                </p>
                <p className="text-muted-foreground mt-1">{t('waiting_driver_accept')}</p>
              </div>

              {waitingFareMeta && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md px-5 py-4 text-left shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('estimated_fare')}
                  </p>
                  <p className="text-3xl font-black text-foreground mt-1">₹{waitingFareMeta.fare}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {waitingFareMeta.distanceStr}
                    <span className="mx-2 text-border">·</span>
                    {waitingFareMeta.durationStr}
                  </p>
                </div>
              )}

              {showExpandPrompt && currentRidePrefs?.genderFilterActive && (
                autoPromoted ? (
                  // After 30s: prominent banner — the "expand search" action is now front-and-center.
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-xl px-5 py-4 text-left shadow-sm animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-sm font-bold text-foreground">
                      {t('expand_search_title', 'Still searching')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t(
                        'expand_search_desc',
                        'No matching driver online right now. Expand search to any nearby driver?'
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Button
                        variant="touch"
                        className="rounded-xl h-11 text-sm"
                        disabled={expanding}
                        onClick={handleExpandSearch}
                      >
                        {expanding ? t('please_wait') : t('expand_search_yes', 'Expand search')}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-xl h-11 text-sm border-border/60 bg-background/40 backdrop-blur-md"
                        onClick={() => setShowExpandPrompt(false)}
                      >
                        {t('expand_search_no', 'Keep waiting')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Immediate compact pill — always visible so users can manually broaden any time.
                  <button
                    type="button"
                    disabled={expanding}
                    onClick={handleExpandSearch}
                    className="w-full rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md px-4 py-3 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
                  >
                    <p className="text-xs font-semibold text-foreground">
                      {currentRidePrefs.preferredDriverGender === 'female'
                        ? t('searching_female_driver', 'Searching for a female driver')
                        : t('searching_male_driver', 'Searching for a male driver')}
                    </p>
                    <p className="text-xs text-primary font-semibold mt-1">
                      {expanding
                        ? t('please_wait')
                        : t('expand_search_yes', 'Expand search')}
                    </p>
                  </button>
                )
              )}

              <div className="pt-4">
                <Button
                  variant="outline"
                  className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-bold rounded-2xl h-14"
                  onClick={handleCancelRide}
                >
                  {t('cancel_ride')}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Full-Screen Voice Booking Interface */}
      {showVoiceOverlay && (
        <div className="fixed inset-0 z-[3000] bg-background flex flex-col animate-in fade-in duration-300">
          <div className="absolute top-10 w-full text-center">
            <h2 className="text-2xl font-bold text-foreground">{t('voice_booking')}</h2>
            <p className="text-muted-foreground mt-2">
              {isListening ? t('voice_listening_subtitle') : t('voice_booking_subtitle')}
            </p>
          </div>

          <div className="relative flex flex-col items-center justify-center h-64 gap-6 mt-24 flex-shrink-0">
            <div className="relative flex items-center justify-center">
              {isListening && (
                <>
                  {/* Visualizer effect */}
                  <div className="absolute w-64 h-64 bg-primary/10 rounded-full animate-ping duration-1000" />
                  <div className="absolute w-48 h-48 bg-primary/20 rounded-full animate-pulse" />
                </>
              )}

              <div className={`relative w-32 h-32 ${isListening ? 'bg-primary' : 'bg-muted'} rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(255,215,0,0.5)] transition-colors duration-500`}>
                <Mic className={`w-16 h-16 ${isListening ? 'text-primary-foreground animate-bounce' : 'text-muted-foreground'}`} />
              </div>
            </div>

            {isListening && (
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-destructive rounded-full" />
                <span className="text-xs font-bold text-destructive uppercase tracking-widest">{t('recording')}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="mt-6 mx-auto text-center max-w-lg min-h-[10rem] flex flex-col justify-center gap-4">
              <div className="bg-muted/50 p-6 rounded-3xl border border-border/50">
                <p className="text-xl font-medium text-foreground leading-tight italic">
                  {interimTranscript || t('speak_now')}
                </p>
              </div>

              {sttTranscriptDisplay && (
                <div className="bg-card/60 p-4 rounded-2xl border border-border/50 text-left">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                    {t('transcribed')}
                  </p>
                  <p className="text-base font-semibold text-foreground leading-relaxed break-words">
                    {sttTranscriptDisplay}
                  </p>
                </div>
              )}

              {(voicePickup || voiceDropoff) && (
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex flex-col gap-2 animate-in slide-in-from-bottom-2">
                  {voicePickup && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider min-w-[50px] text-left">{t('from')}:</span>
                      <span className="text-sm font-bold text-foreground">{voicePickup}</span>
                    </div>
                  )}
                  {voiceDropoff && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider min-w-[50px] text-left">{t('to')}:</span>
                      <span className="text-sm font-bold text-foreground">{voiceDropoff}</span>
                    </div>
                  )}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                {t('ai_detection_active')}
              </p>
            </div>
          </div>

          <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border/40 px-6 pt-4 pb-6 flex flex-col items-center gap-3">
            {voiceDropoff && !isListening && (
              <Button
                variant="touch"
                size="lg"
                className="w-full max-w-sm rounded-full h-14 text-lg font-bold shadow-2xl animate-in zoom-in duration-300"
                onClick={handleVoiceConfirm}
              >
                {t('confirm_booking')}
              </Button>
            )}

            <Button
              variant={isListening ? "destructive" : "outline"}
              size="lg"
              className={`w-full max-w-sm rounded-full h-12 font-bold ${!isListening ? 'text-muted-foreground' : ''}`}
              onClick={isListening ? stopAudioRecording : () => setShowVoiceOverlay(false)}
            >
              {isListening ? t('stop_recording') : t('close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerHome;
