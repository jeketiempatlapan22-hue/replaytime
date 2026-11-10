import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import WaPhoneNotice from '@/components/WaPhoneNotice';
import { checkWaNumber, waBlocksPurchase, type WaCheckStatus } from '@/lib/waCheck';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Coins, Loader2, CheckCircle2, Smartphone, Mail, Sparkles, ShieldCheck, Copy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { saveMembershipCredentials } from '@/lib/membershipAccess';
import { useActiveMembership } from '@/hooks/useActiveMembership';
import MembershipDashboard from '@/components/MembershipDashboard';
import AccessInfoCard from '@/components/AccessInfoCard';
import MembershipProofUpload from '@/components/MembershipProofUpload';
import PendingApprovalNotice from '@/components/PendingApprovalNotice';
import type { ApprovalState } from '@/lib/purchaseSync';

interface Pkg {
  id: string;
  name: string;
  description: string;
  duration_days: number;
  price_idr: number;
  price_coins: number;
  pakasir_amount: number;
  quota_total: number;
  quota_reserved: number;
  max_devices: number;
  status: 'open' | 'closed';
  sort_order: number;
  fixed_starts_at: string | null;
  fixed_expires_at: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function pkgPeriodLabel(p: Pick<Pkg, 'fixed_starts_at' | 'fixed_expires_at' | 'duration_days'>) {
  if (p.fixed_expires_at) {
    const start = p.fixed_starts_at ? fmtDate(p.fixed_starts_at) : fmtDate(new Date().toISOString());
    return `Berlaku ${start} – ${fmtDate(p.fixed_expires_at)}`;
  }
  return `Aktif ${p.duration_days} hari`;
}

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export default function Membership() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { membership: activeMembership, refresh: refreshMembership } = useActiveMembership();
  const [showShop, setShowShop] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [balance, setBalance] = useState(0);
  const [pkgsLoading, setPkgsLoading] = useState(true);

  const [pickOpen, setPickOpen] = useState(false);
  const [picked, setPicked] = useState<Pkg | null>(null);
  const [email, setEmail] = useState('');
  const [waStatus, setWaStatus] = useState<WaCheckStatus>('idle');
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('replaytime-phone') || ''; } catch { return ''; } });
  const [payMode, setPayMode] = useState<'qris' | 'coins'>('qris');
  const [submitting, setSubmitting] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState(0);
  const [paid, setPaid] = useState(false);
  const [approvalState, setApprovalState] = useState<ApprovalState | null>(null);
  const [adminWa, setAdminWa] = useState('');

  const [successOpen, setSuccessOpen] = useState(false);
  const [successLink, setSuccessLink] = useState('');
  const [successToken, setSuccessToken] = useState('');
  const [successPassword, setSuccessPassword] = useState('');

  const pollRef = useRef<any>(null);

  useEffect(() => {
    void supabase.from('site_settings').select('value').eq('key', 'owner_wa_number').maybeSingle().then(({ data }) => setAdminWa(data?.value || ''));
    try {
      const saved = JSON.parse(localStorage.getItem('replaytime-membership-order') || 'null');
      if (saved?.id) { setOrderId(saved.id); setOrderAmount(saved.amount || 0); setPicked(saved.pkg); }
    } catch { /* no pending order */ }
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const { data: s } = await supabase.functions.invoke('check-pakasir-status', { body: { order_id: orderId } });
        if (s?.status === 'awaiting_approval' || s?.status === 'rejected') setApprovalState(s.status);
        if (s?.status === 'paid' && s.token) {
          saveMembershipCredentials(s.token, s.password || '');
          setSuccessToken(s.token); setSuccessPassword(s.password || '');
          setSuccessLink(new URL(s.link || '/live', window.location.origin).href);
          setPaid(true); setApprovalState(null); refreshMembership();
          localStorage.removeItem('replaytime-membership-order');
        }
      } catch { /* retry on the next poll */ } finally { running = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 3000);
    return () => clearInterval(timer);
    // Keep polling stable when membership refresh updates the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Fetch packages + balance + realtime
  useEffect(() => {
    const load = async () => {
      setPkgsLoading(true);
      const { data } = await (supabase as any)
        .from('membership_packages')
        .select('id,name,description,duration_days,price_idr,price_coins,pakasir_amount,quota_total,quota_reserved,max_devices,status,sort_order,fixed_starts_at,fixed_expires_at')
        .eq('show_to_user', true)
        .order('sort_order')
        .order('created_at');
      setPkgs((data || []) as Pkg[]);
      setPkgsLoading(false);
    };
    void load();
    const ch = supabase
      .channel('membership-packages-public')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_packages' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_orders' }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchBal = async () => {
      const { data } = await supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle();
      setBalance(Number(data?.balance ?? 0));
    };
    void fetchBal();
    const ch = supabase
      .channel(`mb-bal-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coin_balances', filter: `user_id=eq.${user.id}` }, fetchBal)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Prefill email/phone from profile
  useEffect(() => {
    if (!user) return;
    setEmail((prev) => prev || user.email || '');
    if (!phone) {
      void supabase.from('profiles').select('phone').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        if (data?.phone) setPhone(String(data.phone));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openPicker = (p: Pkg) => {
    // Guest BOLEH beli via QRIS; koin tetap perlu login. Default ke QRIS jika belum login.
    setPicked(p);
    setPayMode(user ? 'qris' : 'qris');
    setPickOpen(true);
  };


  const submit = async () => {
    if (!picked) return;
    const e = email.trim().toLowerCase();
    const ph = normalizePhone(phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast.error('Email tidak valid'); return; }
    if (!/^62\d{8,13}$/.test(ph)) { toast.error('Nomor WhatsApp tidak valid'); return; }
    setWaStatus('checking');
    const wa = await checkWaNumber(ph);
    setWaStatus(wa);
    if (waBlocksPurchase(wa)) { toast.error('Nomor ini tidak terdaftar di WhatsApp.'); return; }
    try { localStorage.setItem('replaytime-phone', phone); } catch { /* ignore */ }

    setSubmitting(true);
    try {
      if (payMode === 'coins') {
        if (!user) {
          toast.error('Login dulu untuk membayar dengan koin.');
          navigate('/auth?next=/membership');
          setSubmitting(false); return;
        }
        if (balance < picked.price_coins) {
          toast.error(`Koin kurang. Butuh ${picked.price_coins}, saldo ${balance}.`);
          setSubmitting(false); return;
        }

        const { data, error } = await supabase.functions.invoke('purchase-membership-with-coins', {
          body: { package_id: picked.id, email: e, phone: ph },
        });
        if (error) throw error;
        const r: any = data;
        if (!r?.ok) throw new Error(r?.error || 'gagal');
        setPickOpen(false);
        setSuccessLink(r.link); setSuccessToken(r.token); setSuccessPassword(r.password);
        saveMembershipCredentials(r.token, r.password);
        setSuccessOpen(true);
        toast.success('Membership aktif! Cek WhatsApp untuk detail.');
      } else {
        const { data, error } = await supabase.functions.invoke('create-membership-order', {
          body: { package_id: picked.id, email: e, phone: ph },
        });
        if (error) throw error;
        const r: any = data;
        if (!r?.ok) throw new Error(r?.error || 'gagal');
        setPickOpen(false);
        setOrderId(r.order_id);
        setApprovalState(null);
        localStorage.setItem('replaytime-membership-order', JSON.stringify({ id: r.order_id, amount: r.amount, pkg: picked }));
        setOrderAmount(r.amount);
        const url = await QRCode.toDataURL(r.qr_string, { width: 512, margin: 1 });
        setQrDataUrl(url);
        setPaid(false);
        setPayOpen(true);

      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('sold_out')) toast.error('Maaf, kuota baru saja habis.');
      else if (msg.includes('package_closed')) toast.error('Paket sudah ditutup admin.');
      else if (msg.includes('insufficient_balance')) toast.error('Koin tidak cukup.');
      else toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => () => { pollRef.current && clearInterval(pollRef.current); }, []);

  const visiblePkgs = useMemo(() => pkgs, [pkgs]);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-bold flex-1 flex items-center gap-2"><Crown className="w-5 h-5 text-primary" /> Show Membership</h1>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {approvalState && <PendingApprovalNotice state={approvalState} adminWa={adminWa} itemTitle={picked?.name || 'Membership'} orderId={orderId || undefined} phone={phone} />}
        {approvalState && <Button variant="outline" onClick={() => setProofOpen(true)}><Upload className="w-4 h-4 mr-2" />Upload Bukti (Opsional)</Button>}
        {activeMembership && !showShop ? (
          <MembershipDashboard membership={activeMembership} onShopMore={() => setShowShop(true)} />
        ) : (
        <>
        {activeMembership && showShop && (
          <Button variant="ghost" size="sm" onClick={() => setShowShop(false)} className="-mt-2"><ArrowLeft className="w-4 h-4 mr-1" /> Kembali ke dasbor membership</Button>
        )}
        <Card className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-primary/30">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-xl font-bold">Nikmati Akses Penuh Live Show</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Beli paket membership untuk akses semua live show dalam periode aktif. Setelah pembayaran,
              link membership otomatis dikirim ke WhatsApp Anda.
            </p>
            {user && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                <Coins className="w-3.5 h-3.5 text-primary" /> Saldo koin: <span className="font-semibold text-foreground">{balance.toLocaleString('id-ID')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {pkgsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : visiblePkgs.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            Membership belum dibuka. Pantau terus 💖
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {visiblePkgs.map((p) => {
              const remaining = Math.max(0, p.quota_total - p.quota_reserved);
              const soldOut = remaining <= 0;
              const closed = p.status === 'closed';
              const disabled = soldOut || closed;
              const pct = p.quota_total > 0 ? Math.min(100, Math.round((p.quota_reserved / p.quota_total) * 100)) : 0;
              return (
                <Card key={p.id} className={`border-2 ${disabled ? 'border-border opacity-70' : 'border-primary/30 hover:border-primary/60'} transition`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-base leading-tight">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{pkgPeriodLabel(p)} · {p.max_devices} perangkat</div>
                      </div>
                      {closed ? (
                        <Badge variant="secondary" className="shrink-0">DITUTUP</Badge>
                      ) : soldOut ? (
                        <Badge variant="destructive" className="shrink-0">SOLD OUT</Badge>
                      ) : (
                        <Badge className="shrink-0 bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">AKTIF</Badge>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 flex-wrap">
                      <div className="text-2xl font-bold text-primary">Rp {p.price_idr.toLocaleString('id-ID')}</div>
                      {p.price_coins > 0 && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          atau <Coins className="w-3 h-3 text-primary" /> <span className="font-semibold text-foreground">{p.price_coins.toLocaleString('id-ID')}</span> koin
                        </div>
                      )}
                    </div>

                    {p.description && (
                      <div className="text-xs whitespace-pre-line text-foreground/90 border-l-2 border-primary/30 pl-2">
                        {p.description}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Slot tersisa</span>
                        <span className="font-mono">{remaining} / {p.quota_total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <Button className="w-full" disabled={disabled} onClick={() => openPicker(p)}>
                      {closed ? 'Membership Ditutup' : soldOut ? 'Kuota Habis' : 'Beli Sekarang'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                      onClick={() => { setPicked(p); setOrderId(null); setOrderAmount(p.price_idr); setProofOpen(true); }}
                    >
                      <Upload className="w-3.5 h-3.5" /> Sudah Bayar? Kirim Bukti & Hubungi Admin
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground justify-center pt-2">
          <ShieldCheck className="w-3.5 h-3.5" /> Pembayaran aman via QRIS · Token otomatis terkirim ke WhatsApp
        </div>
        </>
        )}
      </div>

      {/* Picker dialog: input email + phone + pilih metode */}
      <Dialog open={pickOpen} onOpenChange={(o) => { if (!submitting) setPickOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Konfirmasi Pembelian</DialogTitle>
            <DialogDescription className="text-xs">{picked?.name} · {picked ? pkgPeriodLabel(picked) : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="nama@email.com" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nomor WhatsApp</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={phone} onChange={(e) => { setPhone(e.target.value); setWaStatus('idle'); }} className="pl-9" placeholder="0812xxxx" />
              </div>
              <p className="text-[10px] text-muted-foreground">Link token akan dikirim ke nomor ini.</p>
              <WaPhoneNotice status={waStatus} adminWa={adminWa} item={`Membership ${picked?.name || ''}`} phone={normalizePhone(phone)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Metode Pembayaran</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMode('qris')}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition ${payMode === 'qris' ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <div className="font-semibold">QRIS</div>
                  <div className="text-muted-foreground">Rp {picked?.price_idr.toLocaleString('id-ID')}</div>
                </button>
                <button
                  type="button"
                  disabled={!picked?.price_coins}
                  onClick={() => setPayMode('coins')}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${payMode === 'coins' ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <div className="font-semibold flex items-center gap-1"><Coins className="w-3 h-3" /> Koin</div>
                  <div className="text-muted-foreground">{picked?.price_coins || 0} koin{picked && balance < (picked.price_coins || Infinity) ? ' · kurang' : ''}</div>
                </button>
              </div>
            </div>

            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : payMode === 'coins' ? 'Tukar Koin' : 'Bayar dengan QRIS'}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Slot ditahan 5 menit. Jika tidak dibayar, slot otomatis dilepas.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* QRIS dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bayar Membership</DialogTitle>
            <DialogDescription className="text-xs">{picked?.name}</DialogDescription>
          </DialogHeader>
          {!paid && !approvalState && qrDataUrl && (
            <div className="text-center space-y-3">
              <div className="bg-white inline-block p-3 rounded">
                <img src={qrDataUrl} width={240} height={240} alt="QRIS" />
              </div>
              <div className="text-lg font-bold text-primary">Rp {orderAmount.toLocaleString('id-ID')}</div>
              <p className="text-xs text-muted-foreground">Scan QRIS untuk membayar. Link membership akan dikirim ke WhatsApp.</p>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-left space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400">Sudah bayar tapi belum dapat link?</p>
                <p className="text-muted-foreground">Upload bukti transfer/QRIS, lalu admin akan menghubungi Anda di WhatsApp.</p>
                <Button size="sm" variant="outline" className="w-full gap-1 h-8 text-xs" onClick={() => setProofOpen(true)}>
                  <Upload className="w-3 h-3" /> Kirim Bukti Transaksi
                </Button>
              </div>
            </div>
          )}
          {approvalState && <>
            <PendingApprovalNotice state={approvalState} adminWa={adminWa} itemTitle={picked?.name || 'Membership'} orderId={orderId || undefined} phone={phone} />
            <Button variant="outline" onClick={() => setProofOpen(true)}><Upload className="w-4 h-4 mr-2" />Upload Bukti (Opsional)</Button>
          </>}
          {paid && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold">Pembayaran berhasil!</p>
              <p className="text-xs text-muted-foreground">Membership sudah aktif di perangkat ini. Link juga dikirim ke WhatsApp.</p>
              {successLink && (
                <div className="flex gap-1">
                  <Input readOnly value={successLink} className="text-xs" />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(successLink); toast.success('Link disalin'); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {successToken && <AccessInfoCard mtoken={successToken} mpassword={successPassword} fallbackLink={successLink} compact />}
              <Button className="w-full" onClick={() => { setPayOpen(false); refreshMembership(); navigate(successToken ? `/live?mtoken=${encodeURIComponent(successToken)}&mp=${encodeURIComponent(successPassword)}` : '/live'); }}>Tonton Live</Button>
              <Button variant="outline" className="w-full" onClick={() => { setPayOpen(false); refreshMembership(); navigate('/'); }}>Tonton Replay</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Coin-success dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-500" /> Membership Aktif</DialogTitle>
            <DialogDescription className="text-xs">Link akses juga dikirim ke WhatsApp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Token</Label>
              <div className="flex gap-1">
                <Input readOnly value={successToken} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(successToken); toast.success('Token disalin'); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link Akses</Label>
              <div className="flex gap-1">
                <Input readOnly value={successLink} className="text-xs" />
                <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(successLink); toast.success('Link disalin'); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            {successToken && <AccessInfoCard mtoken={successToken} mpassword={successPassword} fallbackLink={successLink} compact />}
            <Button className="w-full" onClick={() => { setSuccessOpen(false); refreshMembership(); navigate('/live'); }}>Tonton Live</Button>
            <Button variant="outline" className="w-full" onClick={() => { setSuccessOpen(false); refreshMembership(); navigate('/'); }}>Tonton Replay</Button>
          </div>
        </DialogContent>
      </Dialog>

      <MembershipProofUpload
        open={proofOpen}
        onOpenChange={setProofOpen}
        orderId={orderId}
        packageName={picked?.name || ''}
        amount={orderAmount}
        defaultEmail={email}
        defaultPhone={phone}
      />
    </div>
  );
}
