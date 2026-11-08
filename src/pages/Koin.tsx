import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import { Coins, ArrowLeft, Loader2, CheckCircle2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { rememberPendingOrder } from '@/lib/purchaseSync';

interface Pkg { id: string; label: string; price_idr: number; coins: number; }
interface Tx { id: string; delta: number; reason: string; created_at: string; }

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export default function Koin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('replaytime-phone') || ''; } catch { return ''; } });
  const [topupOpen, setTopupOpen] = useState(false);
  const [pickedPkg, setPickedPkg] = useState<Pkg | null>(null);
  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [paid, setPaid] = useState(false);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/auth'); return; }
    const refresh = async () => {
      const [{ data: bal }, { data: pk }, { data: t }] = await Promise.all([
        supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('coin_packages').select('id,label,price_idr,coins').eq('enabled', true).order('sort_order'),
        supabase.from('coin_transactions').select('id,delta,reason,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
      ]);
      setBalance(Number(bal?.balance ?? 0));
      setPkgs((pk || []) as Pkg[]);
      setTxs((t || []) as Tx[]);
    };
    refresh();
    const ch = supabase
      .channel(`koin-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coin_balances', filter: `user_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coin_transactions', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loading, navigate]);

  const startTopup = async (pkg: Pkg) => {
    const norm = normalizePhone(phone);
    if (!/^62\d{8,13}$/.test(norm)) { toast.error('Nomor WhatsApp tidak valid'); return; }
    try { localStorage.setItem('replaytime-phone', phone); } catch { /* ignore */ }
    setPickedPkg(pkg); setTopupOpen(true); setPaid(false); setQrDataUrl(''); setOrderId(null);
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-coin-topup', { body: { package_id: pkg.id, phone: norm } });
      if (error) throw error;
      const r: any = data;
      if (!r?.ok) throw new Error(r?.error || 'gagal');
      setOrderId(r.order_id);
      rememberPendingOrder(r.order_id, { kind: 'coin_topup', showId: null, replayId: null });
      const url = await QRCode.toDataURL(r.qr_string, { width: 512, margin: 1 });
      setQrDataUrl(url);
      // Poll
      pollRef.current && clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const { data: row } = await supabase.from('orders').select('status,token_sent_at').eq('id', r.order_id).maybeSingle();
        let checked: any = null;
        try {
          const { data: chk } = await supabase.functions.invoke('check-doku-status', { body: { order_id: r.order_id } });
          checked = chk;
        } catch { /* ignore */ }
        if (row?.status === 'paid' || checked?.status === 'paid') {
          const [{ data: bal }, { data: t }] = await Promise.all([
            supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
            supabase.from('coin_transactions').select('id,delta,reason,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
          ]);
          setBalance(Number(bal?.balance ?? 0));
          setTxs((t || []) as Tx[]);
          setPaid(true);
          if (row?.token_sent_at || checked?.sent !== false) clearInterval(pollRef.current);
        }
      }, 2500);
    } catch (e: any) {
      toast.error(e?.message || 'Gagal membuat top-up');
      setTopupOpen(false);
    } finally { setCreating(false); }
  };

  useEffect(() => () => { pollRef.current && clearInterval(pollRef.current); }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 py-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-bold flex-1">Koin Saya</h1>
      </div>
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardContent className="p-6 text-center space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo Koin</div>
            <div className="flex items-center justify-center gap-2">
              <Coins className="w-8 h-8 text-primary" />
              <div className="text-4xl font-bold text-primary">{balance.toLocaleString('id-ID')}</div>
            </div>
            <p className="text-xs text-muted-foreground">Gunakan untuk membeli show & replay favorit kamu.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top-up Koin</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nomor WhatsApp</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxx" className="pl-9" />
              </div>
            </div>
            {pkgs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Belum ada paket koin tersedia.</p>}
            <div className="grid grid-cols-2 gap-2">
              {pkgs.map((p) => (
                <button key={p.id} onClick={() => startTopup(p)} className="rounded-lg border border-border bg-card p-3 text-left hover:border-primary/60 transition">
                  <div className="text-xs text-muted-foreground">{p.label || `Paket ${p.coins} koin`}</div>
                  <div className="text-lg font-bold text-primary flex items-center gap-1"><Coins className="w-4 h-4" />{p.coins.toLocaleString('id-ID')}</div>
                  <div className="text-xs text-foreground">Rp {p.price_idr.toLocaleString('id-ID')}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat Transaksi</CardTitle></CardHeader>
          <CardContent>
            {txs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Belum ada transaksi.</p>
            ) : (
              <div className="space-y-2">
                {txs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{t.reason}</div>
                      <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString('id-ID')}</div>
                    </div>
                    <div className={`font-mono font-semibold ${t.delta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {t.delta > 0 ? '+' : ''}{t.delta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Top-up {pickedPkg?.coins} koin</DialogTitle></DialogHeader>
          {creating && <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
          {!creating && !paid && qrDataUrl && (
            <div className="text-center space-y-3">
              <div className="bg-white inline-block p-3 rounded"><img src={qrDataUrl} width={240} height={240} alt="QRIS" /></div>
              <div className="text-lg font-bold text-primary">Rp {pickedPkg?.price_idr.toLocaleString('id-ID')}</div>
              <p className="text-xs text-muted-foreground">Scan QRIS untuk membayar. Saldo akan otomatis bertambah.</p>
            </div>
          )}
          {paid && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold">Pembayaran berhasil!</p>
              <p className="text-xs text-muted-foreground">+{pickedPkg?.coins} koin telah masuk ke saldo kamu.</p>
              <Button className="w-full" onClick={() => setTopupOpen(false)}>Tutup</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
