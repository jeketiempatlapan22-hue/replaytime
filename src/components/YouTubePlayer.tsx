import { useReplayDisplay } from '@/hooks/useReplayDisplay';
import { displayShortTitle } from '@/lib/abbrev';
import { ArrowLeft, Maximize, Minimize, Eye, Loader2, Lock, PictureInPicture2, ListVideo, Cast, Copy, MonitorSmartphone, Tv } from 'lucide-react';
import { isFullscreenActive, isVideoFullscreen, onFullscreenChange, requestFs, exitFs, lockLandscape } from '@/lib/fullscreen';


import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type ReplayRow, getReplaySource, type ReplaySource, type PlaylistSource } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import RatingStars from '@/components/RatingStars';
// CommentSection lazy-loaded — chunk komentar baru dimuat saat user scroll/buka.
const CommentSection = lazy(() => import('@/components/CommentSection'));
import TvConnectDialog from '@/components/TvConnectDialog';
import HlsPlayer, { type HlsPlayerHandle } from '@/components/HlsPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';
import DeviceResetButton from '@/components/DeviceResetButton';
import { prefetchM3U8, prefetchYouTube, prefetchCloudflare } from '@/lib/prefetch';
import { useAutoHideOnInteraction } from '@/hooks/useAutoHideOnInteraction';
import { readMembershipCredentials } from '@/lib/membershipAccess';
import { getReplayPurchase, getAllShowPurchases } from '@/lib/purchases';
import { castMediaDetailed, isGoogleCastCapable } from '@/lib/cast';


interface Props {
  replay: ReplayRow;
  onBack: () => void;
}

function buildSources(source: ReplaySource | null, replay: ReplayRow): PlaylistSource[] {
  if (!source) return [];
  const list: PlaylistSource[] = Array.isArray(source.sources) ? [...source.sources] : [];
  // Always append legacy fields as additional sources if they aren't already present
  if (source.m3u8_url && !list.some(s => s.type === 'm3u8' && s.url === source.m3u8_url)) {
    list.push({
      id: 'legacy-m3u8',
      label: list.length === 0 ? 'M3U8' : `M3U8 ${list.filter(s => s.type === 'm3u8').length + 1}`,
      type: 'm3u8',
      url: source.m3u8_url,
      is_default: list.length === 0,
    });
  }
  if (source.youtube_id && !list.some(s => s.type === 'youtube' && s.url === source.youtube_id)) {
    list.push({
      id: 'legacy-yt',
      label: list.length === 0 ? 'YouTube' : `YouTube ${list.filter(s => s.type === 'youtube').length + 1}`,
      type: 'youtube',
      url: source.youtube_id,
      is_default: list.length === 0,
    });
  }
  return list;
}


export default function YouTubePlayer({ replay, onBack }: Props) {
  const { hideTitle } = useReplayDisplay();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTvMenu, setShowTvMenu] = useState(false);
  const [showTvConnect, setShowTvConnect] = useState(false);
  const [tvConnectTab, setTvConnectTab] = useState<'code' | 'mirror'>('code');
  const [castMsg, setCastMsg] = useState('');
  const [castBusy, setCastBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);


  const [viewCount, setViewCount] = useState(replay.view_count ?? 0);
  const [hlsFailed, setHlsFailed] = useState(false);
  const [source, setSource] = useState<ReplaySource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState(false);
  const [lockedToken, setLockedToken] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwChecking, setPwChecking] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const navVisible = useAutoHideOnInteraction(true, 3000);
  
  const hlsPlayerRef = useRef<HlsPlayerHandle>(null);
  const [pipActive, setPipActive] = useState(false);
  const pipSupported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled;

  useEffect(() => {
    setViewCount(replay.view_count ?? 0);
  }, [replay.id, replay.view_count]);

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setSourceLoading(true);
    setHlsFailed(false);
    setNeedsPassword(false);
    setDeviceLimit(false);
    setLockedToken('');
    setPwInput('');
    setPwError('');
    setActiveSourceId(null);

    let password = '';
    let token = '';
    // Riwayat pembelian permanen (localStorage) dipakai sebagai kunci,
    // jadi pembeli tidak perlu memasukkan sandi lagi di sesi/perangkat berikutnya.
    const tokens: string[] = [];
    const pushToken = (t?: string | null) => {
      const v = String(t || '').trim();
      if (v && !tokens.includes(v)) tokens.push(v);
    };
    try {
      password = sessionStorage.getItem(`replaytime-pw-${replay.id}`) || '';
      token = sessionStorage.getItem(`replaytime-tok-${replay.id}`) || '';
      pushToken(token);
      const bought = getReplayPurchase(replay.id);
      pushToken(bought?.token);
      if (!password && bought?.password) password = bought.password;
      // Membership tersimpan di perangkat (link/sandi member pernah dipakai) → langsung buka.
      pushToken(readMembershipCredentials()?.token);
      const url = new URL(window.location.href);
      pushToken(url.searchParams.get('token'));
    } catch { /* ignore */ }

    let wmSource = '';
    try { wmSource = tokens[0] || localStorage.getItem('replaytime-browser-id') || ''; } catch { /* ignore */ }
    setActiveToken(wmSource);

    // Coba semua kredensial yang tersedia (token lalu sandi, atau sebaliknya).
    // Token yang basi/terikat perangkat lain tidak boleh membatalkan sandi yang valid.
    (async () => {
      // Show yang sudah dikonversi jadi replay: token show-nya juga berlaku.
      try {
        const showPurchases = getAllShowPurchases();
        const ids = Object.keys(showPurchases);
        if (ids.length) {
          const { data } = await supabase
            .from('active_shows')
            .select('id,replay_id')
            .eq('replay_id', replay.id)
            .in('id', ids);
          for (const row of (data as any[]) || []) pushToken(showPurchases[(row as any).id]?.token);
        }
      } catch { /* ignore */ }
      if (cancelled) return;

      if (!tokens.length && !password) {
        setSourceLoading(false);
        setNeedsPassword(true);
        return;
      }
      if (!wmSource && tokens[0]) setActiveToken(tokens[0]);

      const attempts: Array<{ kind: 'token' | 'password'; run: () => Promise<Awaited<ReturnType<typeof getReplaySource>>> }> = [];
      for (const t of tokens) attempts.push({ kind: 'token', run: () => getReplaySource(replay.id, { accessToken: t }) });
      if (password) attempts.push({ kind: 'password', run: () => getReplaySource(replay.id, { password }) });

      let lastReason: string | undefined;
      for (const attempt of attempts) {
        const res = await attempt.run();
        if (cancelled) return;
        if (res.data) {
          setSource(res.data);
          setSourceLoading(false);
          return;
        }
        lastReason = res.reason || lastReason;
      }

      try {
        sessionStorage.removeItem(`replaytime-pw-${replay.id}`);
        sessionStorage.removeItem(`replaytime-tok-${replay.id}`);
      } catch { /* ignore */ }
      setSourceLoading(false);
      setNeedsPassword(true);
      if (lastReason === 'device_limit') {
        setDeviceLimit(true);
        if (token) setLockedToken(token);
        import('@/hooks/use-toast').then(({ toast }) => {
          toast({ title: 'Token sudah dipakai', description: 'Token ini sudah terikat ke perangkat lain. Reset perangkat untuk pindah.', variant: 'destructive' });
        });
      }
    })();

    return () => { cancelled = true; };

  }, [replay.id]);

  const sources = useMemo(() => buildSources(source, replay), [source, replay]);

  // Pick default active source when sources arrive
  useEffect(() => {
    if (!sources.length || activeSourceId) return;
    const def = sources.find(s => s.is_default) || sources[0];
    setActiveSourceId(def.id);
  }, [sources, activeSourceId]);

  const activeSource = useMemo(
    () => sources.find(s => s.id === activeSourceId) || null,
    [sources, activeSourceId],
  );

  const replayTvPayload = useMemo<Record<string, unknown> | null>(() => {
    const selected = activeSource
      || sources.find(item => item.is_default)
      || sources[0];
    if (!selected) return null;
    return {
      kind: 'replay',
      replay_id: replay.id,
      title: replay.title,
      source_type: selected.type,
      source: selected.url,
      youtube_alt_id: source?.youtube_alt_id || '',
    };
  }, [activeSource, replay.id, replay.title, source?.youtube_alt_id, sources]);

  // Prefetch all non-active sources in background so switching is instant
  useEffect(() => {
    if (!sources.length) return;
    const idle = (cb: () => void) => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
      if (typeof ric === 'function') ric(cb);
      else setTimeout(cb, 300);
    };
    idle(() => {
      sources.forEach(s => {
        if (s.id === activeSourceId) return;
        if (s.type === 'm3u8') void prefetchM3U8(s.url);
        else if (s.type === 'youtube') prefetchYouTube(s.url);
        else if (s.type === 'cloudflare') prefetchCloudflare(s.url);
      });
    });
  }, [sources, activeSourceId]);

  const handleSubmitPassword = async () => {
    const trimmed = pwInput.trim();
    if (!trimmed) { setPwError('Sandi wajib diisi.'); return; }
    setPwChecking(true);
    setPwError('');
    const res = await getReplaySource(replay.id, { password: trimmed });
    setPwChecking(false);
    if (res.data) {
      try { sessionStorage.setItem(`replaytime-pw-${replay.id}`, trimmed); } catch { /* ignore */ }
      setSource(res.data);
      setNeedsPassword(false);
      setPwInput('');
    } else if (res.reason === 'rate_limited') {
      setPwError('Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.');
    } else if (res.reason === 'source_hidden') {
      setPwError('Sandi benar, tetapi replay ini sementara hanya bisa ditonton lewat link resmi dari admin.');
    } else if (res.reason === 'source_unavailable') {
      setPwError('Sandi benar, tetapi sumber video sedang tidak tersedia. Hubungi admin.');
    } else {
      setPwError('Sandi salah. Coba lagi.');
    }

  };

  useEffect(() => {
    const incrementView = async () => {
      try {
        const { data } = await supabase.rpc('increment_view_count', { _replay_id: replay.id });
        if (typeof data === 'number') setViewCount(data);
      } catch { /* ignore */ }
    };
    incrementView();
  }, [replay.id]);

  useEffect(() => onFullscreenChange(() => setIsFullscreen(isFullscreenActive())), []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    const video = el.querySelector('video') as HTMLVideoElement | null;
    if (isFullscreenActive() || isVideoFullscreen(video)) {
      await exitFs(video);
      setIsFullscreen(false);
      await lockLandscape(false);
      return;
    }
    const target = (el.querySelector('[data-player-root]') as HTMLElement) || el;
    const ok = await requestFs(target, target.querySelector('video'));
    setIsFullscreen(isFullscreenActive());
    if (!ok) {
      // iPhone/WebView menolak fullscreen untuk elemen non-video → minta player
      // memakai mode layar penuh CSS-nya sendiri.
      try { target.dispatchEvent(new CustomEvent('replaytime-toggle-fs')); } catch { /* ignore */ }
      return;
    }
    await lockLandscape(true);
  }, []);

  const copyReplayLink = useCallback(async () => {
    const value = window.location.href;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement('textarea');
      input.value = value;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      input.remove();
    }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1800);
  }, []);

  const cloudflareCastUrl = useCallback((raw: string) => {
    const value = raw.trim();
    if (/^https?:\/\//i.test(value) && /\/manifest\/video\.m3u8(?:\?|$)/i.test(value)) return value;
    const uid = value.match(/([a-f0-9]{32})/i)?.[1];
    return uid ? `https://videodelivery.net/${uid}/manifest/video.m3u8` : '';
  }, []);

  const openTvDialog = useCallback((tab: 'code' | 'mirror') => {
    // Jangan membuka Radix Dialog pada pointer event yang sama dengan penutupan
    // menu. Safari/iOS dapat menganggap event tersebut sebagai klik di luar lalu
    // langsung menutup dialog yang baru dibuat.
    setShowTvMenu(false);
    setTvConnectTab(tab);
    window.setTimeout(() => setShowTvConnect(true), 80);
  }, []);


  const handleHlsFatalError = useCallback(() => {
    // Try to switch to next source automatically
    if (!activeSource) return;
    const idx = sources.findIndex(s => s.id === activeSource.id);
    const next = sources.find((s, i) => i !== idx);
    if (next) {
      setActiveSourceId(next.id);
      setHlsFailed(false);
    } else {
      setHlsFailed(true);
    }
  }, [activeSource, sources]);

  // YouTube/Cloudflare dirender oleh EmbedPlayer dengan kontrol replay yang terlihat.

  const lineup = replay.lineup || [];

  return (
    <div className="min-h-screen bg-background relative z-10">
      <div className={`sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-4 transition-all duration-300 ${navVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate font-sans">{hideTitle ? displayShortTitle(replay as any) : replay.title}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{replay.criteria}</p>
        </div>


        {activeSource && activeSource.type !== 'm3u8' && (
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="shrink-0">
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </Button>
        )}

      </div>

      <div
        ref={containerRef}
        className="w-full max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-6 py-3 sm:py-4 select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        {sourceLoading ? (
          <div className="relative w-full overflow-hidden rounded-xl bg-black flex items-center justify-center" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          </div>
        ) : needsPassword ? (
          <div className="rounded-xl bg-card/80 border border-border p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-semibold mb-1">
                {deviceLimit ? 'Token Dipakai di Perangkat Lain' : 'Masukkan Sandi'}
              </p>
              <p className="text-sm text-muted-foreground">
                {deviceLimit
                  ? 'Link token ini sudah terikat ke perangkat lain. Reset perangkat di bawah untuk pindah ke perangkat ini — perangkat lama otomatis keluar.'
                  : 'Sesi sandi tidak ditemukan. Masukkan ulang untuk menonton.'}
              </p>
            </div>
            {deviceLimit && lockedToken && (
              <div className="max-w-xs mx-auto text-left">
                <DeviceResetButton kind="show" token={lockedToken} />
              </div>
            )}
            {!deviceLimit && (
              <div className="max-w-xs mx-auto space-y-2">
                <Input type="password" placeholder="Sandi replay..." value={pwInput}
                  onChange={(e) => { setPwInput(e.target.value); setPwError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitPassword()} autoFocus />
                {pwError && <p className="text-xs text-destructive">{pwError}</p>}
                <Button className="w-full" onClick={handleSubmitPassword} disabled={pwChecking}>
                  {pwChecking ? 'Memeriksa...' : 'Buka Replay'}
                </Button>
              </div>
            )}
            {deviceLimit && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
                Muat ulang setelah reset
              </Button>
            )}
          </div>

        ) : sourceError ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">{sourceError}</p>
          </div>
        ) : !activeSource ? (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-6 text-center">
            <p className="text-destructive font-medium">Video belum tersedia. Hubungi admin.</p>
          </div>
        ) : activeSource.type === 'm3u8' && !hlsFailed ? (
          <HlsPlayer
            ref={hlsPlayerRef}
            key={activeSource.id}
            src={activeSource.url}
            title={replay.title}
            onFatalError={handleHlsFatalError}
            onPipChange={setPipActive}
            replayTvPayload={replayTvPayload}
          />
        ) : (
          <EmbedPlayer
            key={activeSource.id}
            type={activeSource.type as 'youtube' | 'cloudflare'}
            source={activeSource.url}
            title={replay.title}
            altYoutubeId={source?.youtube_alt_id || ''}
            onTvClick={() => {
              setCastMsg('');
              setShowTvConnect(false);
              setShowTvMenu(true);
            }}

          />
        )}

        {/* Playlist chips */}
        {sources.length >= 1 && activeSource && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <ListVideo className="w-3.5 h-3.5" />
              <span>Pilih playlist</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {sources.map(s => {
                const active = s.id === activeSourceId;
                const warm = () => {
                  if (s.type === 'm3u8') void prefetchM3U8(s.url);
                  else if (s.type === 'youtube') prefetchYouTube(s.url);
                  else if (s.type === 'cloudflare') prefetchCloudflare(s.url);
                };
                return (
                  <button
                    key={s.id}
                    type="button"
                    onPointerEnter={warm}
                    onFocus={warm}
                    onClick={() => { setHlsFailed(false); setActiveSourceId(s.id); }}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                        : 'bg-card/60 text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {s.label || s.type.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="w-4 h-4" />
              <span>{viewCount} kali ditonton</span>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
              <RatingStars replayId={replay.id} />
              {activeSource?.type === 'm3u8' && pipSupported && (
                <div className="flex flex-col items-end">
                  <Button
                    type="button"
                    variant={pipActive ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 h-8 px-2.5"
                    onClick={async () => {
                      if (!hlsPlayerRef.current) return;
                      if (pipActive) await hlsPlayerRef.current.exitPip();
                      else await hlsPlayerRef.current.requestPip();
                    }}
                    title="Picture-in-Picture: tonton video di jendela kecil mengambang"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                    <span className="text-xs font-medium">{pipActive ? 'Tutup PiP' : 'PiP'}</span>
                  </Button>
                  <p className="mt-1 text-[10px] text-muted-foreground text-right max-w-[180px] leading-tight">
                    Tonton di jendela kecil mengambang sambil membuka tab/aplikasi lain
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-sm">
            {new Date(replay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {lineup.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {lineup.map((m, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm">{m}</span>
              ))}
            </div>
          )}

          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border">
            <Suspense fallback={<div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>}>
              <CommentSection replayId={replay.id} />
            </Suspense>
          </div>
        </div>
      </div>
      {showTvMenu && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-background/80 p-3 backdrop-blur-sm" onClick={() => setShowTvMenu(false)}>
          <div role="dialog" aria-modal="true" aria-label="Pilihan sambungan TV" className="w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-2xl text-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-foreground">
              <Cast className="w-4 h-4 text-primary" /> Hubungkan ke TV / Proyektor
            </div>
            <p className="px-2 pb-2 text-xs text-muted-foreground">Pilih salah satu cara berikut.</p>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-2.5 py-3 text-left"
              onClick={() => openTvDialog('code')}
            >
              <Tv className="h-5 w-5 shrink-0 text-primary" />
              <span><span className="block font-semibold">Kode 6 angka</span><span className="block text-xs font-normal text-muted-foreground">Masukkan kode di browser Android TV</span></span>
            </Button>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-2.5 py-3 text-left"
              disabled={castBusy}
              onClick={async () => {
                if (!activeSource) {
                  setCastMsg('Video belum siap. Tunggu sebentar lalu coba lagi.');
                  return;
                }
                if (activeSource.type === 'youtube' || !isGoogleCastCapable()) {
                  setCastMsg(activeSource.type === 'youtube'
                    ? 'Replay YouTube disambungkan melalui kode TV atau siarkan layar.'
                    : 'Chromecast langsung tidak tersedia di browser ini. Gunakan kode TV atau siarkan layar.');
                  openTvDialog('mirror');
                  return;
                }
                const castUrl = activeSource.type === 'cloudflare'
                  ? cloudflareCastUrl(activeSource.url)
                  : activeSource.url;
                if (!castUrl) {
                  setCastMsg('Alamat video untuk Chromecast tidak tersedia. Gunakan kode 6 angka.');
                  return;
                }
                setCastBusy(true);
                setCastMsg('Menyiapkan Chromecast…');
                const result = await castMediaDetailed({
                  url: castUrl,
                  title: replay.title,
                  contentType: activeSource.type === 'cloudflare' ? 'application/x-mpegURL' : undefined,
                });
                setCastBusy(false);
                if (result.ok) setCastMsg('Replay berhasil dikirim ke TV.');
                else if (result.reason === 'cancelled') setCastMsg('Pemilihan Chromecast dibatalkan.');
                else if (result.reason === 'load_failed') setCastMsg('TV ditemukan, tetapi video tidak dapat dimuat. Gunakan kode 6 angka.');
                else setCastMsg('Chromecast tidak ditemukan. Pastikan HP dan TV memakai WiFi yang sama.');
              }}
            >
              {castBusy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /> : <MonitorSmartphone className="h-5 w-5 shrink-0 text-primary" />}
              <span><span className="block font-semibold">Chromecast / siarkan layar</span><span className="block text-xs font-normal text-muted-foreground">Pilih TV atau ikuti panduan perangkat</span></span>
            </Button>
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-2.5 py-3 text-left"
              onClick={() => { void copyReplayLink(); }}
            >
              <Copy className="h-5 w-5 shrink-0 text-primary" />
              <span><span className="block font-semibold">{linkCopied ? 'Link berhasil disalin' : 'Salin link replay'}</span><span className="block text-xs font-normal text-muted-foreground">Buka alamat yang sama di perangkat lain</span></span>
            </Button>
            {castMsg && <p className="px-2.5 py-1.5 text-[11px] text-primary">{castMsg}</p>}
            <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
              Kode TV memakai akses yang sama dan tidak memerlukan reset perangkat.
            </p>
            <Button variant="outline" className="mt-1 w-full" onClick={() => setShowTvMenu(false)}>Tutup</Button>
          </div>
        </div>
      )}
      <TvConnectDialog
        open={showTvConnect}
        onOpenChange={setShowTvConnect}
        initialTab={tvConnectTab}
        replayPayload={replayTvPayload}
      />
    </div>
  );
}
