import { useEffect, useMemo, useState, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { readMembershipCredentials } from '@/lib/membershipAccess';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Users, Eye, PictureInPicture2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import { setShowPurchase } from '@/lib/purchases';
import { clearMembershipCredentials, saveMembershipCredentials } from '@/lib/membershipAccess';
import MemberAvatar from '@/components/MemberAvatar';
import { useAutoHideOnInteraction } from '@/hooks/useAutoHideOnInteraction';
import { useViewerCount } from '@/hooks/useViewerCount';

import type { HlsPlayerHandle } from '@/components/HlsPlayer';
import { TV_ROTATE_MS, getTvSession, renewTvGrant } from '@/lib/tvSession';

// Lazy-load player & chat: bundle awal lebih kecil, terutama di mobile.
const HlsPlayer = lazy(() => import('@/components/HlsPlayer'));
const EmbedPlayer = lazy(() => import('@/components/EmbedPlayer'));
const LiveChat = lazy(() => import('@/components/LiveChat'));

const PlayerFallback = () => (
  <div className="aspect-video w-full rounded-2xl bg-card/80 border border-border flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);
const ChatFallback = () => (
  <div className="rounded-2xl bg-card/80 border border-border h-[70vh] min-h-[460px] max-h-[760px] flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-primary animate-spin" />
  </div>
);
const ChatIdle = () => (
  <div className="rounded-2xl bg-card/60 border border-border h-[70vh] min-h-[460px] max-h-[760px] flex items-center justify-center">
    <span className="text-xs text-muted-foreground">Live Chat</span>
  </div>
);

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface PublicSource { label: string; type: SrcType }
interface PrivateSource extends PublicSource { url: string }
interface MembershipInfo { expires_at?: string; resets_used: number; resets_max: number; remaining: number; includes_replays?: boolean; max_devices?: number }
interface LiveStatus { enabled: boolean; title: string; type: string; require_password: boolean; sources: PublicSource[]; lineup: string[]; show_date?: string; show_time?: string; image_url?: string; idn_show_id?: string; group_link?: string; group_link_enabled?: boolean; group_link_label?: string; group_link_note?: string }
interface UnlockedConfig { title: string; type: SrcType; url: string; sources: PrivateSource[]; watermark: string; enabled: boolean; idn_show_id?: string; server2_url?: string; server3_url?: string; grant?: string }
type SourceLike = Partial<Record<keyof PrivateSource, unknown>>;
interface IdnTokenResponse { error?: string; xApiToken?: string; xSecKey?: string; xTokenId?: string; xShowId?: string; playbackUrl?: string }
type PiPDocument = Document & { pictureInPictureEnabled?: boolean; pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> };


const SS_KEY_BASE = 'replaytime-live-unlocked';
const SS_SRC_KEY = 'replaytime-live-source-idx';
  // Token IDN berlaku ~2 jam. Refresh header tiap 25 menit sudah aman dan
  // menghindari tear-down player. URL playback worker dibuat stabil; refresh
  // berikutnya HANYA memperbarui headers supaya manifest live dan potongan .ts
  // tetap terotorisasi tanpa restart player.
const IDN_TOKEN_REFRESH_MS = 60 * 1000; // aturan HANABIRA48: token 90 detik, rotasi detik ke-60

const typeLabel = (t: string) => t === 'youtube' ? 'YouTube' : t === 'cloudflare' ? 'Cloudflare' : 'M3U8 / HLS';

const isSrcType = (value: unknown): value is SrcType => value === 'm3u8' || value === 'youtube' || value === 'cloudflare';
const asSourceLike = (value: unknown): SourceLike | null => value && typeof value === 'object' ? value as SourceLike : null;
const toPublicSources = (value: unknown): PublicSource[] => Array.isArray(value)
  ? value.flatMap((item) => {
    const source = asSourceLike(item);
    return source ? [{ label: String(source.label || ''), type: isSrcType(source.type) ? source.type : 'm3u8' }] : [];
  })
  : [];
const toPrivateSources = (value: unknown): PrivateSource[] => Array.isArray(value)
  ? value.flatMap((item) => {
    const source = asSourceLike(item);
    return source ? [{ label: String(source.label || ''), type: isSrcType(source.type) ? source.type : 'm3u8', url: String(source.url || '') }] : [];
  })
  : [];

function pad(n: number) { return String(n).padStart(2, '0'); }

const ScheduleCountdown = memo(function ScheduleCountdown({ title, showDate, showTime, imageUrl }: { title: string; showDate?: string; showTime?: string; imageUrl?: string }) {
  const target = showDate && showTime ? new Date(`${showDate}T${showTime}`) : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, []);

  const diff = target ? target.getTime() - now : 0;
  const past = !target || diff <= 0;
  const d = Math.max(0, Math.floor(diff / 86400000));
  const h = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const m = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const s = Math.max(0, Math.floor((diff % 60000) / 1000));
  const dateLabel = target ? target.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const timeLabel = target ? `${pad(target.getHours())}:${pad(target.getMinutes())} WIB` : '';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-primary/30 bg-black min-h-[320px] sm:aspect-video sm:min-h-0">
      {imageUrl && (
        <div
          className="absolute inset-0 bg-center bg-cover scale-110 blur-sm"
          style={{ backgroundImage: `url(${imageUrl})` }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-primary/20 to-black/80" aria-hidden />
      <div className="relative h-full w-full flex flex-col items-center justify-center text-center px-3 sm:px-6 py-4 sm:py-6 gap-2 sm:gap-4">
        <h3 className="text-base sm:text-2xl font-bold text-white drop-shadow">
          {past ? 'Menunggu Siaran' : 'Show Belum Dimulai'}
        </h3>
        <div className="text-lg sm:text-3xl font-bold text-primary drop-shadow flex items-center justify-center gap-2 flex-wrap">
          <span aria-hidden>🥷</span>
          <span>{title}</span>
        </div>
        {target && (
          <p className="text-xs sm:text-base text-white/90 drop-shadow flex items-center justify-center gap-1.5 flex-wrap">
            <span aria-hidden>📅</span><span>{dateLabel}</span>
            <span className="text-white/50">•</span>
            <span aria-hidden>🕐</span><span>{timeLabel}</span>
          </p>
        )}
        {past ? (
          <p className="text-xs sm:text-base font-semibold text-white drop-shadow">⏳ Menunggu admin memulai siaran…</p>
        ) : (
          <div className="rounded-2xl bg-black/40 backdrop-blur border border-white/15 px-2 sm:px-6 py-2 sm:py-4 max-w-lg w-full">
            <div className="grid grid-cols-4 gap-1 sm:gap-3 items-center">
              {[{v:d,l:'Hari'},{v:h,l:'Jam'},{v:m,l:'Menit'},{v:s,l:'Detik'}].map((u,i)=>(
                <div key={i} className="text-center">
                  <div className="text-xl sm:text-4xl font-bold text-primary tabular-nums drop-shadow tracking-wider">{pad(u.v)}</div>
                  <div className="text-[9px] sm:text-xs text-white/70 uppercase tracking-widest mt-0.5 sm:mt-1">{u.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default function Live() {
  const [sp] = useSearchParams();
  if (!sp.get('mtoken') && !sp.get('t') && sp.get('admin_monitor') !== '1') {
    const creds = readMembershipCredentials();
    if (creds?.token) {
      const next = new URLSearchParams(sp);
      next.set('mtoken', creds.token);
      if (creds.password) next.set('mp', creds.password);
      return <Navigate to={`/live?${next.toString()}`} replace />;
    }
  }
  return <LiveInner />;
}

function LiveInner() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<UnlockedConfig | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [pwError, setPwError] = useState('');
  const [, setSubmitting] = useState(false);
  const [failedSourceKeys, setFailedSourceKeys] = useState<string[]>([]);
  const [tokenInfo, setTokenInfo] = useState<{ kind: string; max_devices: number } | null>(null);
  const [resetInfo, setResetInfo] = useState<{ remaining: number; max: number; eligible: boolean } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [chatReady, setChatReady] = useState(false);
  const navVisible = useAutoHideOnInteraction(!!unlocked, 3000);
  // Selalu mulai dari server pertama saat masuk; jangan ingat server cadangan yang gagal.
  const [sourceIdx, setSourceIdx] = useState<number>(() => {
    try { sessionStorage.removeItem(SS_SRC_KEY); } catch { /* ignore */ }
    return 0;
  });
  const playerRef = useRef<HlsPlayerHandle | null>(null);
  const chatHostRef = useRef<HTMLDivElement | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const handlePipChange = useCallback((active: boolean) => setPipActive(active), []);


  const showId = search.get('show') || '';
  const adminMonitor = search.get('admin_monitor') === '1';
  // Show yang di-resolve server (untuk membership yang membuka /live tanpa ?show).
  const [resolvedShowId, setResolvedShowId] = useState('');
  const resolvedShowIdRef = useRef('');
  useEffect(() => { resolvedShowIdRef.current = resolvedShowId; }, [resolvedShowId]);
  const effectiveShowId = showId || resolvedShowId;
  const isWeakNetwork = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; saveData?: boolean } }).connection;
    const effective = conn?.effectiveType || '';
    const downlink = typeof conn?.downlink === 'number' ? conn.downlink : 99;
    return /^(slow-2g|2g|3g)$/i.test(effective) || downlink < 1.5 || conn?.saveData === true;
  }, []);

  const playbackPriorityMode = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    const mobileOrTv = /Mobi|Android|iPhone|iPad|SmartTV|Tizen|Web0S|NetCast|Roku|AFT/i.test(navigator.userAgent || '');
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches === true;
    return isWeakNetwork || mem <= 2 || mobileOrTv || coarsePointer;
  }, [isWeakNetwork]);

  const fetchStatus = () => {
    const sid = effectiveShowId;
    if (sid) {
      return supabase.from('active_shows')
        .select('id,title,is_live,live_type,live_require_password,lineup,show_date,show_time,is_active,image_url,idn_show_id,group_link,group_link_enabled,group_link_label,group_link_note')
        .eq('id', sid).maybeSingle()
        .then(({ data, error }) => {
          // Jangan anggap live "selesai" hanya karena fetch status gagal sesaat
          // (network blip / rate limit). Pertahankan status lama; polling/realtime
          // berikutnya akan mengoreksi. Ini memperbaiki false "Live Telah Selesai".
          if (error) { setStatusLoading(false); return null; }
          if (!data || !data.is_active) {
            setStatus({ enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
            setStatusLoading(false);
            return null;
          }
          const row = data as typeof data & { idn_show_id?: string | null };
          const enabled = !!row.is_live;
          let wasOff = false;
          setStatus(prev => {
            wasOff = !prev?.enabled;
            return {
              enabled, title: row.title || 'Live', type: row.live_type || 'm3u8',
              require_password: row.live_require_password !== false,
              sources: [],
              lineup: Array.isArray(row.lineup) ? row.lineup : [],
              show_date: row.show_date, show_time: row.show_time,
              image_url: row.image_url || '',
              idn_show_id: row.idn_show_id || '',
              group_link: (row as any).group_link || '',
              group_link_enabled: !!(row as any).group_link_enabled,
              group_link_label: (row as any).group_link_label || 'Join Saluran',
              group_link_note: (row as any).group_link_note || '',
            };
          });
          // Stream URLs are no longer readable from the public table — only the
          // unlock-live edge function returns them. When live just toggled on,
          // silently re-call unlock to refresh url/sources.
          setUnlocked(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              enabled,
              title: data.title || prev.title,
              type: (data.live_type as SrcType) || prev.type,
            };
          });
          if (enabled && wasOff) {
            const t = search.get('t');
            const mt = search.get('mtoken');
            const mp = search.get('mp') || search.get('mpassword') || '';
            if (adminMonitor) void doUnlock({ admin_monitor: true }, true);
            else if (t) void doUnlock({ token: t }, true);
            else if (mt) void doUnlock({ mtoken: mt, mpassword: mp }, true);
            // For password-cached users, URL/sources were fetched at initial unlock.
          }
          setStatusLoading(false);
          return data;
        });
    }
    // Link membership tanpa ?show sedang menunggu show terbaru dari unlock-live.
    // Jangan baca konfigurasi legacy yang dapat memberi status OFF palsu.
    if (search.get('mtoken')) {
      setStatusLoading(false);
      return Promise.resolve(null);
    }
    return supabase.rpc('get_live_status').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setStatus(row ? {
        enabled: !!row.enabled, title: row.title || 'Live', type: row.type || 'm3u8',
        require_password: row.require_password !== false,
        sources: toPublicSources(row.sources),
        lineup: Array.isArray(row.lineup) ? row.lineup : [],
      } : { enabled: false, title: 'Live', type: 'm3u8', require_password: true, sources: [], lineup: [] });
      setStatusLoading(false);
      return row;
    });
  };

  const reasonMessage = (reason?: string): string => {
    switch (reason) {
      case 'blocked': return 'Perangkat ini telah diblokir oleh admin.';
      case 'maintenance': return 'Website dalam perbaikan.';
      case 'device_limit': return 'Token ini sudah terikat ke perangkat lain. Pakai link/sandi ulang di perangkat lama, atau hubungi admin untuk reset.';
      case 'no_device': return 'ID perangkat tidak terdeteksi. Aktifkan penyimpanan browser lalu muat ulang halaman.';
      case 'bad_password': return 'Sandi yang dimasukkan salah. Coba lagi.';
      case 'bad_membership_password': return 'Sandi membership salah. Periksa kembali sandi Anda.';
      case 'revoked': return 'Token sudah dicabut oleh admin dan tidak dapat dipakai lagi.';
      case 'token_not_found': return 'Token tidak ditemukan. Periksa kembali link akses yang Anda terima.';
      case 'wrong_show': return 'Token ini bukan untuk show yang sedang Anda buka. Pakai link sesuai show yang dibeli.';
      case 'expired': return 'Token sudah kedaluwarsa. Silakan beli ulang atau hubungi admin.';
      case 'single_use_consumed': return 'Token sekali pakai ini sudah digunakan di perangkat lain dan tidak bisa dipakai lagi di sini.';
      case 'not_started': return 'Membership belum aktif (belum mencapai waktu mulai).';
      case 'scope': return 'Membership ini tidak mencakup akses replay.';
      case 'off': return 'Live belum aktif.';
      case 'password_or_token_required': return 'Masukkan sandi atau gunakan link token.';
      case 'multi_device_no_reset': return 'Membership multi-device/publik tidak dapat direset manual.';
      case 'quota_exhausted': return 'Kuota reset manual sudah habis.';
      case 'membership_paused': return 'Akses membership sedang dijeda oleh admin.';
      default: return 'Gagal membuka akses live. Coba muat ulang halaman atau hubungi admin.';
    }
  };


  const doUnlock = async (opts: { token?: string; password?: string; mtoken?: string; mpassword?: string; admin_monitor?: boolean }, silent = false) => {
    if (!silent) { setSubmitting(true); setPwError(''); }
    try {
      const { data } = await supabase.functions.invoke('unlock-live', {
        body: { ...opts, browser_id: getBrowserId(), show_id: showId || undefined, silent },
      });
      // Sandi membership per user diketik langsung: simpan & pindah ke jalur link membership
      // agar perangkat ini selalu otomatis masuk live/replay tanpa sandi lagi.
      if (!opts.mtoken && data?.membership_token) {
        saveMembershipCredentials(String(data.membership_token), String(data.membership_password || ''));
        const params = new URLSearchParams();
        params.set('mtoken', String(data.membership_token));
        params.set('mp', String(data.membership_password || ''));
        // Muat ulang penuh agar alur link membership berjalan dari awal.
        window.location.replace(`/live?${params.toString()}`);
        return;
      }
      if (data?.valid) {
        // Membership selalu mengikuti show live terbaru yang di-resolve server.
        // Link lama dari admin/reseller bisa masih membawa ?show= milik show lama;
        // ganti parameter itu tanpa mengubah token/sandi agar tidak tampil "selesai".
        const serverShowId = data.show_id ? String(data.show_id) : '';
        const currentResolvedId = showId || resolvedShowIdRef.current;
        const showSwitched = !!serverShowId && !!currentResolvedId && serverShowId !== currentResolvedId;
        if (opts.mtoken && serverShowId && showId !== serverShowId) {
          resolvedShowIdRef.current = serverShowId;
          setResolvedShowId(serverShowId);
          const params = new URLSearchParams(search);
          params.set('show', serverShowId);
          navigate(`/live?${params.toString()}`, { replace: true });
        } else if (!showId && serverShowId) {
          resolvedShowIdRef.current = serverShowId;
          setResolvedShowId(serverShowId);
        }
        // Pembeli anon yang membuka link token dari WhatsApp: simpan token
        // supaya kartu show di beranda langsung menampilkan tombol "Tonton".
        try {
          const sidForPurchase = showId || serverShowId;
          if (opts.token && sidForPurchase) {
            setShowPurchase(sidForPurchase, { token: String(opts.token), kind: 'show', paidAt: Date.now() });
            window.dispatchEvent(new Event('replaytime-purchases-updated'));
          }
        } catch { /* ignore */ }
        const cfg: UnlockedConfig = {
          title: data.title,
          type: isSrcType(data.type) ? data.type : 'm3u8',
          url: data.url || '',
          sources: toPrivateSources(data.sources),
          watermark: adminMonitor ? '' : (data.watermark || ''),
          enabled: !!data.enabled,
          idn_show_id: data.idn_show_id || '',
          server2_url: data.server2_url || '',
          server3_url: data.server3_url || '',
          grant: data.grant || '',
        };
        // For silent revalidation, NEVER overwrite the existing player URL/sources.
        // Doing so would change the React key on the player and remount it, restarting the live stream from the beginning.
        if (silent && showSwitched) {
          // Show berganti (misal admin memulai live show berikutnya): pakai
          // konfigurasi baru sepenuhnya supaya membership langsung ikut live terbaru.
          setUnlocked(cfg);
          try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(cfg)); } catch { /* ignore */ }
        } else if (silent) {
          // Refresh metadata + flip enabled, and adopt new URL/sources only when current is empty
          // (avoid remounting the player mid-stream).
          setUnlocked(prev => {
            if (!prev) return cfg;
            const next = { ...prev, enabled: cfg.enabled, title: cfg.title, type: cfg.type };
            if (cfg.idn_show_id) next.idn_show_id = cfg.idn_show_id;
            next.server2_url = cfg.server2_url || '';
            next.server3_url = cfg.server3_url || '';
            if (cfg.grant) next.grant = cfg.grant;
            if (!prev.url && cfg.url) next.url = cfg.url;
            // Merge playlist sources by URL: keep existing entries (so the
            // active player tidak remount), append baru, dan refresh label.
            // Hasilnya playlist baru yang ditambah admin langsung muncul
            // sebagai chip tambahan secara realtime tanpa memutus live.
            const prevSrcs = Array.isArray(prev.sources) ? prev.sources : [];
            const newSrcs = Array.isArray(cfg.sources) ? cfg.sources : [];
            if (newSrcs.length) {
              const byUrl = new Map(newSrcs.map(s => [s.url, s]));
              const merged = prevSrcs.map(s => {
                const fresh = byUrl.get(s.url);
                return fresh ? { ...s, label: fresh.label || s.label, type: fresh.type || s.type } : s;
              });
              const existingUrls = new Set(prevSrcs.map(s => s.url));
              for (const s of newSrcs) {
                if (!existingUrls.has(s.url)) merged.push(s);
              }
              next.sources = merged;
            }
            try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        } else {
          setUnlocked(cfg);
          try { sessionStorage.setItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`, JSON.stringify(cfg)); } catch { /* ignore */ }
        }
        if (data.membership) {
          setMembership(data.membership as MembershipInfo);
          if (opts.mtoken) saveMembershipCredentials(opts.mtoken, opts.mpassword || '');
        }
        if (data.token_kind || data.max_devices) {
          setTokenInfo({ kind: String(data.token_kind || 'personal'), max_devices: Number(data.max_devices || 1) });
        }
        
      } else if (silent) {
        // Only kick on hard security reasons. Other transient/server errors must NOT log user out.
        const reason = data?.reason;
        if (reason === 'revoked' || reason === 'blocked' || reason === 'maintenance') {
          setUnlocked(null);
          setMembership(null);
          if (reason === 'revoked') clearMembershipCredentials();
          try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
          navigate(`/kunci?reason=${reason}${showId ? `&show=${showId}` : ''}`, { replace: true });
        } else if (reason === 'membership_paused') {
          // Hard-kick player but stay on page to surface the pause notice
          setUnlocked(null);
          setPwError(data?.pause_message?.trim() || reasonMessage('membership_paused'));
        } else if (reason === 'device_limit' && data?.soft !== true) {
          // Token 1-perangkat: setelah user melakukan reset di perangkat baru, ikatan
          // perangkat lama dihapus. Perangkat lama harus benar-benar dikeluarkan.
          // Konfirmasi ulang dulu (4 detik) agar tidak salah-kick karena race sesaat.
          await new Promise((r) => setTimeout(r, 4000));
          const { data: recheck } = await supabase.functions.invoke('unlock-live', {
            body: { ...opts, browser_id: getBrowserId(), show_id: showId || undefined, silent: true },
          });
          if (recheck?.valid !== true && recheck?.reason === 'device_limit') {
            setUnlocked(null);
            setMembership(null);
            try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
            navigate(`/kunci?reason=device_limit${showId ? `&show=${showId}` : ''}`, { replace: true });
          }
        }
        // off / network: ignore silently — keep user inside.

      } else {
        if (data?.reason === 'membership_paused') {
          setPwError(data?.pause_message?.trim() || reasonMessage('membership_paused'));
        } else {
          setPwError(reasonMessage(data?.reason));
        }
        // Untuk device_limit, cek kuota reset manual baik untuk token show (?t=) maupun membership (?mtoken=).
        if (data?.reason === 'device_limit') {
          const tParam = search.get('t');
          const mtParam = search.get('mtoken');
          const mpParam = search.get('mp') || search.get('mpassword') || '';
          try {
            if (tParam) {
              const { data: peek } = await supabase.functions.invoke('show-token-self-reset', {
                body: { token: tParam, browser_id: getBrowserId(), peek: true },
              });
              if (peek?.ok) setResetInfo({ remaining: Number(peek.remaining || 0), max: Number(peek.max || 3), eligible: peek.eligible !== false });
              else setResetInfo({ remaining: 0, max: 0, eligible: false });
            } else if (mtParam && mpParam) {
              const { data: peek } = await supabase.functions.invoke('membership-self-reset', {
                body: { mtoken: mtParam, mpassword: mpParam, browser_id: getBrowserId(), peek: true },
              });
              if (peek?.ok) setResetInfo({ remaining: Number(peek.remaining || 0), max: Number(peek.max || 3), eligible: peek.eligible !== false });
              else setResetInfo({ remaining: 0, max: 0, eligible: false });
            } else setResetInfo(null);
          } catch { setResetInfo(null); }
        } else {
          setResetInfo(null);
        }
      }


    } catch {
      if (!silent) setPwError('Gagal terhubung ke server.');
    }
    if (!silent) setSubmitting(false);
  };

  const doSelfResetToken = async () => {
    const tParam = search.get('t');
    if (!tParam) return;
    if (!confirm('Reset token ini? Perangkat lain yang sedang memakai token akan otomatis keluar, dan token hanya akan berlaku di perangkat ini.')) return;
    setResetting(true);
    try {
      const { data } = await supabase.functions.invoke('show-token-self-reset', {
        body: { token: tParam, browser_id: getBrowserId() },
      });
      if (data?.ok) {
        setResetInfo({ remaining: Number(data.remaining || 0), max: Number(data.max || 3), eligible: Number(data.remaining || 0) > 0 });
        setPwError('');
        await doUnlock({ token: tParam });
      } else {
        const reason = data?.reason as string | undefined;
        const msg = reason === 'multi_device_no_reset' ? 'Token multi-device tidak bisa direset manual.'
          : reason === 'quota_exhausted' ? 'Kuota reset manual sudah habis. Hubungi admin untuk reset.'
          : reason === 'single_use_no_reset' ? 'Token sekali pakai tidak bisa direset.'
          : reason === 'expired' ? 'Token sudah kedaluwarsa.'
          : reason === 'revoked' ? 'Token sudah dicabut.'
          : 'Gagal reset token. Coba lagi atau hubungi admin.';
        setPwError(msg);
        setResetInfo({ remaining: Number(data?.remaining || 0), max: Number(data?.max || 0), eligible: false });
      }
    } catch {
      setPwError('Gagal terhubung ke server saat reset token.');
    }
    setResetting(false);
  };


  useEffect(() => {
    fetchStatus();
    const tParam = search.get('t');
    const mtParam = search.get('mtoken');
    if (adminMonitor && showId) { void doUnlock({ admin_monitor: true }, true); return; }
    // Sandi dibawa dari Website A (halaman Kunci) saat pindah domain.
    const pwParam = search.get('pw');
    if (pwParam && !tParam && !mtParam) {
      const next = new URLSearchParams(search); next.delete('pw');
      window.history.replaceState({}, '', `/live${next.toString() ? `?${next}` : ''}`);
      void doUnlock({ password: pwParam });
    }
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`);
      if (cached) setUnlocked(JSON.parse(cached));
    } catch { /* ignore */ }

    // Refresh cached unlock immediately so old sessionStorage (saved before IDN Show ID
    // existed in the payload) does not leave the IDN tab stuck with an empty idn:// URL.
    if (cached) {
      const mp = search.get('mp') || search.get('mpassword') || '';
      if (mtParam) void doUnlock({ mtoken: mtParam, mpassword: mp }, true);
      else if (tParam) void doUnlock({ token: tParam }, true);
    }

    // If a token (membership or personal) is provided without a specific show,
    // redirect to the currently-live active show — or, if none is live, to the
    // nearest UPCOMING active show so membership users still see a countdown.
    if (!showId && (tParam || mtParam)) {
      void (async () => {
        const { data: liveRow } = await supabase.from('active_shows')
          .select('id').eq('is_active', true).eq('is_live', true)
          .order('show_date', { ascending: false }).order('show_time', { ascending: false })
          .limit(1).maybeSingle();
        let targetId = liveRow?.id as string | undefined;
        if (!targetId) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: upcoming } = await supabase.from('active_shows')
            .select('id,show_date,show_time').eq('is_active', true)
            .gte('show_date', today)
            .order('show_date', { ascending: true })
            .order('show_time', { ascending: true })
            .limit(1).maybeSingle();
          targetId = upcoming?.id;
        }
        if (targetId) {
          const params = new URLSearchParams(search);
          params.set('show', targetId);
          navigate(`/live?${params.toString()}`, { replace: true });
        }
      })();
    }

    // Gate: if no token URL and no cached unlock, send user to the dedicated /kunci page.
    if (!tParam && !mtParam && !cached) {
      navigate(`/kunci${showId ? `?show=${showId}` : ''}`, { replace: true });
      return;
    }

    // Scope realtime subscriptions narrowly to reduce server load with many concurrent users.
    const bid = getBrowserId();
    const cfgChannel = showId
      ? supabase.channel(`live-cfg:${showId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_shows', filter: `id=eq.${showId}` }, () => {
            fetchStatus();
            // Playlist/sources hanya bisa diambil via edge function unlock-live.
            // Panggil silent agar chip playlist baru langsung muncul tanpa remount player.
            if (tParam) void doUnlock({ token: tParam }, true);
            else if (mtParam) void doUnlock({ mtoken: mtParam, mpassword: search.get('mp') || search.get('mpassword') || '' }, true);
            else if (unlocked) void doUnlock({}, true);
          })
          .subscribe()
      : supabase.channel('live-cfg:global')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_config_private' }, () => { fetchStatus(); })
          .subscribe();

    const tokChannel = supabase.channel(`live-blk:${bid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_browsers', filter: `browser_id=eq.${bid}` }, () => {
        if (tParam) void doUnlock({ token: tParam }, true);
        else if (unlocked) {
          setUnlocked(null);
          try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
          navigate(`/kunci?reason=blocked${showId ? `&show=${showId}` : ''}`, { replace: true });
        }
      })
      .subscribe();

    // Realtime kick: jika admin DELETE / UPDATE (revoked) token user, langsung paksa keluar.
    const kickOut = (reason: 'revoked' | 'token_not_found') => {
      try { sessionStorage.removeItem(`${SS_KEY_BASE}${showId?'-'+showId:''}`); } catch { /* ignore */ }
      clearMembershipCredentials();
      setUnlocked(null);
      navigate(`/kunci?reason=${reason}${showId ? `&show=${showId}` : ''}`, { replace: true });
    };
    const showTokChannel = tParam
      ? supabase.channel(`live-tok:${tParam.slice(0, 16)}`)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'active_show_tokens', filter: `token=eq.${tParam}` }, () => kickOut('token_not_found'))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_show_tokens', filter: `token=eq.${tParam}` }, (payload: any) => {
            if (payload?.new?.revoked) kickOut('revoked');
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'active_show_token_devices', filter: `browser_id=eq.${bid}` }, () => {
            // Device user dihapus admin → revalidate; jika sudah tidak boleh, akan dilempar ke /kunci.
            if (tParam) void doUnlock({ token: tParam }, true);
          })
          .subscribe()
      : null;
    const memTokChannel = mtParam
      ? supabase.channel(`live-mtok:${mtParam.slice(0, 16)}`)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'membership_tokens', filter: `token=eq.${mtParam}` }, () => kickOut('token_not_found'))
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'membership_tokens', filter: `token=eq.${mtParam}` }, (payload: any) => {
            if (payload?.new?.revoked) kickOut('revoked');
          })
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'membership_token_devices', filter: `browser_id=eq.${bid}` }, () => {
            void doUnlock({ mtoken: mtParam, mpassword: search.get('mp') || search.get('mpassword') || '' }, true);
          })
          .subscribe()
      : null;

    // Fallback revalidate (~2 menit) jika websocket realtime terputus.
    // Jitter ±30s supaya 1000 viewer tidak menembak server bersamaan.
    const jitter = (base: number, spread: number) => base + Math.floor(Math.random() * spread);
    const revalidate = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (tParam) void doUnlock({ token: tParam }, true);
      else if (mtParam) void doUnlock({ mtoken: mtParam, mpassword: search.get('mp') || search.get('mpassword') || '' }, true);
    }, jitter(120000, 60000));

    // Status fallback: realtime UPDATE channel already covers admin changes instantly.
    const statusPoll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchStatus();
    }, jitter(300000, 120000));


    return () => {
      window.clearInterval(revalidate);
      window.clearInterval(statusPoll);
      supabase.removeChannel(cfgChannel);
      supabase.removeChannel(tokChannel);
      if (showTokChannel) supabase.removeChannel(showTokChannel);
      if (memTokChannel) supabase.removeChannel(memTokChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (effectiveShowId) void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShowId]);

  // Membership tanpa ?show: pantau show mana yang sedang LIVE. Kalau admin
  // memulai live di show lain, ikuti show tersebut (jangan tersangkut di show lama).
  useEffect(() => {
    if (showId) return;
    const mt = search.get('mtoken');
    if (!mt) return;
    const mp = search.get('mp') || search.get('mpassword') || '';
    let stopped = false;
    const follow = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.from('active_shows')
        .select('id').eq('is_active', true).eq('is_live', true)
        .order('show_date', { ascending: false }).order('show_time', { ascending: false })
        .limit(1).maybeSingle();
      const liveId = data?.id ? String(data.id) : '';
      if (stopped || !liveId || liveId === resolvedShowIdRef.current) return;
      await doUnlock({ mtoken: mt, mpassword: mp }, true);
      void fetchStatus();
    };
    void follow();
    // Jitter 45–90 dtk: dengan ribuan penonton, polling serentak dihindari.
    const iv = window.setInterval(() => { void follow(); }, 45000 + Math.floor(Math.random() * 45000));

    const onVis = () => { if (document.visibilityState === 'visible') void follow(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { stopped = true; window.clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, search]);

  // Membership tanpa ?show: ikuti perubahan show hasil resolve secara realtime
  // agar status live/jadwal selalu yang terbaru (bukan show yang sudah selesai).
  useEffect(() => {
    if (showId || !resolvedShowId) return;
    const ch = supabase.channel(`live-cfg-resolved:${resolvedShowId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_shows', filter: `id=eq.${resolvedShowId}` }, () => { void fetchStatus(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, resolvedShowId]);

  useEffect(() => {
    const t = search.get('t');
    const mt = search.get('mtoken');
    const mp = search.get('mp') || search.get('mpassword') || '';
    if (unlocked || statusLoading) return;
    if (mt) void doUnlock({ mtoken: mt, mpassword: mp });
    else if (t) void doUnlock({ token: t });
  }, [search, statusLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelfReset = async () => {
    const mt = search.get('mtoken') || prompt('Masukkan token membership:') || '';
    if (!mt) return;
    const mp = search.get('mp') || search.get('mpassword') || prompt('Masukkan sandi membership:') || '';
    if (!mp) return;
    if (!confirm('Reset perangkat akan memutus akses dari perangkat lama dan menggunakan 1 kuota reset manual. Lanjutkan?')) return;
    try {
      const { data } = await supabase.functions.invoke('membership-self-reset', {
        body: { mtoken: mt, mpassword: mp, browser_id: getBrowserId() },
      });
      if (data?.ok) {
        setPwError('');
        if (typeof data.used === 'number' && typeof data.max === 'number') {
          setMembership((prev) => prev ? { ...prev, resets_used: data.used, resets_max: data.max, remaining: data.remaining } : prev);
        }
        alert(`Perangkat berhasil direset. Sisa kuota reset manual: ${data.remaining}/${data.max}.`);
        // Re-unlock with new device
        void doUnlock({ mtoken: mt, mpassword: mp });
      } else {
        alert(`Reset gagal: ${reasonMessage(data?.reason)}`);
      }
    } catch {
      alert('Gagal terhubung ke server.');
    }
  };

  const allSources = useMemo<PrivateSource[]>(() => {
    if (!unlocked) return [];
    const list: PrivateSource[] = [];
    const idnShowId = status?.idn_show_id || unlocked.idn_show_id || '';
    const main: PrivateSource = { label: 'Player Utama', type: unlocked.type, url: unlocked.url };
    // URL langsung (mis. worker playback) diputar apa adanya oleh player tanpa
    // perlu token dari edge function, jadi ditaruh paling depan bila tersedia.
    const mainIsDirect = /^https?:\/\//i.test(main.url || '');
    if (mainIsDirect) list.push(main);
    // IDN/hanabira tetap tersedia sebagai sumber (aturan tidak diubah).
    if (idnShowId) list.push({ label: 'IDN', type: 'm3u8', url: `idn://${idnShowId}` });
    // Server 2: link m3u8 langsung dari admin, diputar tanpa proxy/token.
    const s2 = (unlocked.server2_url || '').trim();
    if (/^https?:\/\//i.test(s2)) list.push({ label: 'Server 2', type: 'm3u8', url: s2 });
    // Server 3: master-final SForge (cadangan), juga langsung tanpa proxy.
    const s3 = (unlocked.server3_url || '').trim();
    if (/^https?:\/\//i.test(s3) && s3 !== s2) list.push({ label: 'Server 3', type: 'm3u8', url: s3 });
    if (main.url && !mainIsDirect) list.push(main);
    list.push(...(unlocked.sources || []).filter(s => s.url));
    return list;
  }, [unlocked, status?.idn_show_id]);

  useEffect(() => {
    setFailedSourceKeys([]);
  }, [unlocked?.url, unlocked?.sources]);

  // CORS guard: the IDN/hanabira worker only whitelists `realtime48stream.my.id`
  // (tanpa www, tanpa preview, tanpa replaytime.lovable.app). Saat player IDN
  // aktif dan user membuka via origin lain, browser memblokir preflight →
  // player terjebak di memuat. Redirect ke domain canonical agar playback jalan.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname;
    const CANONICAL = 'realtime48show.my.id';
    if (host === CANONICAL) return;
    // Biarkan dev lokal & preview editor apa adanya (jangan loop redirect).
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return;
    if (host.startsWith('id-preview--') || host.endsWith('.lovableproject.com')) return;
    const target = `https://${CANONICAL}${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(target);
  }, []);


  const safeIdx = Math.min(sourceIdx, Math.max(0, allSources.length - 1));
  const activeSource = allSources[safeIdx];
  const activeSourceUrl = activeSource?.url || '';
  const sourceKey = (source: PrivateSource, index: number) => `${index}:${source.type}:${source.url}`;

  // Resolve IDN stream: frontend langsung fetch token ke hanabira48, lalu jadikan HEADER
  // untuk request playback. Tidak via edge function — domain sudah whitelist.
  const [idnResolved, setIdnResolved] = useState<{ key: string; url: string; headers: Record<string, string> } | null>(null);
  const [idnError, setIdnError] = useState<string>('');
  const [idnRetryNonce, setIdnRetryNonce] = useState(0);
  const idnAuthRefreshRef = useRef<(() => void) | null>(null);
  const handleIdnAuthError = useCallback(() => { idnAuthRefreshRef.current?.(); }, []);
  const idnGrant = unlocked?.grant || '';
  const liveOn = status ? !!status.enabled : !!unlocked?.enabled;
  useEffect(() => {
    // Live dimatikan admin → hentikan total pencarian sumber (jangan minta token IDN lagi).
    if (!liveOn) { setIdnResolved(null); setIdnError(''); return; }
    if (!activeSourceUrl.startsWith('idn://')) { setIdnError(''); return; }
    if (!idnGrant) {
      setIdnResolved(null);
      setIdnError('Sesi akses belum siap. Muat ulang halaman atau masukkan ulang sandi/token.');
      return;
    }
    const idnId = activeSourceUrl.slice('idn://'.length);
    if (!idnId) {
      setIdnResolved(null);
      setIdnError('IDN Show ID belum diatur admin. Hubungi admin untuk mengaktifkan stream IDN.');
      return;
    }
    const key = `idn:${idnId}`;
    let cancelled = false;
    let refreshTimer: number | null = null;
    setIdnError('');
    setIdnResolved(prev => prev?.key === key ? prev : null);
    const refreshIdnToken = async (initial = false) => {
      try {
        const { data, error } = await supabase.functions.invoke('idn-stream-token', {
          body: { showId: idnId },
          headers: { Authorization: `Bearer ${idnGrant}` },
        });
        if (error) throw new Error(error.message || 'Gagal memanggil server token');
        const j = (data || {}) as IdnTokenResponse;
        if (j?.error) throw new Error(j.error);
        const xApiToken = String(j.xApiToken || '');
        const xSecKey = String(j.xSecKey || '');
        const xTokenId = String(j.xTokenId || '');
        const xShowId = String(j.xShowId || idnId);
        const playbackUrl = String(j.playbackUrl || '');
        if (!xApiToken || !xSecKey || !xTokenId || !playbackUrl) {
          throw new Error('Respon token IDN tidak lengkap');
        }
        const nextHeaders = {
          'x-api-token': xApiToken,
          'x-sec-key': xSecKey,
          'x-showid': xShowId,
          'x-token-id': xTokenId,
        } as Record<string, string>;

        if (cancelled) return;
        // Jangan jadikan manifest live sebagai Blob statis: playlist IDN harus
        // di-refresh terus oleh hls.js lewat worker. Src tetap playbackUrl yang
        // sama, sedangkan headers diganti di ref HlsPlayer sehingga segmen baru
        // memakai token terbaru tanpa remount/restart.
        setIdnError('');
        setIdnResolved((prev) => {
          if (!prev || initial || prev.key !== key || prev.url !== playbackUrl) {
            return { key, url: playbackUrl, headers: nextHeaders };
          }
          return { ...prev, headers: nextHeaders };
        });
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : '';
        const stale = /non-2xx|401|403|unauthorized|akses_ditolak|grant_mismatch/i.test(raw);
        if (stale) {
          // Sesi TV (kode 6 angka): perbarui grant diam-diam supaya tayangan lanjut.
          const fresh = getTvSession() ? await renewTvGrant(showId) : '';
          if (fresh) {
            setUnlocked(prev => (prev ? { ...prev, grant: fresh } : prev));
            return;
          }
          // Grant kedaluwarsa/berubah format: minta grant baru diam-diam.
          setUnlocked(prev => (prev ? { ...prev, grant: '' } : prev));
        }
        const message = stale ? 'Sesi akses kedaluwarsa. Memuat ulang akses…' : raw;
        if (!cancelled && initial) setIdnError(message || 'Gagal mengambil token IDN. Pastikan domain ini di-whitelist worker.');
      }

    };
    void refreshIdnToken(true);
    // Aturan HANABIRA48: token 90 detik → rotasi tiap 60 detik. HP sering
    // memperlambat timer saat layar mati/tab di belakang, jadi juga perbarui
    // saat kembali ke tab dan saat pemutar menerima 401/403.
    let lastRefresh = Date.now();
    const doRefresh = () => { lastRefresh = Date.now(); void refreshIdnToken(false); };
    refreshTimer = window.setInterval(doRefresh, IDN_TOKEN_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 20_000) doRefresh();
    };
    document.addEventListener('visibilitychange', onVis);
    idnAuthRefreshRef.current = () => { if (Date.now() - lastRefresh > 4_000) doRefresh(); };
    return () => {
      cancelled = true;
      if (refreshTimer) window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', onVis);
      idnAuthRefreshRef.current = null;
    };
  }, [activeSourceUrl, idnRetryNonce, idnGrant, liveOn, showId]);

  // Browser TV yang masuk lewat kode 6 angka: rotasi grant tiap 28 menit supaya
  // bisa menonton siaran penuh tanpa jeda dan tanpa memasukkan kode lagi.
  useEffect(() => {
    if (!getTvSession()) return;
    const id = window.setInterval(async () => {
      const fresh = await renewTvGrant(showId);
      if (fresh) setUnlocked(prev => (prev ? { ...prev, grant: fresh } : prev));
    }, TV_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [showId]);


  const selectSource = (i: number) => {
    setSourceIdx(i);
  };
  // Pilihan manual penonton: beri kesempatan ulang walau server itu sempat gagal.
  const pickSource = (i: number) => {
    const s = allSources[i];
    if (s) { const k = sourceKey(s, i); setFailedSourceKeys(prev => prev.filter(x => x !== k)); }
    setSourceIdx(i);
  };

  const handleSourceFatalError = () => {
    const failedKey = activeSource ? sourceKey(activeSource, safeIdx) : '';
    setFailedSourceKeys(prev => failedKey && !prev.includes(failedKey) ? [...prev, failedKey] : prev);
    const next = allSources.findIndex((source, index) => index !== safeIdx && !failedSourceKeys.includes(sourceKey(source, index)));
    if (next >= 0) selectSource(next);
  };

  // IDN butuh header kustom (hanya lewat hls.js/MSE). iPhone tanpa MSE → langsung
  // pindah. Hitungan 5 detik baru dimulai setelah sesi akses (grant) siap, dan
  // proses perbarui akses tidak dianggap gagal.
  const idnReady = !!idnResolved && idnResolved.key === `idn:${activeSourceUrl.slice('idn://'.length)}`;
  useEffect(() => {
    if (!liveOn || !activeSourceUrl.startsWith('idn://') || allSources.length < 2) return;
    const w = window as unknown as { MediaSource?: unknown; ManagedMediaSource?: unknown };
    if (!w.MediaSource && !w.ManagedMediaSource) { handleSourceFatalError(); return; }
    if (!idnGrant || idnReady) return;
    const t = window.setTimeout(() => handleSourceFatalError(), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceUrl, idnReady, idnGrant, liveOn, allSources.length]);

  // Gagal mengambil kunci IDN (bukan sekadar perbarui akses) → langsung pindah server.
  useEffect(() => {
    if (!liveOn || !activeSourceUrl.startsWith('idn://') || allSources.length < 2) return;
    if (!idnError || /Memuat ulang akses/i.test(idnError)) return;
    const t = window.setTimeout(() => handleSourceFatalError(), 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idnError, activeSourceUrl, liveOn, allSources.length]);


  // ON AIR hanya saat admin manual mengaktifkan toggle is_live di admin panel.
  // Sumber kebenaran adalah baris `active_shows` terbaru (status). Cache unlock
  // di sessionStorage bisa basi, jadi jangan dipakai untuk menahan status live.
  const liveActive = status ? !!status.enabled : !!unlocked?.enabled;
  // Pernah ON AIR di sesi ini → saat admin mematikan live, tampilkan "Live Telah Selesai".
  const wasLiveRef = useRef(false);
  const [liveEnded, setLiveEnded] = useState(false);
  const liveEndedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ganti show (membership mengikuti live terbaru) → status "selesai" direset.
  useEffect(() => { wasLiveRef.current = false; setLiveEnded(false); }, [effectiveShowId]);
  useEffect(() => {
    if (liveActive) {
      wasLiveRef.current = true;
      setLiveEnded(false);
      if (liveEndedTimerRef.current) { clearTimeout(liveEndedTimerRef.current); liveEndedTimerRef.current = null; }
      return;
    }
    // Jangan langsung latch "selesai" pada pembacaan false pertama — beri grace
    // 8 detik agar network blip / fetch error sesaat tidak menampilkan layar selesai.
    if (wasLiveRef.current && !liveEndedTimerRef.current) {
      liveEndedTimerRef.current = setTimeout(() => { setLiveEnded(true); liveEndedTimerRef.current = null; }, 8000);
    }
    return () => { if (liveEndedTimerRef.current) { clearTimeout(liveEndedTimerRef.current); liveEndedTimerRef.current = null; } };
  }, [liveActive]);

  useEffect(() => {
    // Chat realtime dimuat hanya saat area chat mendekati layar agar bandwidth/CPU tetap diprioritaskan ke player.
    if (!unlocked) { setChatReady(false); return; }
    if (!liveActive) {
      const delay = window.setTimeout(() => setChatReady(true), 1200);
      return () => window.clearTimeout(delay);
    }
    const node = chatHostRef.current;
    if (!node) return;
    let delay: number | null = null;
    if (typeof IntersectionObserver === 'undefined') {
      delay = window.setTimeout(() => setChatReady(true), playbackPriorityMode ? 60000 : 30000);
      return () => { if (delay) window.clearTimeout(delay); };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      delay = window.setTimeout(() => setChatReady(true), playbackPriorityMode ? 5000 : 1200);
      observer.disconnect();
    }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (delay) window.clearTimeout(delay);
    };
  }, [unlocked, liveActive, playbackPriorityMode]);

  // ============ VIEWER COUNTER (presence) — count unique browser_id ============
  // Channel dibagi dengan halaman /free supaya angka penonton menggabungkan
  // penonton gratis dan berbayar untuk show yang sama.
  const showKey = resolvedShowId || search.get('show') || 'global';
  const viewerCount = useViewerCount(showKey, liveActive);


  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className={`sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3 transition-all duration-300 ${navVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {liveActive ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-500 text-[10px] font-bold uppercase tracking-wider">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
              </span>
              ON AIR
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              OFF AIR
            </span>
          )}
        </div>
      </div>

      <div className="w-full max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 pb-28 sm:pb-32 space-y-3">
        {statusLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
        ) : !unlocked && pwError ? (
          <div className="mx-auto max-w-md w-full rounded-2xl border border-destructive/40 bg-destructive/10 p-5 sm:p-6 space-y-4 text-center">
            <div className="text-3xl">⚠️</div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Tidak bisa membuka live</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{pwError}</p>

            {resetInfo && resetInfo.max > 0 && (
              <div className={`rounded-lg border-2 p-3 text-left space-y-1.5 ${resetInfo.remaining > 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-destructive/50 bg-destructive/10'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${resetInfo.remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}>
                    Kesempatan reset
                  </span>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${resetInfo.remaining > 0 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-destructive/20 text-destructive'}`}>
                    {resetInfo.remaining}/{resetInfo.max}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {resetInfo.remaining > 0
                    ? <>Ingin ganti perangkat? Klik tombol <b>Reset Token Link</b> di bawah. Perangkat lama otomatis keluar dan token hanya aktif di perangkat ini.</>
                    : <>Kuota reset manual sudah habis ({resetInfo.max}×). Hubungi admin untuk bantuan pindah perangkat.</>}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {resetInfo && resetInfo.max > 0 && resetInfo.remaining > 0 ? (
                <Button
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2"
                  disabled={resetting}
                  onClick={() => { const mt = search.get('mtoken'); if (mt) void handleSelfReset(); else void doSelfResetToken(); }}
                >
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  {resetting ? 'Mereset…' : `Reset Token Link (${resetInfo.remaining})`}
                </Button>
              ) : (
                <Button variant="outline" className="flex-1" onClick={() => { setPwError(''); setResetInfo(null); const t = search.get('t'); const mt = search.get('mtoken'); const mp = search.get('mp') || search.get('mpassword') || ''; if (mt) void doUnlock({ mtoken: mt, mpassword: mp }); else if (t) void doUnlock({ token: t }); }}>
                  Coba lagi
                </Button>
              )}
              <Button variant="secondary" className="flex-1" onClick={() => navigate(`/kunci${showId ? `?show=${showId}` : ''}`)}>
                Masukkan sandi
              </Button>
              <Button className="flex-1 bg-amber-400 hover:bg-amber-500 text-black" onClick={() => navigate('/')}>Kembali</Button>
            </div>
          </div>

        ) : !unlocked ? (
          // Initial unlock attempt in flight
          <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-primary animate-spin" /></div>
        ) : (
          <>
            {liveActive && activeSource ? (
              <>
                <Suspense fallback={<PlayerFallback />}>
                  {activeSource.url.startsWith('idn://') ? (
                    idnError ? (
                      <div className="aspect-video w-full rounded-2xl bg-destructive/10 border border-destructive/40 flex flex-col items-center justify-center gap-3 p-4 text-center">
                        <div className="text-2xl">⚠️</div>
                        <p className="text-sm text-foreground">Gagal memuat stream IDN: {idnError}</p>
                        <Button size="sm" variant="outline" onClick={() => { setIdnResolved(null); setIdnError(''); void fetchStatus(); setIdnRetryNonce(n => n + 1); }}>Coba lagi</Button>
                      </div>
                    ) : !idnResolved ? (
                      <div className="aspect-video w-full rounded-2xl bg-card/80 border border-border flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      </div>
                    ) : (
                      <HlsPlayer ref={playerRef} key={`idn-${idnResolved.key}`} src={idnResolved.url} headers={idnResolved.headers} title={unlocked.title} watermark={unlocked.watermark} onFatalError={handleSourceFatalError} onAuthError={() => idnAuthRefreshRef.current?.()} onPipChange={handlePipChange} hideSeekButtons showId={effectiveShowId} />
                    )
                  ) : activeSource.type === 'm3u8'
                    ? <HlsPlayer ref={playerRef} key={`m3u8-${safeIdx}`} src={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} onFatalError={handleSourceFatalError} onPipChange={handlePipChange} hideSeekButtons showId={effectiveShowId} />
                    : activeSource.type === 'youtube'
                      ? <div className="live-yt-frame"><EmbedPlayer key={`em-${safeIdx}-${activeSource.type}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} hideSeekButtons isLive /></div>
                      : <EmbedPlayer key={`em-${safeIdx}-${activeSource.type}`} type={activeSource.type} source={activeSource.url} title={unlocked.title} watermark={unlocked.watermark} hideSeekButtons isLive />}
                </Suspense>

                <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                  {viewerCount !== null && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold">
                      <Eye className="w-3.5 h-3.5" />
                      {viewerCount.toLocaleString('id-ID')} menonton
                    </span>
                  )}
                  {unlocked.watermark && (
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {unlocked.watermark}</span>
                  )}
                </div>

                {membership && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-foreground">Membership aktif</div>
                      <div className="text-muted-foreground">
                        {membership.expires_at ? `Berlaku s/d ${new Date(membership.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Tanpa batas waktu'}
                      </div>
                      {(membership.max_devices || 1) <= 1 && (
                        <div className="text-muted-foreground">
                          Reset perangkat: <span className="font-mono text-foreground">{membership.resets_used}/{membership.resets_max}</span> terpakai · Sisa <span className="font-mono text-foreground">{membership.remaining}</span> · Reset bisa dilakukan dari halaman <b>Profil</b>.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {allSources.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {allSources.map((s, i) => (
                      <button
                        key={`${s.type}-${s.url}-${i}`}
                        type="button"
                        onClick={() => pickSource(i)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          i === safeIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-secondary'
                        }`}
                      >
                        {s.label || `Player ${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : liveEnded ? (
              <div className="aspect-video w-full rounded-2xl border border-border bg-card/80 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted/50 border border-border text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                  Off Air
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">Live Telah Selesai</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Siaran {status?.title || unlocked.title || 'live'} telah dihentikan oleh admin. Halaman ini akan otomatis menyala kembali begitu admin mengaktifkan live lagi — tidak perlu muat ulang.
                </p>
              </div>
            ) : (
              <ScheduleCountdown
                title={status?.title || unlocked.title || 'Live'}
                showDate={status?.show_date}
                showTime={status?.show_time}
                imageUrl={status?.image_url}
              />
            )}

            {/* SHOW TITLE + LINEUP */}
            <div className="rounded-2xl bg-card/80 border border-border p-3 sm:p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground font-sans leading-tight flex-1 min-w-0">
                  {status?.title || unlocked?.title || 'Live'}
                </h2>
                {(() => {
                  const d = typeof document !== 'undefined' ? (document as PiPDocument) : null;
                  const supported = !!d && 'pictureInPictureEnabled' in d && !!d.pictureInPictureEnabled;
                  const isHls = liveActive && activeSource && (activeSource.url.startsWith('idn://') || activeSource.type === 'm3u8');
                  if (!supported || !isHls) return null;
                  return (
                    <button
                      type="button"
                      aria-label={pipActive ? 'Tutup Picture in Picture' : 'Picture in Picture'}
                      title={pipActive ? 'Tutup Picture in Picture' : 'Picture in Picture'}
                      onClick={async () => {
                        try {
                          if (pipActive) {
                            await playerRef.current?.exitPip();
                          } else {
                            await playerRef.current?.requestPip();
                          }
                        } catch { /* ignore */ }
                      }}
                      className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border border-border transition-colors ${pipActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground'}`}
                    >
                      <PictureInPicture2 className="w-4 h-4" />
                    </button>
                  );
                })()}
              </div>
              {status?.lineup && status.lineup.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Lineup</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {status.lineup.map((m, i) => (
                      <MemberAvatar key={i} name={m} size={56} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SALURAN / GROUP LINK */}
            {status?.group_link_enabled && !!status?.group_link && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <a
                  href={status.group_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground font-semibold text-sm py-2.5 hover:opacity-90 transition-opacity"
                >
                  <Users className="w-4 h-4" />
                  {status.group_link_label || 'Join Saluran'}
                </a>
                <p className="text-[11px] text-muted-foreground text-center">
                  {status.group_link_note || 'Gabung ke saluran resmi untuk info & update show terbaru.'}
                </p>
              </div>
            )}

            {/* LIVE CHAT */}
            <div ref={chatHostRef}>
              {chatReady ? (
                <Suspense fallback={<ChatFallback />}>
                  <LiveChat lite={playbackPriorityMode} showId={showId || effectiveShowId} />
                </Suspense>
              ) : <ChatIdle />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
