import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, RotateCw, Loader2, Settings, Check, Cast } from 'lucide-react';
import { isFullscreenActive, isVideoFullscreen, onFullscreenChange, requestFs, exitFs, lockLandscape } from '@/lib/fullscreen';
import LiveWatermark from '@/components/LiveWatermark';
import { castMedia, isGoogleCastCapable, requestWakeLock, showNativePicker, stopCastSession } from '@/lib/cast';
import { readUnlockPayload, requestCastUrl } from '@/lib/tvSession';
import TvConnectDialog from '@/components/TvConnectDialog';


interface Props {
  src: string;
  title: string;
  watermark?: string;
  onFatalError?: () => void;
  /** Dipanggil saat server menolak kunci (401/403) — minta kunci baru tanpa ganti server. */
  onAuthError?: () => void;
  onPipChange?: (active: boolean) => void;
  hideSeekButtons?: boolean;
  /** Optional custom HTTP headers attached to ALL HLS requests (manifest + segments). */
  headers?: Record<string, string>;
  /** Optional overlay rendered inside the player container (visible in fullscreen too). */
  overlay?: React.ReactNode;
  /** Show aktif yang dipakai untuk pairing TV dan pemilihan payload akses. */
  showId?: string;
  /** Payload replay tervalidasi untuk pairing browser TV. */
  replayTvPayload?: Record<string, unknown> | null;
  /** DVR: simpan seluruh potongan live agar penonton bebas mundur (khusus Server 3). */
  dvr?: boolean;
}

export interface HlsPlayerHandle {
  requestPip: () => Promise<void>;
  exitPip: () => Promise<void>;
  isPipSupported: () => boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface QualityLevel {
  index: number;
  label: string;
  height?: number;
  bitrate?: number;
}

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(({ src, title, watermark, onFatalError, onAuthError, onPipChange, hideSeekButtons = false, headers, overlay, showId = '', replayTvPayload = null, dvr = false }, ref) => {
  const dvrRef = useRef(dvr);
  dvrRef.current = dvr;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const loadingRef = useRef(true);
  const isLiveRef = useRef(false);
  const stallWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressRef = useRef({ time: 0, checkedAt: Date.now(), recoveries: 0 });
  const lastBufferingStateRef = useRef(false);
  const onFatalErrorRef = useRef(onFatalError);
  const onAuthErrorRef = useRef(onAuthError);
  const authErrorsRef = useRef(0);
  const initialLiveEdgeSyncRef = useRef(false);
  const headersRef = useRef<Record<string, string> | undefined>(headers);
  const abrGuardRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abrStateRef = useRef({ healthySince: 0, capIndex: -1, lastAdjust: 0 });
  const wakeLockRef = useRef<{ release: () => void } | null>(null);


  const initialVolume = (() => { try { const v = parseFloat(localStorage.getItem('replaytime-volume') || ''); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } })();
  // Default unmuted; one-time per session, clear stale persisted mute so user starts with sound on.
  const initialMuted = (() => {
    try {
      if (!sessionStorage.getItem('replaytime-mute-reset')) {
        localStorage.removeItem('replaytime-muted');
        sessionStorage.setItem('replaytime-mute-reset', '1');
        return false;
      }
      return localStorage.getItem('replaytime-muted') === '1';
    } catch { return false; }
  })();
  const initialVolumeRef = useRef(initialVolume);
  const initialMutedRef = useRef(initialMuted);
  const savedQualityHeight = (() => { try { const v = parseInt(localStorage.getItem('replaytime-quality-height') || '', 10); return isFinite(v) ? v : null; } catch { return null; } })();
  const userQualityRef = useRef<number | null>(savedQualityHeight);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Rentang yang benar-benar bisa di-seek (dipakai untuk VOD maupun DVR live).
  const [seekRange, setSeekRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [volume, setVolume] = useState(initialVolume);
  const [muted, setMuted] = useState(initialMuted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true); // initial connect
  const [buffering, setBuffering] = useState(false); // mid-play stall
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [autoActiveLabel, setAutoActiveLabel] = useState<string>('');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [castSupported, setCastSupported] = useState(false);
  const [castAvailable, setCastAvailable] = useState(false);
  const [casting, setCasting] = useState(false);
  const [castPreparing, setCastPreparing] = useState(false);
  const [castError, setCastError] = useState('');
  const [tvMode, setTvMode] = useState(false);
  const [showTvMenu, setShowTvMenu] = useState(false);
  const [showTvConnect, setShowTvConnect] = useState(false);
  const [tvConnectTab, setTvConnectTab] = useState<'code' | 'mirror'>('code');
  const [netStats, setNetStats] = useState<{ kbps: number; buffer: number; recommendedHeight: number | null } | null>(null);


  // Expose PiP API to parent
  useImperativeHandle(ref, () => ({
    requestPip: async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (document.pictureInPictureElement === video) return;
        await video.requestPictureInPicture();
      } catch (e) { /* ignore */ }
    },
    exitPip: async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
      } catch (e) { /* ignore */ }
    },
    isPipSupported: () => {
      return typeof document !== 'undefined' && !!document.pictureInPictureEnabled;
    },
  }), []);

  // PiP enter/leave events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => onPipChange?.(true);
    const onLeave = () => onPipChange?.(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [onPipChange]);

  // Deteksi dukungan AirPlay / Remote Playback (Cast) untuk TV / proyektor.
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
      remote?: { watchAvailability?: (cb: (avail: boolean) => void) => Promise<number>; cancelWatchAvailability?: (id: number) => Promise<void>; prompt?: () => Promise<void> };
    }) | null;
    if (!video) return;
    const hasAirplay = typeof video.webkitShowPlaybackTargetPicker === 'function'
      || (typeof (window as any).WebKitPlaybackTargetAvailabilityEvent !== 'undefined');
    const hasRemote = !!video.remote && typeof video.remote.prompt === 'function';
    const googleCast = isGoogleCastCapable();
    setCastSupported(hasAirplay || hasRemote || googleCast);
    if (googleCast) setCastAvailable(true);
    let watchId: number | null = null;
    const onAirplayAvail = (e: Event & { availability?: string }) => {
      setCastAvailable(e.availability === 'available');
    };
    if (hasAirplay) {
      try { video.addEventListener('webkitplaybacktargetavailabilitychanged', onAirplayAvail as EventListener); } catch { /* ignore */ }
      setCastAvailable(true); // tampilkan tombol; iOS akan menampilkan picker walau availability belum diketahui
    }
    if (hasRemote && video.remote?.watchAvailability) {
      video.remote.watchAvailability((avail) => setCastAvailable(!!avail))
        .then((id) => { watchId = id; })
        .catch(() => { setCastAvailable(true); });
    }
    return () => {
      if (hasAirplay) {
        try { video.removeEventListener('webkitplaybacktargetavailabilitychanged', onAirplayAvail as EventListener); } catch { /* ignore */ }
      }
      if (hasRemote && watchId != null && video.remote?.cancelWatchAvailability) {
        try { video.remote.cancelWatchAvailability(watchId); } catch { /* ignore */ }
      }
    };
  }, [src]);

  const srcRef = useRef(src);
  useEffect(() => { srcRef.current = src; }, [src]);

  const showCastPicker = useCallback(async () => {
    // Sumber IDN/Hanabira butuh header khusus (x-api-token, x-showid, dll) yang
    // tidak bisa dikirim Chromecast. Untuk itu kita minta alamat sementara ke
    // server (proxy bertanda tangan) supaya TV cukup membuka URL biasa.
    // Alamat ini memakai sesi yang sama, jadi token tidak perlu direset.
    const headerGated = !!headersRef.current && Object.keys(headersRef.current).length > 0;
    setCastError('');
    if (isGoogleCastCapable()) {
      let url = srcRef.current;
      if (headerGated) {
        setCastPreparing(true);
        try {
          const payload = readUnlockPayload(showId);
          url = await requestCastUrl(typeof payload?.grant === 'string' ? payload.grant : '');
        } finally {
          setCastPreparing(false);
        }
        if (!url) {
          setCastError('Alamat TV tidak dapat dibuat. Buat Kode untuk TV, atau gunakan Siarkan layar HP.');
          setShowTvMenu(true);
          return;
        }
      }
      if (url) {
        const ok = await castMedia({
          url,
          title,
          contentType: 'application/x-mpegURL',
          isLive: isLiveRef.current,
        });
        if (ok) {
          setCasting(true);
          try { videoRef.current?.pause(); } catch { /* ignore */ }
          return;
        }
        setCastError('Perangkat Cast tidak ditemukan. Pastikan HP dan TV memakai WiFi yang sama.');
        setShowTvMenu(true);
        return;
      }
    }
    // 2) AirPlay / Remote Playback bawaan browser.
    if (!showNativePicker(videoRef.current)) {
      setCastError('Browser ini tidak mendukung koneksi langsung. Gunakan Kode untuk TV atau Siarkan layar HP.');
      setShowTvMenu(true);
    }
  }, [showId, title]);

  const stopCasting = useCallback(() => {
    stopCastSession();
    setCasting(false);
    try { void videoRef.current?.play(); } catch { /* ignore */ }
  }, []);

  const copyTvLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch { /* ignore */ }
  }, []);

  // Mode TV: layar penuh + layar tidak boleh mati.
  useEffect(() => {
    if (!tvMode) {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }
    let cancelled = false;
    void requestWakeLock().then((lock) => {
      if (cancelled) { lock?.release(); return; }
      wakeLockRef.current = lock;
    });
    const onVis = () => {
      if (document.visibilityState === 'visible' && tvMode && !wakeLockRef.current) {
        void requestWakeLock().then((lock) => { wakeLockRef.current = lock; });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [tvMode]);



  useEffect(() => {
    onFatalErrorRef.current = onFatalError;
    onAuthErrorRef.current = onAuthError;
  }, [onFatalError, onAuthError]);

  useEffect(() => {
    headersRef.current = headers;
    // Kunci baru diterima → beri jatah percobaan ulang lagi.
    authErrorsRef.current = 0;
  }, [headers]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const setBufferingState = useCallback((next: boolean) => {
    if (lastBufferingStateRef.current === next) return;
    lastBufferingStateRef.current = next;
    setBuffering(next);
  }, []);

  // Penjaga awal: kalau video tidak pernah mulai jalan dalam 18 detik
  // (mis. server IDN menggantung tanpa error), pindah ke server lain.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let done = false;
    const ok = () => { done = true; };
    video.addEventListener('playing', ok);
    video.addEventListener('loadeddata', ok);
    // Worker lambat (~4 detik per permintaan) butuh waktu lebih lama untuk
    // potongan pertama. Hanya pindah server bila BELUM ADA data video sama
    // sekali — video yang sudah termuat tapi tertahan autoplay bukan gagal.
    const t = setTimeout(() => {
      if (done || video.currentTime > 0.5 || video.readyState >= 2 || video.buffered.length > 0) return;
      onFatalErrorRef.current?.();
    }, 35_000);
    return () => { clearTimeout(t); video.removeEventListener('playing', ok); video.removeEventListener('loadeddata', ok); };
  }, [src]);

  // Setup HLS with optimized config
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setLoading(true);
    setBufferingState(false);
    setError(null);
    setQualities([]);
    setCurrentQuality(-1);
    setAutoActiveLabel('');
    setIsLiveStream(false);
    recoveryAttemptsRef.current = 0;
    isLiveRef.current = false;
    initialLiveEdgeSyncRef.current = false;
    lastProgressRef.current = { time: 0, checkedAt: Date.now(), recoveries: 0 };
    if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
    let hls: Hls | null = null;
    let nativeLoadedHandler: (() => void) | null = null;
    let nativeErrorHandler: (() => void) | null = null;

    video.preload = 'auto';
    video.autoplay = true;
    video.volume = initialVolumeRef.current;
    video.muted = initialMutedRef.current;
    video.setAttribute('playsinline', 'true');
    // Aktifkan AirPlay / Cast bawaan browser supaya bisa dilempar ke TV / proyektor.
    try { (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = false; } catch { /* ignore */ }
    try { video.setAttribute('x-webkit-airplay', 'allow'); } catch { /* ignore */ }

    const safePlay = () => {
      try {
        // Try unmuted first if user prefers sound
        const tryPlay = video.play();
        if (tryPlay && typeof tryPlay.catch === 'function') {
          tryPlay.catch(() => {
            // Browser blocked autoplay with sound; fallback muted
            video.muted = true;
            setMuted(true);
            setNeedsUnmute(true);
            // Do NOT persist forced mute — keep user's preference intact
            video.play().catch(() => {});
          });
        }
      } catch { /* ignore */ }
    };

    const resumePosition = () => {
      const current = video.currentTime;
      return Number.isFinite(current) && current > 0 ? current : -1;
    };

    // Network/device profile: weak connections should prefer stability over ultra-low latency.
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } }).connection;
    const effective = conn?.effectiveType || '';
    const downlink = typeof conn?.downlink === 'number' ? conn.downlink : 99;
    const saveData = conn?.saveData === true;
    const isVeryWeak = /^(slow-2g|2g)$/i.test(effective) || downlink < 0.8 || saveData;
    const isWeak = isVeryWeak || /^3g$/i.test(effective) || downlink < 1.5;
    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const deviceMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    const lowMem = deviceMem <= 2;
    const liveStartDelay = isVeryWeak ? 30 : isWeak ? 22 : 12;
    const liveSyncCount = isVeryWeak ? 6 : isWeak ? 5 : 4;
    const liveMaxLatencyCount = isVeryWeak ? 12 : isWeak ? 11 : 10;
    const stallRecoveryMs = isWeak ? 7000 : 6000;
    // Estimasi bandwidth awal: pakai pengukuran nyata dari sesi sebelumnya bila ada,
    // supaya sesi baru langsung mulai pada level yang realistis (bukan tebakan statis).
    const profileEstimate = isVeryWeak ? 220_000 : isWeak ? 450_000 : 900_000;
    const savedBw = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem('replaytime-bw-estimate') || 'null') as { bw?: number; at?: number } | null;
        if (!raw?.bw || !raw?.at) return null;
        // Estimasi kedaluwarsa setelah 12 jam (jaringan user bisa berubah).
        if (Date.now() - raw.at > 12 * 3600 * 1000) return null;
        return Math.max(120_000, Math.min(12_000_000, raw.bw));
      } catch { return null; }
    })();
    const initialBwEstimate = savedBw
      ? Math.round(savedBw * 0.85) // konservatif: 85% dari pengukuran terakhir
      : profileEstimate;

    // Adaptive buffer sizing: give bad networks a larger forward cushion, while
    // keeping low-memory devices conservative so the page itself stays responsive.
    const bufferProfile = lowMem
      ? { back: 8, max: 24, maxMax: 45, size: 30 * 1000 * 1000 }
      : isVeryWeak
        ? { back: 12, max: 32, maxMax: 60, size: 40 * 1000 * 1000 }
        : isWeak
          ? { back: 16, max: 40, maxMax: 75, size: 55 * 1000 * 1000 }
          : isMobile
            ? { back: 18, max: 48, maxMax: 90, size: 65 * 1000 * 1000 }
            : { back: 24, max: 60, maxMax: 120, size: 90 * 1000 * 1000 };

    // Tidak lagi melompat mundur manual: playlist live pendek (~20 detik) membuat
    // lompatan 22–30 detik jatuh di luar segmen → buffer macet. Biarkan hls.js.
    const seekToLiveEdgeOnce = (_syncPosition?: number | null) => {
      initialLiveEdgeSyncRef.current = true;
    };

    const startStallWatchdog = () => {
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      stallWatchdogRef.current = setInterval(() => {
        if (!video || video.paused || video.ended || loadingRef.current) return;
        const now = Date.now();
        const last = lastProgressRef.current;
        const current = video.currentTime;
        if (Math.abs(current - last.time) > 0.25) {
          lastProgressRef.current = { time: current, checkedAt: now, recoveries: 0 };
          // Tertinggal jauh dari siaran (mis. setelah layar mati) → lompat ke potongan terbaru.
          if (isLiveRef.current && !dvrRef.current && video.seekable.length) {
            const edge = video.seekable.end(video.seekable.length - 1);
            if (Number.isFinite(edge) && edge - current > 26) {
              try { video.currentTime = Math.max(0, edge - 8); } catch { /* ignore */ }
            }
          }
          return;
        }
        // Only act after a true stall to avoid interrupting normal playback.
        // On weak networks recover a little earlier so the spinner does not sit too long.
        if (now - last.checkedAt < stallRecoveryMs) return;

        setBufferingState(true);
        lastProgressRef.current = { time: current, checkedAt: now, recoveries: last.recoveries + 1 };

        const hlsInstance = hlsRef.current;
        if (hlsInstance) {
          try {
            if (isLiveRef.current) {
              const edge = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : NaN;
              const latency = Number.isFinite(edge) ? edge - current : 0;
              // Kalau benar-benar jauh tertinggal, lompat lembut mendekati live edge.
              // Kalau tidak, cukup lanjutkan loading supaya tidak terlihat refresh.
              if (latency > 26) video.currentTime = Math.max(0, edge - 8);
              hlsInstance.startLoad(-1);
            } else {
              hlsInstance.startLoad(resumePosition());
            }
          } catch { /* ignore */ }
        }
        safePlay();
      }, 4000);
    };

    if (Hls.isSupported()) {
      const attachRequestHeaders = (target: { setRequestHeader?: (key: string, value: string) => void; set?: (key: string, value: string) => void }) => {
        const hdrs = headersRef.current;
        if (!hdrs || Object.keys(hdrs).length === 0) return;
        Object.entries(hdrs).forEach(([key, value]) => {
          if (value == null || String(value).length === 0) return;
          if (typeof target.setRequestHeader === 'function') target.setRequestHeader(key, String(value));
          else if (typeof target.set === 'function') target.set(key, String(value));
        });
      };
      hls = new Hls({
        xhrSetup: (xhr) => {
          attachRequestHeaders(xhr);
        },
        fetchSetup: (context, initParams) => {
          const nextInit = { ...initParams, headers: new Headers(initParams?.headers || {}) };
          attachRequestHeaders(nextInit.headers);
          return new Request(context.url, nextInit);
        },
        enableWorker: true,
        // Prefer smooth playback over ultra-low latency; chasing the live edge is a common cause of rebuffering.
        lowLatencyMode: false,
        // Buffer tuning adaptif berdasarkan profil perangkat & jaringan.
        backBufferLength: dvr ? Infinity : bufferProfile.back,
        maxBufferLength: bufferProfile.max,
        maxMaxBufferLength: bufferProfile.maxMax,
        maxBufferSize: bufferProfile.size,
        maxBufferHole: isWeak ? 1.2 : 0.5,
        highBufferWatchdogPeriod: isWeak ? 3 : 2,
        nudgeOffset: isWeak ? 0.2 : 0.1,
        nudgeMaxRetry: isWeak ? 12 : 8,
        maxFragLookUpTolerance: isWeak ? 0.5 : 0.2,
        // ABR: mulai dari kualitas terendah supaya cepat play, lalu naikkan halus.
        startLevel: -1,
        autoStartLoad: true,
        abrEwmaDefaultEstimate: initialBwEstimate,
        // Live: EWMA cepat agar reaktif, slow lebih panjang agar tidak osilasi.
        abrEwmaFastLive: isWeak ? 8.0 : 4.0,
        abrEwmaSlowLive: isWeak ? 24.0 : 12.0,
        abrEwmaFastVoD: isWeak ? 6.0 : 3.0,
        abrEwmaSlowVoD: isWeak ? 18.0 : 9.0,
        // Lebih konservatif saat naik level → kurangi switch-down setelah naik
        // (penyebab utama rebuffer saat level berpindah-pindah).
        abrBandWidthFactor: isWeak ? 0.65 : 0.8,
        abrBandWidthUpFactor: isWeak ? 0.35 : 0.5,
        abrMaxWithRealBitrate: true,
        testBandwidth: true,
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
        // Prefetch fragmen pertama segera setelah manifest siap.
        startFragPrefetch: true,
        manifestLoadingTimeOut: 15_000,
        manifestLoadingMaxRetry: 8,
        manifestLoadingRetryDelay: 400,
        manifestLoadingMaxRetryTimeout: 6_000,
        levelLoadingTimeOut: 15_000,
        levelLoadingMaxRetry: 8,
        levelLoadingRetryDelay: 400,
        levelLoadingMaxRetryTimeout: 6_000,
        fragLoadingTimeOut: isWeak ? 35_000 : 25_000,
        fragLoadingMaxRetry: isWeak ? 14 : 10,
        fragLoadingRetryDelay: isWeak ? 700 : 500,
        fragLoadingMaxRetryTimeout: isWeak ? 12_000 : 8_000,
        // Stall detection — toleransi sedikit lebih longgar agar fluktuasi
        // jaringan tidak memicu nudge/recovery yang membuat video tersendat.
        maxStarvationDelay: isWeak ? 10 : 6,
        maxLoadingDelay: isWeak ? 10 : 6,
        appendErrorMaxRetry: 5,
        startPosition: -1,
        liveDurationInfinity: true,
        // Stable live: weak networks intentionally stay farther behind edge to
        // absorb jitter and avoid repeated rebuffer while switching fragments.
        liveSyncDurationCount: liveSyncCount,
        liveMaxLatencyDurationCount: dvr ? Infinity : liveMaxLatencyCount,
        // Kejar live edge halus dengan sedikit mempercepat video (tanpa lompat).
        maxLiveSyncPlaybackRate: 1,
        progressive: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => {
        // Live: simpan hanya potongan terbaru, buang potongan lama dari memori.
        if (d?.details?.live && hls && !dvrRef.current) {
          hls.config.backBufferLength = 8;
          hls.config.maxBufferLength = Math.max(hls.config.maxBufferLength, 30);
          hls.config.maxMaxBufferLength = Math.max(hls.config.maxMaxBufferLength, 45);
        }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLoading(false);
        const manifestLevels = (data.levels || []) as Array<{ details?: { live?: boolean }; height?: number; bitrate?: number }>;
        isLiveRef.current = manifestLevels.some(level => level.details?.live) || false;
        setIsLiveStream(isLiveRef.current);
        const levels: QualityLevel[] = manifestLevels.map((lvl, i) => ({
          index: i,
          label: lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)}kbps`,
          height: lvl.height,
          bitrate: lvl.bitrate,
        }));
        levels.sort((a, b) => (b.height || 0) - (a.height || 0));
        setQualities([{ index: -1, label: 'Auto' }, ...levels]);
        // Restore saved quality preference
        if (userQualityRef.current && hls) {
          const match = levels.find(l => l.height === userQualityRef.current);
          if (match) {
            hls.currentLevel = match.index;
            hls.autoLevelCapping = match.index;
            hls.capLevelToPlayerSize = false;
            setCurrentQuality(match.index);
          }
        } else if ((isWeak || lowMem) && hls) {
          // Jaringan/perangkat lemah: mulai konservatif agar tidak stall di menit pertama.
          const maxAutoHeight = isVeryWeak ? 270 : 360;
          const capCandidate = manifestLevels
            .map((lvl, i) => ({ i, h: lvl.height || 0 }))
            .filter(x => x.h > 0 && x.h <= maxAutoHeight)
            .sort((a, b) => b.h - a.h)[0];
          if (capCandidate) hls.autoLevelCapping = capCandidate.i;
        } else if (hls) {
          // Default: mulai dari resolusi TERTINGGI. Penjaga ABR di bawah akan
          // menurunkan satu tingkat secara perlahan jika buffering terus terjadi.
          hls.capLevelToPlayerSize = false;
          hls.autoLevelCapping = -1;
          const best = manifestLevels
            .map((lvl, i) => ({ i, h: lvl.height || 0 }))
            .sort((a, b) => b.h - a.h)[0];
          // Live (worker lambat ~3 detik/permintaan): biarkan ABR memilih level awal
          // sesuai bandwidth nyata agar tidak tersendat di menit pertama.
          if (best && best.h > 0 && !manifestLevels.some(l => l.details?.live)) {
            try { hls.startLevel = best.i; hls.nextLevel = best.i; } catch { /* ignore */ }
          }
        }
        safePlay();
      });
      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        const live = !!data.details?.live;
        const wasLive = isLiveRef.current;
        isLiveRef.current = live;
        setIsLiveStream(live);
        if (live) {
          seekToLiveEdgeOnce(data.details?.edge);
        } else {
          // Transition live -> VOD (e.g. siaran berakhir, manifest #EXT-X-ENDLIST muncul).
          // Reset edge-sync flag agar pengguna bisa bebas seek di rentang seekable VOD,
          // perbarui durasi dari totalduration manifest, dan cegah false-fatal pada player.
          initialLiveEdgeSyncRef.current = false;
          recoveryAttemptsRef.current = 0;
          const vodDuration = typeof data.details?.totalduration === 'number' ? data.details.totalduration : video.duration;
          if (Number.isFinite(vodDuration) && vodDuration > 0) setDuration(vodDuration);
          if (wasLive) {
            // Jangan biarkan posisi tertinggal di luar batas seekable baru.
            try {
              const seekable = video.seekable;
              if (seekable.length) {
                const end = seekable.end(seekable.length - 1);
                if (Number.isFinite(end) && video.currentTime > end) video.currentTime = Math.max(0, end - 1);
              }
            } catch { /* ignore */ }
          }
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (hls && hls.autoLevelEnabled) {
          const lvl = hls.levels[data.level];
          const nextLabel = lvl?.height ? `${lvl.height}p` : '';
          setAutoActiveLabel(prev => prev === nextLabel ? prev : nextLabel);
        } else if (hls && userQualityRef.current) {
          // Enforce user's manual quality if hls.js drifted. Only act when the
          // current level's height truly differs AND a matching level exists,
          // to avoid bouncing between renditions.
          const lvl = hls.levels[data.level];
          if (lvl?.height && lvl.height !== userQualityRef.current) {
            const target = hls.levels.findIndex(l => l.height === userQualityRef.current);
            if (target >= 0 && target !== data.level && hls.nextLevel !== target) {
              try {
                hls.autoLevelCapping = target;
                hls.loadLevel = target;
                hls.nextLevel = target;
              } catch { /* ignore */ }
            }
          }
        }
      });

      // Simpan estimasi bandwidth nyata agar sesi berikutnya mulai di level yang tepat.
      const persistBandwidth = () => {
        try {
          const bw = hls?.bandwidthEstimate;
          if (typeof bw === 'number' && isFinite(bw) && bw > 50_000) {
            localStorage.setItem('replaytime-bw-estimate', JSON.stringify({ bw: Math.round(bw), at: Date.now() }));
          }
        } catch { /* ignore */ }
      };

      // Penjaga ABR: naikkan kualitas hanya bertahap saat buffer benar-benar sehat,
      // dan turunkan cepat begitu buffer menipis — supaya jaringan kecil tidak lag.
      if (abrGuardRef.current) clearInterval(abrGuardRef.current);
      abrStateRef.current = { healthySince: 0, capIndex: -1, lastAdjust: 0 };
      abrGuardRef.current = setInterval(() => {
        if (!hls || !video) return;
        persistBandwidth();

        // Ukur kekuatan jaringan untuk ditampilkan ke user (selalu, termasuk mode manual).
        let bufferAhead = 0;
        try {
          const t = video.currentTime;
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= t + 0.25 && video.buffered.end(i) > t) {
              bufferAhead = video.buffered.end(i) - t;
              break;
            }
          }
        } catch { /* ignore */ }
        const bwKbps = Math.round((hls.bandwidthEstimate || 0) / 1000);
        const bestFit = (hls.levels || [])
          .map(l => ({ h: l.height || 0, b: l.bitrate || 0 }))
          .filter(l => l.h > 0 && l.b > 0 && l.b * 1.35 <= (hls.bandwidthEstimate || 0))
          .sort((a, b) => b.h - a.h)[0];
        setNetStats({
          kbps: bwKbps,
          buffer: Math.round(bufferAhead),
          recommendedHeight: bestFit?.h ?? null,
        });

        // Mode manual: kunci pilihan user, jangan pernah ubah sendiri.
        if (userQualityRef.current) {
          try {
            const target = hls.levels.findIndex(l => l.height === userQualityRef.current);
            if (target >= 0) {
              if (hls.autoLevelCapping !== target) hls.autoLevelCapping = target;
              if (hls.loadLevel !== target) hls.loadLevel = target;
              if (hls.nextLevel !== target && hls.currentLevel !== target) hls.nextLevel = target;
            }
          } catch { /* ignore */ }
          return;
        }
        const levelCount = hls.levels?.length || 0;
        if (levelCount < 2) return;

        const now = Date.now();
        const state = abrStateRef.current;
        let ahead = 0;
        try {
          const t = video.currentTime;
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= t + 0.25 && video.buffered.end(i) > t) {
              ahead = video.buffered.end(i) - t;
              break;
            }
          }
        } catch { /* ignore */ }

        const currentIdx = hls.currentLevel >= 0 ? hls.currentLevel : 0;
        const cap = state.capIndex >= 0 ? state.capIndex : levelCount - 1;
        const lowBuffer = isWeak ? 5 : 4;
        const healthyBuffer = isWeak ? 14 : 10;

        // Buffer menipis / sedang buffering → turunkan batas satu tingkat segera.
        if ((ahead < lowBuffer || video.readyState < 3) && !video.paused) {
          state.healthySince = 0;
          const nextCap = Math.max(0, Math.min(cap, currentIdx) - 1);
          if (nextCap !== state.capIndex && now - state.lastAdjust > 4000) {
            state.capIndex = nextCap;
            state.lastAdjust = now;
            try { hls.autoLevelCapping = nextCap; } catch { /* ignore */ }
          }
          return;
        }

        // Buffer sehat stabil → longgarkan batas satu tingkat saja (naik perlahan).
        if (ahead >= healthyBuffer) {
          if (!state.healthySince) state.healthySince = now;
          const stableMs = isWeak ? 30_000 : 20_000;
          if (now - state.healthySince >= stableMs && now - state.lastAdjust > stableMs) {
            const nextCap = state.capIndex < 0 ? -1 : Math.min(levelCount - 1, state.capIndex + 1);
            state.lastAdjust = now;
            state.healthySince = now;
            if (nextCap >= levelCount - 1 || nextCap < 0) {
              state.capIndex = -1;
              try { hls.autoLevelCapping = -1; } catch { /* ignore */ }
            } else {
              state.capIndex = nextCap;
              try { hls.autoLevelCapping = nextCap; } catch { /* ignore */ }
            }
          }
        } else {
          state.healthySince = 0;
        }
      }, 5000);

      hls.on(Hls.Events.ERROR, (_, data) => {
        // Kunci IDN kedaluwarsa (token 90 detik): minta kunci baru & coba lagi
        // di server yang sama, jangan langsung pindah server.
        const code = Number(data.response?.code || 0);
        if ((code === 401 || code === 403) && onAuthErrorRef.current && headersRef.current && authErrorsRef.current < 2) {
          authErrorsRef.current += 1;
          onAuthErrorRef.current();
          if (data.fatal) {
            const h = hls;
            setTimeout(() => { try { h?.startLoad(isLiveRef.current ? -1 : resumePosition()); } catch { /* ignore */ } }, 1500);
          }
          return;
        }
        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR && data.response?.code && data.response.code >= 400) {
          setError('Sumber video tidak dapat diakses. Mencoba player lain…');
          setLoading(false);
          setBufferingState(false);
          onFatalErrorRef.current?.();
          return;
        }
        // Non-fatal errors: let hls.js retry internally. Avoid media recovery here because it can restart/seek unexpectedly.
        if (!data.fatal) {
          return;
        }

        // Fatal: try to recover IN-PLACE, preserving currentTime.
        if (recoveryAttemptsRef.current < 3) {
          recoveryAttemptsRef.current += 1;
          const resumeTime = video.currentTime;
          const wasPlaying = !video.paused;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls?.startLoad(isLiveRef.current ? -1 : resumePosition());
              if (wasPlaying) video.play().catch(() => {});
              return;
            } catch { /* ignore */ }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls?.recoverMediaError();
              // Restore the user's position after recovery (recoverMediaError can reset to 0)
              const restore = () => {
                if (!isLiveRef.current && resumeTime > 0 && Math.abs(video.currentTime - resumeTime) > 1) {
                  try { video.currentTime = resumeTime; } catch { /* ignore */ }
                }
                if (wasPlaying) video.play().catch(() => {});
              };
              video.addEventListener('loadedmetadata', restore, { once: true });
              // Also try after a short delay in case loadedmetadata doesn't fire
              setTimeout(restore, 800);
              return;
            } catch { /* ignore */ }
          }
        }
        setError('Gagal memuat video.');
        setLoading(false);
        setBufferingState(false);
        onFatalErrorRef.current?.();
      });
      startStallWatchdog();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      nativeLoadedHandler = () => {
        const durationValue = video.duration;
        const nativeLive = !Number.isFinite(durationValue) || durationValue === Infinity;
        isLiveRef.current = nativeLive;
        setIsLiveStream(nativeLive);
        if (nativeLive) setTimeout(() => seekToLiveEdgeOnce(), 250);
        setLoading(false);
        safePlay();
      };
      nativeErrorHandler = () => {
        setError('Gagal memuat video.');
        setLoading(false);
        onFatalErrorRef.current?.();
      };
      video.addEventListener('loadedmetadata', nativeLoadedHandler, { once: true });
      video.addEventListener('error', nativeErrorHandler, { once: true });
      startStallWatchdog();
    } else {
      setError('Browser ini tidak mendukung pemutaran HLS.');
      setLoading(false);
      onFatalErrorRef.current?.();
    }

    return () => {
      if (stallWatchdogRef.current) clearInterval(stallWatchdogRef.current);
      if (abrGuardRef.current) { clearInterval(abrGuardRef.current); abrGuardRef.current = null; }

      stallWatchdogRef.current = null;
      if (nativeLoadedHandler) video.removeEventListener('loadedmetadata', nativeLoadedHandler);
      if (nativeErrorHandler) video.removeEventListener('error', nativeErrorHandler);
      try { if (hls) hls.destroy(); } catch { /* ignore */ }
      hlsRef.current = null;
      // Reset native source to prevent leaked playback when switching providers
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    };
  }, [src, setBufferingState]);

  const selectQuality = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    // IMPORTANT: update userQualityRef BEFORE switching level, otherwise the
    // LEVEL_SWITCHED enforcement still sees the previous preference and snaps
    // the player back to the old quality (causes "resolusi naik-turun sendiri").
    if (levelIndex === -1) {
      userQualityRef.current = null;
      hls.autoLevelCapping = -1;
      hls.capLevelToPlayerSize = true;
      hls.currentLevel = -1;
      try { localStorage.removeItem('replaytime-quality-height'); } catch { /* ignore */ }
    } else {
      const lvl = hls.levels[levelIndex];
      const h = lvl?.height || null;
      userQualityRef.current = h;
      // Lock the level so ABR/cap doesn't override user's choice.
      hls.capLevelToPlayerSize = false;
      hls.autoLevelCapping = levelIndex;
      hls.loadLevel = levelIndex;
      // Use nextLevel (no buffer flush) instead of currentLevel to avoid the
      // hard reload that causes a visible rebuffer when switching renditions.
      hls.nextLevel = levelIndex;
      if (h) try { localStorage.setItem('replaytime-quality-height', String(h)); } catch { /* ignore */ }
    }
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
  };

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    // Throttle: hanya update saat detik bulat berubah → kurangi re-render dari ~4Hz ke 1Hz
    let lastSec = -1;
      const onTimeUpdate = () => {
      const t = video.currentTime;
      const sec = Math.floor(t);
      if (sec !== lastSec) {
        lastSec = sec;
        setCurrentTime(t);
      }
    };
    const onDurationChange = () => {
      const nextDuration = video.duration;
      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        setDuration(0);
        if (isLiveRef.current) setIsLiveStream(true);
        return;
      }
      setDuration(nextDuration);
      if (!isLiveRef.current) setIsLiveStream(false);
    };
    const getBufferedAhead = () => {
      try {
        const t = video.currentTime;
        const ranges = video.buffered;
        for (let i = 0; i < ranges.length; i += 1) {
          if (ranges.start(i) <= t && ranges.end(i) >= t) return Math.max(0, ranges.end(i) - t);
        }
      } catch { /* ignore */ }
      return 0;
    };
    const onWaiting = () => {
      // mid-play stall (not initial)
      if (!loadingRef.current && getBufferedAhead() < 1) setBufferingState(true);
    };
    const onPlaying = () => {
      setLoading(false);
      setBufferingState(false);
      // Reset recovery counter on successful playback so future hiccups can recover too
      recoveryAttemptsRef.current = 0;
    };
    const onCanPlay = () => { setLoading(false); setBufferingState(false); };
    const onLoadedMetadata = () => onDurationChange();
    const onProgress = () => {
      lastProgressRef.current = { time: video.currentTime, checkedAt: Date.now(), recoveries: 0 };
      updateSeekRange();
    };
    const updateSeekRange = () => {
      try {
        const sk = video.seekable;
        let start = 0;
        let end = 0;
        if (sk && sk.length) {
          start = sk.start(0);
          end = sk.end(sk.length - 1);
        }
        const d = video.duration;
        if (Number.isFinite(d) && d > 0 && d > end) end = d;
        if (!Number.isFinite(start)) start = 0;
        if (!Number.isFinite(end)) end = 0;
        setSeekRange(prev => (Math.abs(prev.start - start) < 0.5 && Math.abs(prev.end - end) < 0.5 ? prev : { start, end }));
      } catch { /* ignore */ }
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolumeChange);
    const rangeTimer = setInterval(updateSeekRange, 2000);
    updateSeekRange();

    return () => {
      clearInterval(rangeTimer);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, [setBufferingState]);

  // Fullscreen tracking (cross-browser)
  useEffect(() => {
    const onChange = () => setIsFullscreen(isFullscreenActive() || isVideoFullscreen(videoRef.current));
    return onFullscreenChange(onChange);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) setShowControls(false);
    }, 3000);
  }, []);

  const toggleControls = useCallback(() => {
    resetHideTimer();
  }, [resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [resetHideTimer]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    resetHideTimer();
  };

  // Batas seek: pakai rentang seekable nyata (VOD penuh atau jendela DVR live).
  const seekStart = seekRange.start;
  const seekEnd = seekRange.end > seekRange.start
    ? seekRange.end
    : (Number.isFinite(duration) && duration > 0 ? duration : 0);
  const seekSpan = Math.max(0, seekEnd - seekStart);
  const canSeek = seekSpan > 2;

  const applySeek = (target: number) => {
    const video = videoRef.current;
    if (!video || !canSeek) return;
    const safeEnd = Math.max(seekStart, seekEnd - (isLiveStream ? 3 : 0.3));
    const next = Math.max(seekStart, Math.min(safeEnd, target));
    try { video.currentTime = next; } catch { /* ignore */ }
    setCurrentTime(next);
    resetHideTimer();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    applySeek(video.currentTime + delta);
  };

  const seekTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    applySeek(Number(e.target.value));
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number(e.target.value);
    video.volume = v;
    if (v > 0 && video.muted) { video.muted = false; setNeedsUnmute(false); }
    try { localStorage.setItem('replaytime-volume', String(v)); } catch { /* ignore */ }
    try { localStorage.setItem('replaytime-muted', video.muted ? '1' : '0'); } catch { /* ignore */ }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted) {
      setNeedsUnmute(false);
      if (video.paused) video.play().catch(() => {});
    }
    try { localStorage.setItem('replaytime-muted', video.muted ? '1' : '0'); } catch { /* ignore */ }
  };

  const fsBusyRef = useRef(false);
  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el || fsBusyRef.current) return;
    fsBusyRef.current = true;
    try {
      if (isFullscreenActive() || isVideoFullscreen(videoRef.current)) {
        await exitFs(videoRef.current);
        setIsFullscreen(false);
        await lockLandscape(false);
        return;
      }
      await requestFs(el, videoRef.current);
      setIsFullscreen(isFullscreenActive());
      await lockLandscape(true);
    } finally {
      fsBusyRef.current = false;
    }
  };

  if (error) {
    return (
      <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  const netTier = !netStats || netStats.kbps <= 0
    ? null
    : netStats.kbps >= 5000
      ? { label: 'Sangat Baik', bars: 4, tone: 'text-emerald-400' }
      : netStats.kbps >= 2500
        ? { label: 'Baik', bars: 3, tone: 'text-emerald-400' }
        : netStats.kbps >= 1200
          ? { label: 'Sedang', bars: 2, tone: 'text-amber-400' }
          : { label: 'Lemah', bars: 1, tone: 'text-red-400' };

  return (
    <>
    <div
      ref={containerRef}
      data-player-root

      className={`relative w-full overflow-hidden rounded-xl bg-black group/player ${isFullscreen ? 'h-dvh' : ''} ${showControls || !isPlaying ? '' : 'cursor-none'}`}
      style={{ paddingBottom: isFullscreen ? '0' : '56.25%', height: isFullscreen ? '100dvh' : undefined }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        playsInline
        onClick={toggleControls}
        title={title}
      />
      {watermark && <LiveWatermark code={watermark} />}
      {overlay}

      {/* Initial loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/40 backdrop-blur-sm animate-fade-in">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-3 text-sm font-medium text-white/90 animate-pulse">Menghubungkan ke server...</p>
        </div>
      )}

      {/* Mid-play buffering indicator (subtle, top-right) */}
      {!loading && buffering && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 pointer-events-none animate-fade-in">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="text-xs font-medium text-white/90">Memuat...</span>
        </div>
      )}

      {/* Unmute hint when browser blocked autoplay-with-sound */}
      {needsUnmute && muted && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg animate-fade-in"
        >
          🔊 Tap untuk aktifkan suara
        </button>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%, rgba(0,0,0,0.3) 100%)',
        }}
        onClick={(e) => {
          // Click on the empty overlay area (not on a control) toggles controls.
          if (e.target === e.currentTarget) toggleControls();
        }}
      >
        {!isPlaying && !loading && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Play"
          >
            <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center backdrop-blur-sm transition-transform hover:scale-110">
              <Play className="w-10 h-10 text-primary-foreground ml-1" fill="currentColor" />
            </div>
          </button>
        )}

        <div className="relative z-10 px-2 sm:px-4 pb-2 sm:pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5 sm:gap-2 text-white text-[10px] sm:text-xs min-w-0">
            <span className="w-12 sm:w-16 text-left shrink-0 tabular-nums">{formatTime(Math.max(0, currentTime - seekStart))}</span>
            <input
              type="range"
              min={seekStart}
              max={Math.max(seekStart + 1, seekEnd)}
              step={0.1}
              value={Math.max(seekStart, Math.min(seekEnd || seekStart + 1, currentTime))}
              onChange={seekTo}
              onInput={seekTo}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              disabled={!canSeek}
              aria-label="Geser posisi video"
              className="min-w-0 flex-1 h-2 accent-primary cursor-pointer touch-none disabled:cursor-default disabled:opacity-70"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${
                  seekSpan ? Math.max(0, Math.min(100, ((currentTime - seekStart) / seekSpan) * 100)) : 0
                }%, rgba(255,255,255,0.3) ${seekSpan ? Math.max(0, Math.min(100, ((currentTime - seekStart) / seekSpan) * 100)) : 0}%, rgba(255,255,255,0.3) 100%)`,
                borderRadius: '999px',
                appearance: 'none',
              }}
            />
            {isLiveStream && dvr ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); applySeek(seekEnd); }}
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${seekEnd - currentTime > 15 ? 'bg-white/20 text-white' : 'bg-red-600 text-white'}`}
                aria-label="Kembali ke LIVE"
                title="Kembali ke LIVE"
              >
                {seekEnd - currentTime > 15 ? `-${formatTime(seekEnd - currentTime)} · LIVE` : 'LIVE'}
              </button>
            ) : (
              <span className="w-12 sm:w-16 text-right shrink-0 tabular-nums">{isLiveStream ? 'LIVE' : formatTime(seekSpan || duration)}</span>
            )}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-2 min-w-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-2 text-white hover:text-primary transition-colors shrink-0" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            {!hideSeekButtons && (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); seek(-10); }} disabled={!canSeek} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current shrink-0" aria-label="Mundur 10 detik" title="Mundur 10 detik">
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); seek(10); }} disabled={!canSeek} className="p-2 text-white hover:text-primary transition-colors disabled:opacity-40 disabled:hover:text-current shrink-0" aria-label="Maju 10 detik" title="Maju 10 detik">
                  <RotateCw className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="flex items-center gap-0.5 sm:gap-1 group/volume shrink-0">
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(); resetHideTimer(); }} className="p-2 text-white hover:text-primary transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={changeVolume}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="w-14 sm:w-20 h-2 accent-primary cursor-pointer hidden min-[360px]:block"
              />
            </div>

            <div className="flex-1" />

            {qualities.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowQualityMenu(v => !v); resetHideTimer(); }}
                  className="p-2 text-white hover:text-primary transition-colors flex items-center gap-1"
                  aria-label="Kualitas video"
                  title="Kualitas video"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-[10px] font-medium hidden sm:inline">
                    {currentQuality === -1
                      ? `Auto${autoActiveLabel ? ` · ${autoActiveLabel}` : ''}`
                      : qualities.find(q => q.index === currentQuality)?.label || ''}
                  </span>
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-[140px] rounded-lg bg-card/95 backdrop-blur border border-border shadow-xl overflow-hidden z-30">
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground border-b border-border">
                      Kualitas Video
                    </div>
                    {qualities.map(q => {
                      const active = currentQuality === q.index;
                      return (
                        <button
                          key={q.index}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); selectQuality(q.index); resetHideTimer(); }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                            active ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary/60'
                          }`}
                        >
                          <span>
                            {q.label}
                            {q.index === -1 && autoActiveLabel && (
                              <span className="text-muted-foreground ml-1">({autoActiveLabel})</span>
                            )}
                          </span>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowTvMenu(v => !v); resetHideTimer(); }}
                className={`p-2 transition-colors ${casting || tvMode ? 'text-primary' : 'text-white hover:text-primary'}`}
                aria-label="Hubungkan ke TV / Proyektor"
                title="Hubungkan ke TV / Proyektor"
              >
                <Cast className="w-5 h-5" />
              </button>
              {showTvMenu && (() => {
                const headerGated = !!headers && Object.keys(headers).length > 0;
                // Sumber terproteksi kini tetap bisa di-Cast lewat alamat sementara.
                const castOk = castSupported && castAvailable && !casting;
                return (
                <div
                  className="absolute bottom-12 right-0 z-30 w-60 rounded-lg border border-white/15 bg-black/90 backdrop-blur p-1.5 text-xs text-white shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {castOk && (
                    <button type="button" disabled={castPreparing} className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10 disabled:opacity-60"
                      onClick={() => { void showCastPicker(); resetHideTimer(); }}>
                      {castPreparing ? 'Menyiapkan alamat TV…' : 'Sambungkan ke TV (Cast / AirPlay)'}
                    </button>
                  )}
                  {castError && (
                    <p role="alert" className="px-2.5 py-2 text-[11px] leading-relaxed text-destructive">
                      {castError}
                    </p>
                  )}
                  {casting && (
                    <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10 text-primary"
                      onClick={() => { stopCasting(); setShowTvMenu(false); }}>
                      Hentikan Cast ke TV
                    </button>
                  )}
                  {/* AirPlay/Remote Playback selalu tersedia & aman untuk semua sumber
                      (termasuk IDN) karena memakai sesi video di perangkat ini — tidak
                      membuat ikatan perangkat baru, jadi tidak memicu reset. */}
                  <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10"
                    onClick={() => { showNativePicker(videoRef.current); setShowTvMenu(false); resetHideTimer(); }}>
                    AirPlay / Remote Playback (via HP)
                  </button>
                  <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10"
                    onClick={() => {
                      const next = !tvMode;
                      setTvMode(next);
                      if (next && !isFullscreenActive()) requestFs(containerRef.current, videoRef.current);
                      setShowTvMenu(false);
                      resetHideTimer();
                    }}>
                    {tvMode ? 'Matikan Mode TV' : 'Mode TV (layar penuh, tidak redup)'}
                  </button>
                  <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10 font-semibold text-primary"
                    onClick={() => { setTvConnectTab('code'); setShowTvConnect(true); setShowTvMenu(false); resetHideTimer(); }}>
                    Kode untuk browser TV (6 angka)
                  </button>
                  <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10"
                    onClick={() => { setTvConnectTab('mirror'); setShowTvConnect(true); setShowTvMenu(false); resetHideTimer(); }}>
                    Panduan siarkan layar ke TV
                  </button>
                  <button type="button" className="w-full text-left px-2.5 py-2 rounded hover:bg-white/10"
                    onClick={() => { void copyTvLink(); setShowTvMenu(false); resetHideTimer(); }}>
                    Salin link untuk browser TV
                  </button>
                  <p className="px-2.5 py-1.5 text-[10px] text-white/60 leading-relaxed">
                    {headerGated
                      ? 'Sumber ini hanya bisa ditonton via AirPlay/Mode TV dari HP ini (tidak perlu reset). Buka link di TV hanya berlaku untuk token multi-perangkat.'
                      : 'AirPlay/Cast dari HP ini memakai sesi yang sama — token tidak perlu reset. Salin link hanya untuk token multi-perangkat.'}
                  </p>
                </div>
                );
              })()}
            </div>

            <button type="button" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); resetHideTimer(); }} className="p-2 text-white hover:text-primary transition-colors" aria-label="Fullscreen">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>

    {!isFullscreen && (
      <div className="mt-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="flex items-end gap-[2px] h-3.5">
              {[1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className={`w-[3px] rounded-sm ${netTier && i <= netTier.bars ? 'bg-current' : 'bg-muted-foreground/30'} ${netTier ? netTier.tone : ''}`}
                  style={{ height: `${i * 25}%` }}
                />
              ))}
            </span>
            <span className={`font-semibold ${netTier ? netTier.tone : 'text-muted-foreground'}`}>
              Jaringan: {netTier ? netTier.label : 'Mengukur…'}
            </span>
          </span>
          {netStats && netStats.kbps > 0 && (
            <span className="text-muted-foreground">
              {netStats.kbps >= 1000 ? `${(netStats.kbps / 1000).toFixed(1)} Mbps` : `${netStats.kbps} Kbps`} · buffer {netStats.buffer}s
            </span>
          )}
          <span className="text-muted-foreground">
            Resolusi: {currentQuality === -1 ? `Auto${autoActiveLabel ? ` (${autoActiveLabel})` : ''}` : `${qualities.find(q => q.index === currentQuality)?.label || '-'} (dikunci)`}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
          {netStats?.recommendedHeight
            ? `Rekomendasi untuk jaringan Anda: ${netStats.recommendedHeight}p. `
            : ''}
          {currentQuality === -1
            ? 'Mode Auto menyesuaikan resolusi otomatis. Pilih resolusi di ikon gear untuk menguncinya.'
            : 'Resolusi terkunci — tidak akan berubah sendiri sampai Anda menggantinya lagi.'}
        </p>
      </div>
    )}

    {showTvConnect && (
      <TvConnectDialog open={showTvConnect} onOpenChange={setShowTvConnect} initialTab={tvConnectTab} showId={showId} replayPayload={replayTvPayload} />
    )}
    </>
  );
});

HlsPlayer.displayName = 'HlsPlayer';

export default HlsPlayer;
