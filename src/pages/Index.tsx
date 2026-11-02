import { redirectReplayIfNeeded, getSiteRouting, replayLocked } from '@/lib/siteRedirect';
import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Search, X, SlidersHorizontal, ArrowUpDown, Bookmark, ArrowUp, Film, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ThemedBackground, { type ThemeType } from '@/components/ThemedBackground';
import HamburgerMenu from '@/components/HamburgerMenu';
import ReplayCardComponent from '@/components/ReplayCardComponent';
import ReplayCardSkeleton from '@/components/ReplayCardSkeleton';
import StatsBar from '@/components/StatsBar';
import ActiveShowsSection from '@/components/ActiveShowsSection';
// Lazy-load player + komentar — chunk berat hanya dimuat saat user membuka replay.
const YouTubePlayer = lazy(() => import('@/components/YouTubePlayer'));
import { getReplays, getSettings } from '@/lib/store';
import { type ReplayRow } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAutoHideOnInteraction } from '@/hooks/useAutoHideOnInteraction';
import { useActiveMembership } from '@/hooks/useActiveMembership';

const MONTH_NAMES: Record<string, string> = {
  '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April',
  '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember',
};

const CRITERIA_FILTERS = [
  { value: '', label: 'Semua' },
  { value: 'reguler', label: 'Reguler' },
  { value: 'sts', label: 'STS' },
  { value: 'last_show', label: 'Last Show' },
  { value: 'shonichi', label: 'Shonichi' },
  { value: 'senshuuraku', label: 'Senshuuraku' },
  { value: 'aniv', label: 'Anniversary' },
  { value: 'special', label: 'Spesial' },
];

// Urutan tampil untuk kelompok replay spesial.
const SPECIAL_ORDER = ['sts', 'last_show', 'shonichi', 'senshuuraku', 'aniv', 'special'];
const specialRank = (c: string) => {
  const i = SPECIAL_ORDER.indexOf((c || '').toLowerCase());
  return i === -1 ? SPECIAL_ORDER.length : i;
};
const isSpecialReplay = (r: { criteria: string }) => SPECIAL_ORDER.includes((r.criteria || '').toLowerCase());

type SortMode = 'newest' | 'oldest' | 'title';

const UNLOCKED_STORAGE_KEY = 'replaytime-unlocked-replays';
const ACTIVE_REPLAY_STORAGE_KEY = 'replaytime-active-replay';

function readSessionSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return new Set();
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export default function Index() {
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(() => readSessionSet(UNLOCKED_STORAGE_KEY));
  const [watchingReplay, setWatchingReplay] = useState<ReplayRow | null>(null);
  const [displayedReplay, setDisplayedReplay] = useState<ReplayRow | null>(null);
  const [playerVisible, setPlayerVisible] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allGrouped, setAllGrouped] = useState<Record<string, ReplayRow[]>>({});
  const [allReplays, setAllReplays] = useState<ReplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeType>('ramadhan');
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('replaytime-mode') === 'light');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');
  const navVisible = useAutoHideOnInteraction(!watchingReplay, 3000);
  // Satu subscription membership untuk seluruh landing page. Jangan membuat
  // subscription auth/RPC baru pada setiap kartu replay.
  const { membership } = useActiveMembership();

  // Filters & sorting
  const [criteriaFilter, setCriteriaFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [groupMode, setGroupMode] = useState<'all' | 'special' | 'regular'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('replaytime-bookmarks');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const prevReplayCountRef = useRef(0);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('replaytime-bookmarks', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const refreshingRef = useRef(false);
  const refreshReplays = useCallback(async () => {
    // Cegah refresh bertumpuk (realtime bisa mengirim banyak event beruntun).
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const replays = await getReplays();
      const grouped: Record<string, ReplayRow[]> = {};
      for (const r of replays) {
        const d = new Date(r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      }
      setAllGrouped(grouped);

      // Realtime notification for new replays
      if (prevReplayCountRef.current > 0 && replays.length > prevReplayCountRef.current) {
        const newCount = replays.length - prevReplayCountRef.current;
        toast({
          title: '🎬 Replay Baru!',
          description: `${newCount} replay baru telah ditambahkan.`,
        });
      }
      prevReplayCountRef.current = replays.length;
      setAllReplays(replays);
    } catch (e) {
      console.warn('[Index] refreshReplays failed:', e);
    } finally {
      refreshingRef.current = false;
    }
  }, []);


  useEffect(() => {
    let cancelled = false;
    // Safety net: jangan biarkan halaman selamanya menampilkan skeleton.
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    // Muat tiap bagian secara independen agar satu kegagalan tidak memblokir UI.
    (async () => {
      try {
        const replays = await getReplays();
        if (cancelled) return;
        const grouped: Record<string, ReplayRow[]> = {};
        for (const r of replays) {
          const d = new Date(r.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(r);
        }
        setAllGrouped(grouped);
        setAllReplays(replays);
        prevReplayCountRef.current = replays.length;
      } catch (e) {
        console.warn('[Index] getReplays failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    getSettings().then((settings) => {
      if (cancelled) return;
      setTheme((settings.theme as ThemeType) || 'ramadhan');
      setWaNumber(settings.whatsapp_number || '');
      setWaLink(settings.whatsapp_link || '');
    }).catch((e) => console.warn('[Index] getSettings failed:', e));

    const replayChannel = supabase
      .channel('replays-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replays' }, () => {
        refreshReplays();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'replays' }, () => {
        refreshReplays();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'replays' }, (payload) => {
        // Hanya refresh data jika ada perubahan pada sumber/playlist atau metadata penting.
        // Abaikan UPDATE yang hanya menambah view_count agar tidak terjadi reload loop.
        const oldRow = (payload.old || {}) as Record<string, unknown>;
        const newRow = (payload.new || {}) as Record<string, unknown>;
        const watched = ['source_type', 'title', 'criteria', 'date', 'show_time', 'image_url', 'lineup'];
        const changed = watched.some(k => JSON.stringify(oldRow[k]) !== JSON.stringify(newRow[k]));
        if (changed) refreshReplays();
      })
      .subscribe();

    // Realtime theme sync
    const settingsChannel = supabase
      .channel('settings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, (payload) => {
        const row = payload.new as { key: string; value: string };
        if (row.key === 'theme') setTheme(row.value as ThemeType);
        if (row.key === 'whatsapp_number') setWaNumber(row.value);
        if (row.key === 'whatsapp_link') setWaLink(row.value);
      })
      .subscribe();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      supabase.removeChannel(replayChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [refreshReplays]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', lightMode);
    // Remove old theme-light classes and add current
    root.className = root.className.replace(/\btheme-\S+/g, '');
    if (lightMode) {
      root.classList.add(`theme-${theme}`);
    }
    localStorage.setItem('replaytime-mode', lightMode ? 'light' : 'dark');
  }, [lightMode, theme]);

  useEffect(() => {
    try {
      sessionStorage.setItem(UNLOCKED_STORAGE_KEY, JSON.stringify([...unlockedIds]));
    } catch {
      // ignore storage failures
    }
  }, [unlockedIds]);

  const lockedRef = useRef<boolean | null>(null);
  const [lockReady, setLockReady] = useState(false);
  useEffect(() => { getSiteRouting().then((r) => { lockedRef.current = replayLocked(r); setLockReady(true); }); }, []);

  useEffect(() => {
    if (loading || !lockReady || allReplays.length === 0 || displayedReplay) return;

    // 1) Token URL: ?token=...&replay=...
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const pwParam = params.get('pw');
      const tokenReplay = params.get('replay');
      if ((token || pwParam) && tokenReplay) {
        if (lockedRef.current) { window.history.replaceState({}, '', window.location.pathname); return; }
        const matched = allReplays.find(r => r.id === tokenReplay);
        if (matched) {
          try {
            if (token) sessionStorage.setItem(`replaytime-tok-${tokenReplay}`, token);
            else if (pwParam) sessionStorage.setItem(`replaytime-pw-${tokenReplay}`, pwParam);
          } catch { /* ignore */ }
          setUnlockedIds(prev => prev.has(tokenReplay) ? prev : new Set(prev).add(tokenReplay));
          setDisplayedReplay(matched);
          setWatchingReplay(matched);
          requestAnimationFrame(() => requestAnimationFrame(() => setPlayerVisible(true)));
          // Clean URL
          const cleaned = window.location.pathname;
          window.history.replaceState({}, '', cleaned);
          return;
        }
      }
    } catch { /* ignore */ }

    // Bersihkan sisa state player lama agar halaman / tidak pernah blank
    // karena overlay player ter-restore dalam keadaan kosong/gagal.
    try { sessionStorage.removeItem(ACTIVE_REPLAY_STORAGE_KEY); } catch { /* ignore */ }
  }, [allReplays, displayedReplay, loading]);

  // Scroll-to-top visibility
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const grouped = useMemo(() => {
    let result = { ...allGrouped };

    const keep = (fn: (r: ReplayRow) => boolean) => {
      const filtered: Record<string, ReplayRow[]> = {};
      for (const [month, replays] of Object.entries(result)) {
        const matched = replays.filter(fn);
        if (matched.length > 0) filtered[month] = matched;
      }
      result = filtered;
    };

    // Text search — semua kata kunci harus cocok (mis. "sts jessi")
    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      keep((r) => {
        const haystack = [
          r.title, r.criteria, r.show_name || '', r.featured_member || '',
          r.date || '', ...(r.lineup || []),
        ].join(' ').toLowerCase();
        return terms.every(t => haystack.includes(t));
      });
    }

    // Kelompok spesial / reguler
    if (groupMode === 'special') keep(isSpecialReplay);
    else if (groupMode === 'regular') keep(r => !isSpecialReplay(r));

    // Filter kalender (rentang tanggal)
    if (dateFrom) keep(r => (r.date || '') >= dateFrom);
    if (dateTo) keep(r => (r.date || '') <= dateTo);

    // Criteria filter
    if (criteriaFilter) keep(r => r.criteria === criteriaFilter);

    // Bookmarks only
    if (showBookmarksOnly) keep(r => bookmarks.has(r.id));

    // Sort within each month (default: newest first by date+time)
    const getDateTime = (r: ReplayRow) => `${r.date}T${r.show_time || '19:00:00'}`;
    const byNewest = (a: ReplayRow, b: ReplayRow) => getDateTime(b).localeCompare(getDateTime(a));
    for (const key of Object.keys(result)) {
      let arr = [...result[key]];
      if (sortMode === 'oldest') arr.sort((a, b) => getDateTime(a).localeCompare(getDateTime(b)));
      else if (sortMode === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
      else arr.sort(byNewest);
      // Dalam mode spesial, urutkan kategori: STS → Last Show → Shonichi →
      // Senshuuraku → Anniversary → Spesial.
      if (groupMode === 'special') {
        arr = arr.sort((a, b) => specialRank(a.criteria) - specialRank(b.criteria));
      }
      result[key] = arr;
    }

    return result;
  }, [allGrouped, searchQuery, criteriaFilter, sortMode, showBookmarksOnly, bookmarks, groupMode, dateFrom, dateTo]);

  const sortedMonths = Object.keys(grouped).sort((a, b) =>
    sortMode === 'oldest' ? a.localeCompare(b) : b.localeCompare(a)
  );

  const totalFiltered = useMemo(
    () => Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0),
    [grouped],
  );

  // Render bertahap (infinite scroll) — cegah ratusan kartu dipasang sekaligus.
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadLockRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel token: setiap perubahan filter/pencarian menaikkan generasi sehingga
  // batch yang masih tertunda dibatalkan dan tidak pernah masuk dengan urutan salah.
  const loadGenRef = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadGenRef.current += 1;
    setVisibleCount(PAGE_SIZE);
    loadLockRef.current = false;
    setLoadingMore(false);
    if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
  }, [searchQuery, criteriaFilter, sortMode, showBookmarksOnly, groupMode, dateFrom, dateTo]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visibleCount >= totalFiltered) return;

    const gen = loadGenRef.current;

    // Debounce + lock + cancel token: saat scroll cepat, observer bisa memicu
    // berkali-kali. Lock memastikan hanya satu batch yang dieksekusi, dan token
    // generasi membatalkan batch tertunda saat filter/pencarian berubah.
    const requestMore = () => {
      if (loadLockRef.current || gen !== loadGenRef.current) return;
      loadLockRef.current = true;
      setLoadingMore(true);
      loadTimerRef.current = setTimeout(() => {
        loadTimerRef.current = null;
        if (gen !== loadGenRef.current) { loadLockRef.current = false; setLoadingMore(false); return; }
        setVisibleCount(c => Math.min(c + PAGE_SIZE, totalFiltered));
        // Lepas lock setelah render batch selesai agar batch berikutnya
        // hanya jalan bila sentinel masih terlihat.
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (gen !== loadGenRef.current) return;
            loadLockRef.current = false;
            setLoadingMore(false);
          }, 120);
        });
      }, 100);
    };

    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) requestMore();
    }, { rootMargin: '350px 0px' });
    io.observe(el);
    return () => {
      io.disconnect();
      if (loadTimerRef.current) { clearTimeout(loadTimerRef.current); loadTimerRef.current = null; }
    };
  }, [visibleCount, totalFiltered]);




  const handleUnlock = useCallback((id: string) => {
    setUnlockedIds(prev => new Set(prev).add(id));
  }, []);

  // Atomic unlock + open player (prevents Chrome race condition)
  const handleUnlockAndWatch = useCallback((replay: ReplayRow) => {
    void redirectReplayIfNeeded(replay.id).then((moved) => { if (!moved) openUnlocked(replay); });
  }, []);

  const openUnlocked = (replay: ReplayRow) => {
    try {
      sessionStorage.setItem(ACTIVE_REPLAY_STORAGE_KEY, replay.id);
    } catch {
      // ignore storage failures
    }
    setUnlockedIds(prev => new Set(prev).add(replay.id));
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    setDisplayedReplay(replay);
    setWatchingReplay(replay);
    setPlayerVisible(true);
  };

  const handleOpenPlayer = useCallback((replay: ReplayRow) => {
    void redirectReplayIfNeeded(replay.id).then((moved) => { if (!moved) openPlayer(replay); });
  }, []);

  const openPlayer = (replay: ReplayRow) => {
    try {
      sessionStorage.setItem(ACTIVE_REPLAY_STORAGE_KEY, replay.id);
    } catch {
      // ignore storage failures
    }
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    setDisplayedReplay(replay);
    setWatchingReplay(replay);
    setPlayerVisible(true);
  };

  const handleClosePlayer = useCallback(() => {
    try {
      sessionStorage.removeItem(ACTIVE_REPLAY_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    setPlayerVisible(false);
    setWatchingReplay(null);
    closingTimerRef.current = setTimeout(() => {
      setDisplayedReplay(null);
    }, 350);
  }, []);

  useEffect(() => () => {
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
  }, []);

  return (
    <div className="relative">
      {/* Player overlay - always stable in DOM, visibility via CSS only */}
      <div
        className={`fixed inset-0 z-[100] bg-background overflow-y-auto transition-opacity duration-150 ease-out ${
          playerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className={displayedReplay ? 'block' : 'hidden'}>
          {displayedReplay && (
            <Suspense fallback={
              <div className="max-w-5xl mx-auto p-4 space-y-4">
                <div className="w-full aspect-video rounded-xl bg-muted/30 animate-pulse flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
                <div className="h-6 w-2/3 rounded bg-muted/30 animate-pulse" />
                <div className="h-4 w-1/3 rounded bg-muted/30 animate-pulse" />
              </div>
            }>

              <YouTubePlayer replay={displayedReplay} onBack={handleClosePlayer} />
            </Suspense>
          )}
        </div>
      </div>

      {/* Main content - always in DOM */}
      <div className={`relative min-h-screen transition-colors duration-300 ${watchingReplay ? 'invisible' : 'visible'}`}>
      <div className={`fixed inset-0 z-0 transition-opacity duration-700 ${lightMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <ThemedBackground theme={theme} />
      </div>
      <div className={`fixed inset-0 z-0 bg-background transition-opacity duration-700 ${lightMode ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      <HamburgerMenu whatsappNumber={waNumber} whatsappLink={waLink} lightMode={lightMode} onToggleMode={() => setLightMode(v => !v)} visible={navVisible} />

      <div className="relative z-10">
        <header className="text-center py-10 md:py-16 px-4">
          <h1 className="text-4xl md:text-6xl font-bold text-primary drop-shadow-lg animate-fade-up" style={{ animationFillMode: 'forwards' }}>
            ✦ ReplayTime ✦
          </h1>
          <p className="mt-3 text-muted-foreground text-lg md:text-xl animate-fade-up opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            Koleksi Replay Show Terlengkap
          </p>

          {/* Search */}
          <div className="mt-6 max-w-md mx-auto relative animate-fade-up opacity-0" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari judul, member, show..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-20 bg-card/60 backdrop-blur border-border"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`p-1 rounded transition-colors ${showFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters bar */}
          {showFilters && (
            <div className="mt-4 max-w-2xl mx-auto animate-fade-up opacity-0 space-y-3" style={{ animationFillMode: 'forwards' }}>
              {/* Criteria pills */}
              <div className="flex flex-wrap justify-center gap-2">
                {CRITERIA_FILTERS.map(f => (
                  <button key={f.value}
                    onClick={() => setCriteriaFilter(f.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                      criteriaFilter === f.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card/60 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Kelompok spesial / reguler */}
              <div className="flex flex-wrap justify-center gap-2">
                {([
                  { value: 'all', label: 'Semua Replay' },
                  { value: 'special', label: '✦ Replay Spesial' },
                  { value: 'regular', label: 'Replay Reguler' },
                ] as const).map(g => (
                  <button key={g.value}
                    onClick={() => setGroupMode(g.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                      groupMode === g.value
                        ? 'bg-accent text-accent-foreground border-accent'
                        : 'bg-card/60 border-border text-muted-foreground hover:border-accent/50 hover:text-foreground'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Filter kalender */}
              <div className="flex flex-wrap items-end justify-center gap-2">
                <div className="text-left">
                  <label className="block text-[10px] text-muted-foreground mb-1">Dari tanggal</label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="h-8 text-xs bg-card/60 backdrop-blur" />
                </div>
                <div className="text-left">
                  <label className="block text-[10px] text-muted-foreground mb-1">Sampai tanggal</label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="h-8 text-xs bg-card/60 backdrop-blur" />
                </div>
                {(dateFrom || dateTo) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs"
                    onClick={() => { setDateFrom(''); setDateTo(''); }}>
                    <X className="w-3.5 h-3.5 mr-1" /> Hapus tanggal
                  </Button>
                )}
              </div>



              {/* Sort + Bookmark row */}
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className={`text-xs gap-1.5 ${sortMode !== 'newest' ? 'border-primary text-primary' : ''}`}
                  onClick={() => setSortMode(m => m === 'newest' ? 'oldest' : m === 'oldest' ? 'title' : 'newest')}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  {sortMode === 'newest' ? 'Terbaru' : sortMode === 'oldest' ? 'Terlama' : 'A-Z'}
                </Button>
                <Button
                  variant="outline" size="sm"
                  className={`text-xs gap-1.5 ${showBookmarksOnly ? 'border-primary text-primary bg-primary/10' : ''}`}
                  onClick={() => setShowBookmarksOnly(v => !v)}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Favorit {bookmarks.size > 0 && `(${bookmarks.size})`}
                </Button>
              </div>
            </div>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-4 pb-20">
          {/* Active Shows moved to /show page */}

          {/* Stats */}
          {!loading && allReplays.length > 0 && <StatsBar replays={allReplays} />}

          {/* Skeleton loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <ReplayCardSkeleton key={i} />
              ))}
            </div>
          )}

          {!loading && sortedMonths.length === 0 && (
            <div className="text-center py-20 animate-fade-up opacity-0 flex flex-col items-center gap-4" style={{ animationFillMode: 'forwards' }}>
              <div className="w-24 h-24 rounded-full bg-card/80 border border-border flex items-center justify-center">
                <Film className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-foreground text-xl font-semibold font-sans mb-1">
                  {showBookmarksOnly ? 'Belum Ada Favorit' : searchQuery ? 'Tidak Ditemukan' : 'Belum Ada Replay'}
                </p>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                  {showBookmarksOnly
                    ? 'Tandai replay favoritmu dengan ikon bookmark di setiap kartu.'
                    : searchQuery
                    ? `Tidak ada replay yang cocok dengan "${searchQuery}". Coba kata kunci lain.`
                    : 'Replay belum ditambahkan. Hubungi admin untuk informasi lebih lanjut.'}
                </p>
              </div>
            </div>
          )}

          {(() => {
            // Render bertahap: hanya sebagian kartu yang dipasang ke DOM agar
            // browser (terutama mobile) tidak kehabisan memori dan me-reload tab.
            let remaining = visibleCount;
            const sections: JSX.Element[] = [];
            for (const monthKey of sortedMonths) {
              if (remaining <= 0) break;
              const [year, month] = monthKey.split('-');
              const monthName = MONTH_NAMES[month] || month;
              const items = grouped[monthKey].slice(0, remaining);
              remaining -= items.length;
              sections.push(
                <section key={monthKey} className="mb-12">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-px flex-1 bg-primary/30" />
                    <h2 className="text-2xl md:text-3xl font-bold text-primary whitespace-nowrap">
                      ☪ {monthName} {year}
                    </h2>
                    <div className="h-px flex-1 bg-primary/30" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((replay, i) => (
                      <ReplayCardComponent
                        key={replay.id}
                        replay={replay}
                        isUnlocked={unlockedIds.has(replay.id)}
                        onUnlock={handleUnlock}
                        onWatch={handleOpenPlayer}
                        onUnlockAndWatch={handleUnlockAndWatch}
                        index={Math.min(i, 5)}
                        isBookmarked={bookmarks.has(replay.id)}
                        onToggleBookmark={toggleBookmark}
                        searchQuery={searchQuery}
                        membership={membership}
                      />
                    ))}
                  </div>
                </section>
              );
            }
            return sections;
          })()}

          {!loading && visibleCount < totalFiltered && (
            <div ref={sentinelRef} className="space-y-6 py-4">
              {/* Placeholder konsisten: kartu skeleton saat batch berikutnya dimuat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden={!loadingMore}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <ReplayCardSkeleton key={i} />
                ))}
              </div>
              <div className="flex justify-center">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Scroll to top */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed bottom-6 right-6 z-50 p-3 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-110 ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <ArrowUp className="w-5 h-5" />
      </button>
      </div>
    </div>
  );
}
