import { useReplayDisplay } from '@/hooks/useReplayDisplay';
import { displayShortTitle } from '@/lib/abbrev';
import { memo, useEffect, useState, useMemo } from 'react';
import { Lock, Unlock, Play, Calendar, Users, Tag, Star, Tv, Bookmark, BookmarkCheck, ShoppingCart, Copy, Crown } from 'lucide-react';
import { type ReplayRow, verifyPasswordDetailed } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MemberAvatar from '@/components/MemberAvatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BuyShowDialog from '@/components/BuyShowDialog';
import { getReplayPurchase, getAllShowPurchases } from '@/lib/purchases';
import AnonReplayPassword from '@/components/AnonReplayPassword';

import { toast } from '@/hooks/use-toast';
import type { ActiveMembership } from '@/hooks/useActiveMembership';
import { isReplayCoveredByMembership } from '@/lib/membershipReplayAccess';
import { thumbUrl } from '@/lib/imageUrl';
import AccessInfoCard from '@/components/AccessInfoCard';
import { setReplayPurchase } from '@/lib/purchases';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';



const CRITERIA_LABELS: Record<string, string> = {
  reguler: 'Reguler', sts: 'STS', last_show: 'Last Show', aniv: 'Anniversary', special: 'Show Spesial',
};

interface Props {
  replay: ReplayRow;
  isUnlocked: boolean;
  onUnlock: (id: string) => void;
  onWatch: (replay: ReplayRow) => void;
  onUnlockAndWatch?: (replay: ReplayRow) => void;
  index?: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
  searchQuery?: string;
  membership?: ActiveMembership | null;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">{part}</mark> : part
  );
}

const FIT_CLASS: Record<string, string> = {
  contain: 'object-cover object-center',
  'scale-down': 'object-scale-down',
  cover: 'object-cover object-center',
};

const REPLAY_DEFAULT_PRICE = 2000;
const getReplayPrice = (r: any) => {
  const v = Number(r?.price_idr);
  return Number.isFinite(v) && v > 0 ? v : REPLAY_DEFAULT_PRICE;
};

function ReplayCardComponent({ replay, isUnlocked, onUnlock, onWatch, onUnlockAndWatch, index = 0, isBookmarked, onToggleBookmark, searchQuery = '', membership = null }: Props) {
  const { compact, hideTitle } = useReplayDisplay();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [purchasedToken, setPurchasedToken] = useState<string>('');
  const [imgLoaded, setImgLoaded] = useState(false);
  const { user } = useAuth();

  // Sync purchase state from localStorage
  useEffect(() => {
    const refresh = () => {
      const p = getReplayPurchase(replay.id);
      setPurchasedToken(p?.token || '');
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('replaytime-purchases-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('replaytime-purchases-updated', refresh);
    };
  }, [replay.id]);

  // Sinkron lintas perangkat: user login yang sudah membeli (QRIS maupun koin)
  // tetap melihat tombol tonton + panel salin link di perangkat manapun.
  useEffect(() => {
    if (!user || !replay.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('access_token,created_at')
        .eq('user_id', user.id)
        .eq('replay_id', replay.id)
        .eq('status', 'paid')
        .not('access_token', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const tok = (data || [])[0]?.access_token as string | undefined;
      if (tok) {
        try { setReplayPurchase(replay.id, { token: tok, paidAt: Date.now() }); } catch { /* ignore */ }
        setPurchasedToken(tok);
      }
    })();
    return () => { cancelled = true; };
  }, [user, replay.id]);

  // Show yang sudah dikonversi jadi replay ini: token show tetap berlaku,
  // jadi pembeli show (login maupun anon) langsung melihat "Tonton Replay".
  useEffect(() => {
    if (purchasedToken || !replay.id) return;
    let cancelled = false;
    (async () => {
      const { data: shows } = await supabase
        .from('active_shows').select('id').eq('replay_id', replay.id);
      const ids = (shows || []).map((s: any) => s.id as string);
      if (cancelled || !ids.length) return;

      // 1) token show tersimpan lokal (berlaku juga untuk user anon/guest)
      const local = getAllShowPurchases();
      const localTok = ids.map(id => local[id]?.token).find(Boolean);
      if (localTok) {
        try { setReplayPurchase(replay.id, { token: localTok, paidAt: Date.now() }); } catch { /* ignore */ }
        setPurchasedToken(localTok);
        return;
      }

      // 2) user login: cari order show berbayar lintas perangkat
      if (!user) return;
      const { data } = await supabase
        .from('orders')
        .select('access_token,created_at')
        .eq('user_id', user.id)
        .in('show_id', ids)
        .eq('status', 'paid')
        .not('access_token', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const tok = (data || [])[0]?.access_token as string | undefined;
      if (tok) {
        try { setReplayPurchase(replay.id, { token: tok, paidAt: Date.now() }); } catch { /* ignore */ }
        setPurchasedToken(tok);
      }
    })();
    return () => { cancelled = true; };
  }, [user, replay.id, purchasedToken]);



  const membershipCovered = useMemo(() => isReplayCoveredByMembership(replay.date, membership), [replay.date, membership]);
  const membershipActiveButOutside = !!membership?.token && !membershipCovered && !!membership?.includes_replays;

  const isPurchased = !!purchasedToken;
  useEffect(() => {
    if (isPurchased && !isUnlocked) onUnlock(replay.id);
  }, [isPurchased, isUnlocked, replay.id, onUnlock]);



  const watchWithMembership = () => {
    if (membership?.token) {
      try { sessionStorage.setItem(`replaytime-tok-${replay.id}`, membership.token); } catch { /* ignore */ }
    }
    if (onUnlockAndWatch) onUnlockAndWatch(replay);
    else { onUnlock(replay.id); onWatch(replay); }
  };


  const accessLink = purchasedToken
    ? `${window.location.origin}/akses?token=${purchasedToken}&replay=${replay.id}`
    : '';
  const copyToken = async () => {
    try { await navigator.clipboard.writeText(purchasedToken); toast({ title: 'Sandi disalin' }); } catch { /* ignore */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(accessLink); toast({ title: 'Link akses disalin', description: 'Tempel di browser untuk menonton.' }); } catch { /* ignore */ }
  };

  const handleSubmitPassword = async () => {
    if (checking) return;

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setError('Sandi wajib diisi.');
      return;
    }

    setChecking(true);
    const res = await verifyPasswordDetailed(replay.id, trimmedPassword);
    setChecking(false);
    if (res.valid) {
      // Persist password for this replay so the player can fetch the source
      try {
        sessionStorage.setItem(`replaytime-pw-${replay.id}`, trimmedPassword);
        // Buang token lama yang mungkin sudah tidak valid agar player memakai sandi ini.
        const stale = sessionStorage.getItem(`replaytime-tok-${replay.id}`);
        if (stale && stale !== purchasedToken && stale !== membership?.token) {
          sessionStorage.removeItem(`replaytime-tok-${replay.id}`);
        }
      } catch { /* ignore */ }
      setShowPasswordDialog(false);
      setPassword('');
      setError('');
      if (onUnlockAndWatch) {
        onUnlockAndWatch(replay);
      } else {
        onUnlock(replay.id);
      }
    } else if (res.reason === 'rate_limited') {
      setError('Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.');
    } else {
      setError('Sandi salah! Coba lagi.');
    }

  };

  const formattedDate = new Date(replay.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const criteriaLabel = CRITERIA_LABELS[replay.criteria] || replay.criteria;
  const shownTitle = hideTitle ? displayShortTitle(replay as any) : replay.title;
  // SECURITY: thumbnail uses uploaded image only — youtube_id is hidden
  // from the client until the user enters the correct password.
  const thumbnailUrl = replay.image_url ? thumbUrl(replay.image_url, 640, 60) : '/placeholder.svg';
  const fitClass = FIT_CLASS[(replay as any).image_fit as string] || 'object-cover object-center';

  return (
    <div>
      <div
        className="group relative rounded-xl overflow-hidden border border-border bg-card/80 backdrop-blur-sm hover:border-primary/60 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20 animate-fade-up"
        style={{ animationDelay: `${Math.min(index, 3) * 35}ms`, animationFillMode: 'forwards', contentVisibility: 'auto', containIntrinsicSize: '420px' }}
      >
        {compact ? (
          <div className="relative p-3 pb-0 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">{criteriaLabel}</Badge>
                {isUnlocked ? (
                  <Badge className="bg-primary/15 text-primary border-0"><Unlock className="w-3 h-3 mr-1" /> Terbuka</Badge>
                ) : !isPurchased && !membershipCovered && (
                  <Badge variant="outline" className="border-border"><Lock className="w-3 h-3 mr-1" /> Terkunci</Badge>
                )}
              </div>
              <h3 className="text-2xl font-bold tracking-widest text-foreground font-sans">{shownTitle}</h3>
            </div>
            {onToggleBookmark && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleBookmark(replay.id); }}
                className={`p-1.5 rounded-full transition-all duration-200 ${isBookmarked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-primary'}`}
              >
                {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            )}
          </div>
        ) : (
        <div className="relative aspect-video overflow-hidden bg-muted">
          {!imgLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" aria-hidden />
          )}
          <img
            src={thumbnailUrl}
            alt={shownTitle}
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            fetchPriority={index < 3 ? 'auto' : 'low'}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            className={`w-full h-full ${fitClass} transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-xs">{criteriaLabel}</Badge>
          </div>
          {isUnlocked ? (
            <div className="absolute top-2 right-2">
              <Badge className="bg-green-600/90 text-foreground border-0">
                <Unlock className="w-3 h-3 mr-1" /> Terbuka
              </Badge>
            </div>
          ) : !isPurchased && !membershipCovered && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-background/70 backdrop-blur text-foreground border-0">
                <Lock className="w-3 h-3 mr-1" /> Terkunci
              </Badge>
            </div>
          )}
          {onToggleBookmark && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(replay.id); }}
              className={`absolute bottom-2 right-2 z-10 p-1.5 rounded-full transition-all duration-200 ${isBookmarked ? 'bg-primary text-primary-foreground' : 'bg-background/60 backdrop-blur text-muted-foreground hover:text-primary'}`}
            >
              {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          )}
          <h3 className="absolute left-3 right-12 bottom-2 text-base sm:text-lg font-bold text-white line-clamp-2 font-sans drop-shadow">{hideTitle ? shownTitle : highlightText(replay.title, searchQuery)}</h3>
        </div>
        )}

        <div className="p-3 space-y-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-primary" />{formattedDate}</span>
            {!compact && replay.show_name && (
              <span className="inline-flex items-center gap-1.5"><Tv className="w-3.5 h-3.5 text-primary" />{highlightText(replay.show_name, searchQuery)}</span>
            )}
            {!compact && replay.featured_member && (
              <span className="inline-flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-primary" />{highlightText(replay.featured_member, searchQuery)}</span>
            )}
          </div>

          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary mt-1.5 shrink-0" aria-hidden="true" />
            <div
              role="region"
              aria-label={`Line up ${replay.lineup.length} member, geser untuk melihat semua`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  e.currentTarget.scrollBy({ left: e.key === 'ArrowRight' ? 80 : -80, behavior: 'smooth' });
                }
              }}
              className="flex-1 min-w-0 overflow-x-auto overscroll-x-contain scrollbar-thin -mx-1 px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <ul className="flex gap-2 w-max py-1 list-none m-0 p-0">
                {replay.lineup.map((member, i) => (
                  <li key={i} className="snap-start">
                    {compact
                      ? <span className="inline-block rounded-full bg-muted px-2.5 py-1 text-xs text-foreground whitespace-nowrap">{member}</span>
                      : <MemberAvatar name={member} size={40} />}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {membershipCovered ? (
            <div className="space-y-2 pt-1">
              <Button type="button" className="w-full" onClick={watchWithMembership}>
                <Play className="w-4 h-4 mr-2" /> Tonton Replay
              </Button>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-1.5 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[10px] text-primary font-semibold">
                  Termasuk Membership {membership?.package_name ? `· ${membership.package_name}` : ''}
                </span>
              </div>
            </div>
          ) : isPurchased ? (
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  if (purchasedToken) {
                    try { sessionStorage.setItem(`replaytime-tok-${replay.id}`, purchasedToken); } catch { /* ignore */ }
                  }
                  onWatch(replay);
                }}
              >
                <Play className="w-4 h-4 mr-2" /> Tonton Replay
              </Button>
              <AccessInfoCard token={purchasedToken} replayId={replay.id} fallbackLink={accessLink} compact />
              <AnonReplayPassword token={purchasedToken} replayId={replay.id} />


            </div>
          ) : isUnlocked ? (
            <Button type="button" className="w-full" onClick={() => onWatch(replay)}>
              <Play className="w-4 h-4 mr-2" /> Tonton Sekarang
            </Button>
          ) : (
            <div className="space-y-2 pt-1">
              {membershipActiveButOutside && (
                <div className="rounded-md border border-border bg-muted/30 p-1.5 text-[10px] text-muted-foreground">
                  Replay ini di luar periode membership kamu, jadi masih perlu dibeli terpisah.
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-primary">Rp {getReplayPrice(replay).toLocaleString('id-ID')}</span>
                {((replay as any).price_coins ?? 0) > 0 && (
                  <Badge variant="secondary" className="text-xs">atau {(replay as any).price_coins} koin</Badge>
                )}
              </div>
              <Button type="button" className="w-full gap-2" onClick={() => setBuyOpen(true)}>
                <ShoppingCart className="w-4 h-4" />
                {((replay as any).price_coins ?? 0) > 0 ? 'Beli Replay via QRIS & Koin' : 'Beli Replay via QRIS'}
              </Button>
              <Button type="button" variant="outline" className="w-full border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => setShowPasswordDialog(true)}>
                <Lock className="w-4 h-4 mr-2" /> Buka dengan Sandi
              </Button>
            </div>
          )}

        </div>
      </div>

      <BuyShowDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        showId=""
        showTitle={replay.title}
        amount={getReplayPrice(replay)}
        itemTitle={`Replay: ${replay.title}`}
        replayId={replay.id}
        kind="replay_only"
      />

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Masukkan Sandi</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Masukkan sandi satuan atau sandi master untuk membuka replay ini.</p>
            <Input type="password" placeholder="Masukkan sandi..." value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="button" className="w-full" onClick={handleSubmitPassword} disabled={checking}>
              {checking ? 'Memeriksa...' : 'Buka Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default memo(ReplayCardComponent);

