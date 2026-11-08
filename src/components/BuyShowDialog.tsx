import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Copy, Smartphone, ExternalLink, MessageCircle, AlertTriangle, Coins, Lock, Upload, Play } from 'lucide-react';
import { setShowPurchase, setReplayPurchase } from '@/lib/purchases';
import { rememberPendingOrder } from '@/lib/purchaseSync';
import MembershipProofUpload from '@/components/MembershipProofUpload';
import { adminWaNumber } from '@/lib/adminWa';
import AccessInfoCard from '@/components/AccessInfoCard';
import { getShowBundle, claimBundleToken, persistBundleShowTokens, rememberBundleToken } from '@/lib/bundle';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showId?: string;
  showTitle: string;
  amount: number;
  itemTitle: string;
  replayId?: string | null;
  kind?: 'show' | 'replay' | 'replay_only' | 'bundle';
  defaultMethod?: 'qris' | 'coin';
}

type Status = 'form' | 'creating' | 'qr' | 'paid' | 'expired' | 'static_qris';
const EXPIRY_MS = 30 * 60 * 1000;

export default function BuyShowDialog({ open, onOpenChange, showId = '', showTitle, amount, itemTitle, replayId, kind = 'show', defaultMethod }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [method, setMethod] = useState<'qris' | 'coin'>(defaultMethod || 'qris');
  // Harga terbaru dari server (bundel/show bisa berubah setelah kartu dirender),
  // supaya nominal yang ditampilkan selalu sama dengan QRIS dinamis yang dibuat.
  const [liveAmount, setLiveAmount] = useState<number | null>(null);
  const payAmount = liveAmount ?? amount;
  const qrisAvailable = payAmount >= 100;
  const [coinPrice, setCoinPrice] = useState<number>(0);
  const [coinBalance, setCoinBalance] = useState<number>(0);
  const [coinBusy, setCoinBusy] = useState(false);
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('replaytime-phone') || ''; } catch { return ''; } });
  const [status, setStatus] = useState<Status>('form');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrString, setQrString] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [totalPayment, setTotalPayment] = useState<number>(0);
  const [pakasirOrderId, setPakasirOrderId] = useState<string>('');
  const [accessToken, setAccessToken] = useState<string>('');
  const [waSent, setWaSent] = useState<boolean | null>(null);
  const [createdAt, setCreatedAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [lastChecked, setLastChecked] = useState<number>(0);
  const [staticQrisUrl, setStaticQrisUrl] = useState<string>('');
  const [proofOpen, setProofOpen] = useState(false);
  const [ownerWa, setOwnerWa] = useState<string>('');
  const [useStaticQris, setUseStaticQris] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load admin contact + static QRIS settings + coin price/balance when dialog opens
  useEffect(() => {
    if (!open) return;
    if (defaultMethod) setMethod(defaultMethod);
    (async () => {
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('key,value')
          .in('key', ['static_qris_url', 'owner_wa_number', 'admin_wa_phone', 'use_static_qris']);
        const m = new Map((data || []).map((r: any) => [r.key, String(r.value || '')]));
        setStaticQrisUrl(m.get('static_qris_url') || '');
        setOwnerWa(m.get('owner_wa_number') || m.get('admin_wa_phone') || '');
        setUseStaticQris((m.get('use_static_qris') || 'false') === 'true');
      } catch { /* ignore */ }
      // Coin price for the item
      try {
        let price = 0;
        if (kind === 'bundle') {
          const b = await getShowBundle();
          price = b?.price_coins || 0;
          if (b) setLiveAmount(Number(b.price_idr || 0));
        } else if (kind === 'replay_only' && replayId) {
          const { data: r } = await supabase.from('replays').select('price_coins,price_idr').eq('id', replayId).maybeSingle();
          price = (r as any)?.price_coins || 0;
          const pr = Number((r as any)?.price_idr || 0);
          if (pr >= 100) setLiveAmount(pr);
        } else if (showId) {
          const { data: s } = await supabase
            .from('active_shows')
            .select('price_show_coins,price_replay_coins,price_show,price_replay,pakasir_amount')
            .eq('id', showId)
            .maybeSingle();
          price = kind === 'replay' ? ((s as any)?.price_replay_coins || 0) : ((s as any)?.price_show_coins || 0);
          const sa = kind === 'replay'
            ? Number((s as any)?.price_replay || 0) || Number((s as any)?.pakasir_amount || 0)
            : Number((s as any)?.price_show || 0) || Number((s as any)?.pakasir_amount || 0);
          if (sa >= 100) setLiveAmount(sa);
        }
        setCoinPrice(price);
        // Default to coin tab when QRIS is unavailable but coin price is set
        if (!qrisAvailable && price > 0) setMethod('coin');
        else if (qrisAvailable && price <= 0) setMethod('qris');
      } catch { setCoinPrice(0); }
      // Balance
      if (user) {
        try {
          const { data: b } = await supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle();
          setCoinBalance((b as any)?.balance || 0);
          // Autofill phone from profile
          if (!phone) {
            const { data: p } = await supabase.from('profiles').select('phone').eq('user_id', user.id).maybeSingle();
            const ph = (p as any)?.phone || '';
            if (ph) setPhone(ph);
          }
        } catch { /* ignore */ }
      } else {
        setCoinBalance(0);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showId, replayId, kind, user]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStatus('form');
      setOrderId(null);
      setQrUrl(''); setQrString(''); setQrDataUrl(''); setTotalPayment(0);
      setLiveAmount(null);
      setPakasirOrderId('');
      setAccessToken('');
      setWaSent(null);
      setCreatedAt(0);
      try { channelRef.current && supabase.removeChannel(channelRef.current); } catch { /* ignore */ }
      channelRef.current = null;
    }
  }, [open]);

  // Tick clock for countdown
  useEffect(() => {
    if (status !== 'qr') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Auto-expire
  useEffect(() => {
    if (status !== 'qr' || !createdAt) return;
    if (now - createdAt > EXPIRY_MS) setStatus('expired');
  }, [now, createdAt, status]);

  // Persist purchase locally so user does not need to repurchase next visit.
  const persistPaid = (token: string, showTokens?: Record<string, string>) => {
    if (!token) return;
    if (kind === 'bundle') {
      rememberBundleToken(token, showTokens ? Object.keys(showTokens) : undefined);
      if (showTokens && Object.keys(showTokens).length) persistBundleShowTokens(showTokens);
      else void claimBundleToken(token);
    } else if (kind === 'replay_only' && replayId) {
      setReplayPurchase(replayId, { token, paidAt: Date.now() });
    } else if (showId) {
      setShowPurchase(showId, { token, kind: kind === 'replay' ? 'replay' : 'show', paidAt: Date.now() });
    }
  };

  // Realtime subscribe to order status when QR shown
  useEffect(() => {
    if (status !== 'qr' || !orderId) return;
    const ch = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload: any) => {
        const row = payload?.new;
        if (row?.status === 'paid' && row?.access_token) {
          const tok = row.access_token || '';
          setAccessToken(tok);
          setWaSent(row.token_sent_at ? true : false);
          persistPaid(tok);
          setStatus('paid');
        }
      })
      .subscribe();
    channelRef.current = ch;
    // Poll agresif: DB + server cek Pakasir langsung agar token cepat keluar meski webhook terlambat.
    let tick = 0;
    const poll = setInterval(async () => {
      tick++;
      const { data } = await supabase.from('orders').select('status, access_token, token_sent_at').eq('id', orderId).maybeSingle();
      setLastChecked(Date.now());
      if (data?.status === 'paid' && (data as any).access_token) {
        const tok = (data as any).access_token || '';
        setAccessToken(tok);
        setWaSent((data as any).token_sent_at ? true : false);
        persistPaid(tok);
        setStatus('paid');
        return;
      }
      try {
        const { data: chk } = await supabase.functions.invoke('check-pakasir-status', { body: { order_id: orderId } });
        const c = chk as any;
        if (c?.status === 'paid' && c?.access_token) {
          setAccessToken(c.access_token);
          setWaSent(typeof c.sent === 'boolean' ? c.sent : null);
          persistPaid(c.access_token);
          setStatus('paid');
        }
      } catch { /* ignore */ }
    }, tick < 45 ? 2000 : 4000);
    return () => {
      try { supabase.removeChannel(ch); } catch { /* ignore */ }
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, orderId]);

  const normalizePhone = (raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (d.startsWith('62')) return d;
    if (d.startsWith('0')) return '62' + d.slice(1);
    if (d.startsWith('8')) return '62' + d;
    return d;
  };

  const handleCreate = async () => {
    // QRIS tidak wajib login — siapa pun yang punya nomor HP boleh membayar.
    const norm = normalizePhone(phone);
    if (!/^628\d{8,11}$/.test(norm)) {
      toast.error('Nomor WhatsApp tidak valid. Contoh: 0812xxxx');
      return;
    }
    if (!payAmount || payAmount <= 0) {
      toast.error('Nominal pembayaran belum diatur. Hubungi admin.');
      return;
    }
    try { localStorage.setItem('replaytime-phone', phone); } catch { /* ignore */ }
    // Admin mengaktifkan QRIS statis: berlaku untuk semua pembelian (show maupun replay).
    if (useStaticQris) { setStatus('static_qris'); return; }
    setStatus('creating');
    try {
      const { data, error } = await supabase.functions.invoke('create-pakasir-order', {
        body: {
          phone: norm,
          show_id: (kind === 'replay_only' || kind === 'bundle') ? undefined : showId,
          replay_id: replayId || undefined,
          item_title: itemTitle,
          amount: payAmount,
          kind,
        },
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error || 'Gagal membuat order');
      setOrderId(r.order_id);
      rememberPendingOrder(r.order_id, { kind, showId: showId || null, replayId: replayId || null });
      setPakasirOrderId(r.pakasir_order_id);
      setQrUrl(r.qr_url || '');
      setQrString(r.qr_string || '');
      // Server adalah sumber kebenaran harga: tampilkan nominal yang benar-benar
      // dipakai pada QRIS dinamis.
      const serverAmount = Number(r.amount || 0);
      if (serverAmount >= 100) setLiveAmount(serverAmount);
      setTotalPayment(Number(r.total_payment || serverAmount || payAmount));
      if (r.qr_string) {
        try {
          const dataUrl = await QRCode.toDataURL(r.qr_string, { width: 512, margin: 1, errorCorrectionLevel: 'M' });
          setQrDataUrl(dataUrl);
        } catch { /* ignore */ }
      }
      setCreatedAt(Date.now());
      setNow(Date.now());
      setStatus('qr');
    } catch (e: any) {
      const msg = e?.message || 'Gagal membuat order';
      // QRIS statis hanya dipakai kalau admin memang mengaktifkannya.
      if (useStaticQris && staticQrisUrl) {
        toast.error(`${msg}. Gunakan QRIS statis di bawah.`);
        setStatus('static_qris');
      } else {
        toast.error(`${msg}. Silakan coba lagi.`);
        setStatus('form');
      }
    }
  };

  const handleCoinPurchase = async () => {
    if (!user) {
      toast.error('Login dulu untuk membeli dengan koin.');
      navigate('/auth?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    const norm = normalizePhone(phone);
    if (!/^628\d{8,11}$/.test(norm)) {
      toast.error('Nomor WhatsApp tidak valid.');
      return;
    }
    if (coinPrice <= 0) { toast.error('Item ini belum bisa dibeli pakai koin.'); return; }
    if (coinBalance < coinPrice) { toast.error('Saldo koin tidak cukup. Silakan top-up.'); navigate('/koin'); return; }
    try { localStorage.setItem('replaytime-phone', phone); } catch { /* ignore */ }
    setCoinBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-with-coins', {
        body: {
          phone: norm,
          show_id: (kind === 'replay_only' || kind === 'bundle') ? undefined : showId,
          replay_id: replayId || undefined,
          item_title: itemTitle,
          kind,
        },
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error || 'Gagal memproses pembelian');
      setAccessToken(r.access_token || '');
      setWaSent(typeof r.sent === 'boolean' ? r.sent : null);
      persistPaid(r.access_token || '', r.show_tokens || undefined);
      setCoinBalance(r.new_balance ?? Math.max(0, coinBalance - coinPrice));
      setStatus('paid');
      toast.success(r.sent === false ? 'Pembelian berhasil! WA gagal/lambat, salin link token di bawah.' : 'Pembelian berhasil! Token dikirim via WhatsApp.');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal memproses pembelian');
    } finally {
      setCoinBusy(false);
    }
  };

  const adminWaUrl = (() => {
    const num = adminWaNumber(ownerWa);
    const desc = `Halo Admin, saya ingin konfirmasi pembayaran:%0A%0A• Item: ${encodeURIComponent(itemTitle)}%0A• Show: ${encodeURIComponent(showTitle)}%0A• Nominal: Rp ${payAmount.toLocaleString('id-ID')}%0A• Nomor saya: ${normalizePhone(phone) || '-'}${pakasirOrderId ? `%0A• Order ID: ${pakasirOrderId}` : ''}%0A%0AMohon dikirimkan token akses setelah pembayaran terkonfirmasi. Terima kasih 🙏`;
    return `https://wa.me/${num}?text=${desc}`;
  })();

  const remaining = Math.max(0, EXPIRY_MS - (now - createdAt));
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  const copyToken = async () => {
    try { await navigator.clipboard.writeText(accessToken); toast.success('Token disalin'); } catch { /* ignore */ }
  };

  const accessLink = accessToken
    ? (kind === 'bundle'
      ? `${window.location.origin}/shows?bt=${accessToken}`
      : kind === 'show' && showId && !replayId
      ? `${window.location.origin}/live?show=${showId}&t=${accessToken}`
      : `${window.location.origin}/akses?token=${accessToken}${replayId ? `&replay=${replayId}` : ''}`)
    : '';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(accessLink); toast.success('Link disalin'); } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{itemTitle}</DialogTitle>
          <DialogDescription className="line-clamp-2">{showTitle}</DialogDescription>
        </DialogHeader>

        {status === 'form' && (
          <div className="space-y-4">
            {!user && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs">
                <Lock className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold mb-0.5">Login opsional</div>
                  <div className="text-muted-foreground">QRIS bisa dipakai tanpa login. Pembelian dengan koin memerlukan akun.</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/auth?redirect=' + encodeURIComponent(window.location.pathname))}>Login</Button>
              </div>
            )}

            <Tabs value={method} onValueChange={(v) => setMethod(v as 'qris' | 'coin')}>
              <TabsList className={`grid w-full ${qrisAvailable && coinPrice > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {qrisAvailable && (
                  <TabsTrigger value="qris"><Smartphone className="w-4 h-4 mr-1.5" /> QRIS</TabsTrigger>
                )}
                {coinPrice > 0 && (
                  <TabsTrigger value="coin"><Coins className="w-4 h-4 mr-1.5" /> Tukar {coinPrice} Koin</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="qris" className="space-y-4 mt-4">
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Total Pembayaran</div>
                  <div className="text-2xl font-bold text-primary">Rp {payAmount.toLocaleString('id-ID')}</div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-buy">Nomor WhatsApp</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="phone-buy" type="tel" inputMode="numeric" placeholder="0812xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" />
                  </div>
                  <p className="text-xs text-muted-foreground">Token akses akan dikirim ke nomor ini setelah pembayaran lunas.</p>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={!phone}>
                  Lanjut ke Pembayaran
                </Button>
              </TabsContent>

              <TabsContent value="coin" className="space-y-4 mt-4">
                <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Harga</span><span className="font-semibold text-primary">{coinPrice} koin</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Saldo Anda</span><span className={`font-semibold ${coinBalance >= coinPrice ? 'text-foreground' : 'text-destructive'}`}>{coinBalance} koin</span></div>
                  {coinBalance < coinPrice && (
                    <p className="text-[11px] text-destructive pt-1">Saldo kurang. <button onClick={() => navigate('/koin')} className="underline">Top-up koin</button></p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-coin">Nomor WhatsApp</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="phone-coin" type="tel" inputMode="numeric" placeholder="0812xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9" />
                  </div>
                  <p className="text-xs text-muted-foreground">Token akses akan dikirim ke WhatsApp ini.</p>
                </div>
                <Button className="w-full" onClick={handleCoinPurchase} disabled={!phone || !user || coinBusy || coinBalance < coinPrice}>
                  {coinBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
                  Tukar {coinPrice} Koin
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {status === 'creating' && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Menyiapkan QRIS...</p>
          </div>
        )}

        {status === 'qr' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-4 text-center space-y-3">
              <div className="text-xs text-muted-foreground">Scan QRIS dengan e-wallet / m-banking</div>
              {qrDataUrl ? (
                <div className="mx-auto bg-white p-3 rounded-md inline-block">
                  <img src={qrDataUrl} alt="QRIS Pembayaran" width={260} height={260} className="block" />
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Membuat QR...</p>
                </div>
              )}
              <div className="text-base font-bold text-primary">
                Rp {(totalPayment || payAmount).toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-muted-foreground">Order ID: {pakasirOrderId}</div>
              {qrUrl && (
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Buka di halaman Pakasir
                </a>
              )}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">QRIS berlaku selama</span>
              <span className="font-mono font-semibold text-primary">{mm}:{ss}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="flex-1">Mengecek status pembayaran… otomatis berubah saat lunas.</span>
              {lastChecked > 0 && (
                <span className="font-mono text-[10px] opacity-70">
                  {new Date(lastChecked).toLocaleTimeString('id-ID', { hour12: false })}
                </span>
              )}
            </div>
            <a href={adminWaUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary hover:underline">
              <MessageCircle className="w-3 h-3" /> Pembayaran bermasalah? Hubungi admin
            </a>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setProofOpen(true)}>
              <Upload className="w-3.5 h-3.5" /> Sudah bayar? Kirim bukti transfer
            </Button>
          </div>
        )}

        {status === 'paid' && (
          <div className="space-y-3 py-2">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-base font-semibold text-foreground">Pembayaran Berhasil!</p>
              <p className="text-xs text-muted-foreground text-center">
                Akses Anda sudah aktif. Langsung tekan tombol tonton di bawah ini.
              </p>
            </div>
            {accessToken && (
              <>
                <AccessInfoCard
                  token={accessToken}
                  showId={(kind === 'replay_only' || kind === 'bundle') ? undefined : showId}
                  replayId={replayId || undefined}
                  fallbackLink={accessLink}
                  compact
                />
                <Button
                  size="lg"
                  className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    onOpenChange(false);
                    const path = accessLink.replace(window.location.origin, '');
                    navigate(path);
                  }}
                >
                  <Play className="w-4 h-4" />
                  {kind === 'bundle'
                    ? 'Tonton Sekarang (Bundle)'
                    : kind === 'show'
                      ? 'Tonton Live Sekarang'
                      : 'Tonton Replay Sekarang'}
                </Button>
              </>
            )}
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Tutup</Button>
          </div>
        )}

        {status === 'expired' && (
          <div className="space-y-3 py-2 text-center">
            <p className="text-sm text-foreground">QRIS kadaluarsa. Silakan ulangi.</p>
            <Button className="w-full" onClick={() => setStatus('form')}>Buat Ulang</Button>
          </div>
        )}

        {status === 'static_qris' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-foreground">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">{useStaticQris ? 'Pembayaran memakai QRIS statis.' : 'QRIS dinamis sedang gangguan.'}</div>
                <div className="text-muted-foreground">Bayar sesuai nominal lewat QRIS di bawah, lalu kirim bukti transfer / hubungi admin untuk menerima token akses.</div>
              </div>
            </div>

            {staticQrisUrl ? (
              <div className="rounded-lg border border-border bg-card p-4 text-center space-y-3">
                <div className="text-xs text-muted-foreground">Scan QRIS statis</div>
                <div className="mx-auto bg-white p-3 rounded-md inline-block">
                  <img src={staticQrisUrl} alt="QRIS Statis" className="max-w-[260px] max-h-[260px] block" />
                </div>
                <div className="text-xs text-muted-foreground">Nominal yang harus dibayar</div>
                <div className="text-xl font-bold text-primary">Rp {payAmount.toLocaleString('id-ID')}</div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
                QRIS statis belum diatur admin. Silakan langsung hubungi admin.
              </div>
            )}

            <Button asChild className="w-full" size="lg">
              <a href={adminWaUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4 mr-2" /> Hubungi Admin
              </a>
            </Button>

            <Button variant="outline" className="w-full gap-1.5" onClick={() => setProofOpen(true)}>
              <Upload className="w-4 h-4" /> Kirim Bukti Transfer
            </Button>

            {!useStaticQris && (
              <Button variant="ghost" className="w-full" onClick={() => setStatus('form')}>
                Coba QRIS dinamis lagi
              </Button>
            )}
          </div>
        )}
        <MembershipProofUpload
          open={proofOpen}
          onOpenChange={setProofOpen}
          showOrderId={orderId}
          packageName={itemTitle}
          amount={totalPayment || payAmount}
          defaultEmail={''}
          defaultPhone={phone}
        />
      </DialogContent>
    </Dialog>
  );
}
