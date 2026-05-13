import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, ChevronRight } from 'lucide-react';

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

  // Map Popup State
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [activeField, setActiveField] = useState<'pickup' | 'dropoff'>('pickup');
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
    // Fetch + watch current user location (live)
    let watchId: number | null = null;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos: [number, number] = [position.coords.latitude, position.coords.longitude];
          setLiveUserPosition(pos);
          setGeoAccuracyM(position.coords.accuracy);
          // Helpful when debugging "wrong city" reports
          console.log('[geo] currentPosition', { pos, accuracyM: position.coords.accuracy });
          // Only auto-fill pickup if user hasn't picked a custom pickup yet
          setSource((prev) => prev ?? { name: i18n.t('current_location'), lat: pos[0], lng: pos[1] });

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
          // Fallback to Kerala default if geolocation fails or is denied
          setLiveUserPosition([9.9312, 76.2673]);
          setSource((prev) => prev ?? { name: 'Kochi, Kerala', lat: 9.9312, lng: 76.2673 });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
        // Ensure we don't reuse a stale cached fix
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } else {
      // Fallback immediately if geolocation is unavailable
      setLiveUserPosition([9.9312, 76.2673]);
      setSource((prev) => prev ?? { name: 'Kochi, Kerala', lat: 9.9312, lng: 76.2673 });
    }

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
        const rideRes = await fetch(`${API_URL}/api/rides/${rideId}`);
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

      const join = () => socket.emit('join_ride', rideId);
      socket.on('connect', join);
      if (socket.connected) join();

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
        setIsScheduled(false);
        setScheduledFor(null);
      } else {
        setCurrentRideId(ride._id);
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

      if (activeField === 'pickup') {
        setSource({ name: placeName, lat, lng });
      } else {
        setDestination({ name: placeName, lat, lng });
      }
    } catch (e) {
      console.error('Reverse geocode error', e);
      const fallbackName = "Selected on Map";
      if (activeField === 'pickup') {
        setSource({ name: fallbackName, lat, lng });
      } else {
        setDestination({ name: fallbackName, lat, lng });
      }
    }
    
    // Reset route stats when locations change
    setRouteStats(null);
    setIsMapOpen(false);
  };

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

    if (activeField === 'pickup') {
      setSource({ name: placeName, lat, lng });
    } else {
      setDestination({ name: placeName, lat, lng });
    }
    
    // Reset route stats when active field changes
    setRouteStats(null);
    setIsMapOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

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
                  {t(activeField)}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full px-6 shadow-[0_4px_15px_rgba(239,68,68,0.4)] h-10 font-bold"
                onClick={() => {
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
                <p className="text-xl font-bold text-foreground">{t('finding_your_auto')}</p>
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
