import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Save, LogOut, Coins, AtSign, KeyRound, MessageCircle, Eye, EyeOff, Crown, Copy, ExternalLink, Clock, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { adminWaNumber, normalizeWa } from '@/lib/adminWa';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { saveMembershipCredentials } from '@/lib/membershipAccess';
import DeviceResetPicker, { type ResetTarget } from '@/components/DeviceResetPicker';
import AccessInfoCard from '@/components/AccessInfoCard';
import PurchaseHistoryList from '@/components/PurchaseHistoryList';
import GameWinsHistory from '@/components/GameWinsHistory';
import GuestChoice from '@/components/GuestChoice';
import GuestProfile from '@/components/GuestProfile';
import { getGuestAccount, type GuestAccount } from '@/lib/guest';



interface MyMembership {
  order_id: string;
  package_id: string;
  package_name: string;
  status: string;
  kind: string;
  amount: number;
  coin_amount: number;
  created_at: string;
  reserved_until: string | null;
  paid_at: string | null;
  token: string | null;
  password: string | null;
  expires_at: string | null;
  starts_at?: string | null;
  duration_days: number | null;
  max_devices: number | null;
  days_remaining: number | null;
  revoked: boolean;
  package_paused: boolean;
  pause_message: string | null;
}

interface MyOrder {
  id: string;
  item_title: string | null;
  show_id: string | null;
  replay_id: string | null;
  access_token: string | null;
  paid_at: string | null;
}

export default function Profil() {

  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [adminPhone, setAdminPhone] = useState<string>('');
  const [memberships, setMemberships] = useState<MyMembership[]>([]);
  const [memLoading, setMemLoading] = useState(true);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  // Jadwal show per show_id: link token satuan kedaluwarsa 24 jam setelah jadwal show.
  const [showSched, setShowSched] = useState<Record<string, { endMs: number; converted: boolean }>>({});
  const [guest, setGuest] = useState<GuestAccount | null>(() => getGuestAccount());
  const [openMem, setOpenMem] = useState<string | null>(null);


  const [tgCode, setTgCode] = useState('');
  const [tgLinked, setTgLinked] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  const handleTelegramLink = async () => {
    if (!phone) { toast.error('Isi nomor HP dulu lalu simpan, baru hubungkan Telegram'); return; }
    setTgBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('telegram-link-code', {
        body: { phone },
        headers: session.session?.access_token ? { Authorization: `Bearer ${session.session.access_token}` } : undefined,
      });
      const d = res.data as any;
      if (res.error || !d?.ok) throw new Error(d?.error === 'phone_not_found' ? 'Nomor belum pernah tercatat di transaksi' : (d?.error || res.error?.message || 'Gagal membuat kode'));
      if (d.already_linked) { setTgLinked(true); toast.success('Telegram sudah terhubung'); return; }
      setTgCode(d.code);
      window.open(`https://t.me/${d.bot || 'Real48time_bot'}?start=${d.code}`, '_blank');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menghubungkan Telegram');
    } finally {
      setTgBusy(false);
    }
  };

  useEffect(() => {
    supabase.from('site_settings').select('key,value').in('key', ['owner_wa_number', 'admin_wa_phone'])
      .then(({ data }) => {
        const m = new Map(((data || []) as any[]).map((r) => [r.key, String(r.value || '')]));
        const v = normalizeWa(m.get('owner_wa_number') || m.get('admin_wa_phone') || '');
        if (v) setAdminPhone(v);
      });
  }, []);


  const handleChangePassword = async () => {
    if (newPwd.length < 8) { toast.error('Kata sandi minimal 8 karakter'); return; }
    if (newPwd !== newPwd2) { toast.error('Konfirmasi kata sandi tidak cocok'); return; }
    setPwdBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setNewPwd(''); setNewPwd2('');
      toast.success('Kata sandi berhasil diganti');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengganti kata sandi');
    } finally {
      setPwdBusy(false);
    }
  };

  const handleContactAdmin = () => {
    const phone = adminWaNumber(adminPhone);
    const msg = encodeURIComponent(`Halo Admin, saya butuh bantuan terkait akun saya.\nEmail: ${user?.email || '-'}\nNomor HP terdaftar: ${phone || '-'}`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { setLoaded(true); return; }
    (async () => {

      const [{ data: prof }, { data: bal }] = await Promise.all([
        supabase.from('profiles').select('username,phone').eq('user_id', user.id).maybeSingle(),
        supabase.from('coin_balances').select('balance').eq('user_id', user.id).maybeSingle(),
      ]);
      const u = (prof as any)?.username || '';
      setUsername(u);
      setOriginalUsername(u);
      setPhone((prof as any)?.phone || '');
      setBalance(Number((bal as any)?.balance || 0));
      setLoaded(true);
    })();
  }, [user, loading, navigate]);

  // Load memberships + realtime
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setMemLoading(true);
      const { data, error } = await supabase.rpc('get_my_memberships' as any);
      if (!error && Array.isArray(data)) {
        setMemberships(data as any);
        // Buka otomatis membership aktif pertama agar sandi & link langsung terlihat.
        const act = (data as any[]).find((r) => r?.status === 'paid' && !r?.revoked && r?.token && (!r?.expires_at || new Date(r.expires_at).getTime() > Date.now()));
        if (act) setOpenMem((cur) => cur ?? act.order_id);
      }
      setMemLoading(false);
    };
    void load();
    const ch = supabase
      .channel(`mb-orders-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_orders', filter: `user_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_packages' }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Riwayat pembelian show/replay yang sudah lunas (untuk link + sandi replay)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('id,item_title,show_id,replay_id,access_token,paid_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .not('access_token', 'is', null)
        .order('paid_at', { ascending: false })
        .limit(20);
      const rows = (data || []) as MyOrder[];
      const ids = [...new Set(rows.map((r) => r.show_id).filter(Boolean))] as string[];
      const sched: Record<string, { endMs: number; converted: boolean }> = {};
      if (ids.length) {
        const { data: shows } = await supabase.from('active_shows').select('id,show_date,show_time,replay_id').in('id', ids);
        for (const sh of (shows || []) as any[]) {
          const start = new Date(`${sh.show_date}T${String(sh.show_time || '00:00').slice(0, 5)}:00+07:00`).getTime();
          sched[sh.id] = { endMs: start + 24 * 3600_000, converted: !!sh.replay_id };
        }
      }
      if (!cancelled) { setShowSched(sched); setMyOrders(rows); }
    })();
    return () => { cancelled = true; };
  }, [user]);



  // Hanya akses LIVE (show aktif) & membership yang terkunci perangkat.
  // Replay bebas dibuka di perangkat mana pun, jadi tidak perlu direset.
  const resetTargets: ResetTarget[] = [
    ...memberships
      .filter((m) => m.status === 'paid' && !m.revoked && m.token && m.password
        && !(m.expires_at && new Date(m.expires_at).getTime() < Date.now()))
      .map((m) => ({
        id: `m-${m.order_id}`,
        label: `Membership · ${m.package_name || 'Membership'}`,
        kind: 'membership' as const,
        token: m.token!,
        password: m.password!,
      })),
    ...myOrders
      .filter((o) => !!o.access_token && !!o.show_id && !o.replay_id
        && !!showSched[o.show_id] && !showSched[o.show_id].converted
        && showSched[o.show_id].endMs > Date.now())
      .map((o) => ({
        id: `o-${o.id}`,
        label: o.item_title || 'Akses Live',
        kind: 'show' as const,
        token: o.access_token!,
      })),
  ];

  const copyText = async (text: string, label = 'Disalin') => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error('Gagal menyalin'); }
  };

  const openMembership = (m: MyMembership) => {
    if (!m.token || !m.password) return;
    saveMembershipCredentials(m.token, m.password);
    navigate(`/live?mtoken=${encodeURIComponent(m.token)}&mp=${encodeURIComponent(m.password)}`);
  };


  const validUsername = (v: string) => /^[a-zA-Z0-9_.]{3,20}$/.test(v);
  const normalizePhone = (raw: string) => {
    const d = (raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('62')) return d;
    if (d.startsWith('0')) return '62' + d.slice(1);
    if (d.startsWith('8')) return '62' + d;
    return d;
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmed = username.trim();
    if (trimmed && !validUsername(trimmed)) {
      toast.error('Username 3-20 karakter, hanya huruf, angka, titik, atau garis bawah.');
      return;
    }
    const normPhone = normalizePhone(phone);
    if (phone && !/^62\d{8,13}$/.test(normPhone)) {
      toast.error('Nomor HP tidak valid. Contoh: 0812xxxxxxxx');
      return;
    }
    setBusy(true);
    try {
      if (trimmed && trimmed.toLowerCase() !== originalUsername.toLowerCase()) {
        const { data: exists } = await supabase
          .from('profiles')
          .select('user_id')
          .ilike('username', trimmed)
          .neq('user_id', user.id)
          .maybeSingle();
        if (exists) {
          toast.error('Username sudah dipakai. Pilih yang lain.');
          setBusy(false);
          return;
        }
      }
      const { error } = await supabase.from('profiles').update({
        username: trimmed || null,
        phone: normPhone || null,
      }).eq('user_id', user.id);
      if (error) throw error;
      setOriginalUsername(trimmed);
      if (normPhone) setPhone(normPhone);
      toast.success('Profil tersimpan');
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  if (!loaded) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Memuat...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
          <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
            <h1 className="text-base sm:text-lg font-bold text-primary">
              {guest ? 'Profil Guest' : 'Profil Saya'}
            </h1>
          </div>
        </header>
        {guest
          ? <GuestProfile guest={guest} />
          : <GuestChoice onGuest={() => setGuest(getGuestAccount())} />}
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-base sm:text-lg font-bold text-primary">Profil Saya</h1>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 max-w-lg space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><User className="w-4 h-4" /> Identitas Akun</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><AtSign className="w-3.5 h-3.5" /> Username</Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username_saya"
                maxLength={20}
              />
              <p className="text-[11px] text-muted-foreground">3-20 karakter. Huruf, angka, titik, atau garis bawah.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><Mail className="w-3.5 h-3.5" /> Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" /> Nomor HP</Label>
              <Input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
              />
              <p className="text-[11px] text-muted-foreground">Digunakan untuk pengiriman token via WhatsApp.</p>
            </div>

            <Button onClick={handleSave} disabled={busy} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </CardContent>
        </Card>

        <DeviceResetPicker targets={resetTargets} />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="w-4 h-4 text-primary" /> Saldo Koin</CardTitle>
            <Badge variant="secondary" className="font-mono">{balance} koin</Badge>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/koin')}>Kelola Koin</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Crown className="w-4 h-4 text-primary" /> Membership Saya</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/membership')} className="h-7 text-xs">Beli</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {memLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : memberships.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Belum ada pesanan membership. <button onClick={() => navigate('/membership')} className="text-primary underline">Lihat paket</button>
              </p>
            ) : (
              memberships.map((m) => {
                const isPaid = m.status === 'paid';
                const isReserved = m.status === 'reserved';
                const expired = m.status === 'expired';
                const cancelled = m.status === 'cancelled';
                const tokenExpired = !!(isPaid && m.expires_at && new Date(m.expires_at).getTime() < Date.now());
                const link = m.token && m.password
                  ? `${window.location.origin}/live?mtoken=${encodeURIComponent(m.token)}&mp=${encodeURIComponent(m.password)}`
                  : '';
                const statusBadge = (() => {
                  if (m.revoked) return <Badge variant="destructive">Dicabut</Badge>;
                  if (tokenExpired) return <Badge variant="secondary">Kedaluwarsa</Badge>;
                  if (isPaid) return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">Aktif</Badge>;
                  if (isReserved) return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">Menunggu Bayar</Badge>;
                  if (expired) return <Badge variant="secondary">Expired</Badge>;
                  if (cancelled) return <Badge variant="secondary">Dibatalkan</Badge>;
                  return <Badge variant="outline">{m.status}</Badge>;
                })();
                const isOpen = openMem === m.order_id;
                return (
                  <div key={m.order_id} className="rounded-lg border border-border bg-card/50 overflow-hidden">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenMem(isOpen ? null : m.order_id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                    >
                      <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-tight truncate">{m.package_name || 'Membership'}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {isPaid && m.expires_at
                            ? (tokenExpired ? 'Masa berlaku habis' : `Sisa ${m.days_remaining ?? 0} hari`)
                            : isReserved ? 'Menunggu pembayaran' : `#${m.order_id.slice(0, 8)}`}
                        </span>
                      </span>
                      {statusBadge}
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2">
                        {m.package_paused && isPaid && !tokenExpired && (
                          <div className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                            ⏸ Membership dijeda admin. {m.pause_message}
                          </div>
                        )}

                        <div className="text-[11px] text-muted-foreground">
                          {m.kind === 'coins' ? `${m.coin_amount} koin` : `Rp ${Number(m.amount || 0).toLocaleString('id-ID')}`}
                          {isPaid && m.expires_at && (
                            <> · <Clock className="w-3 h-3 inline -mt-0.5" /> berlaku hingga {new Date(m.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                          )}
                          {isReserved && m.reserved_until && (
                            <> · slot hingga {new Date(m.reserved_until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                        </div>

                        {isPaid && link && !tokenExpired && !m.revoked && (
                          <div className="space-y-1.5">
                            <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5 text-[11px]">
                              <div>
                                <span className="text-muted-foreground">Durasi: </span>
                                <span className="font-semibold text-foreground">
                                  {m.duration_days ? `${m.duration_days} hari` : '-'}
                                  {m.starts_at && ` · ${new Date(m.starts_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                  {m.expires_at && ` s/d ${new Date(m.expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                  {` · sisa ${m.days_remaining ?? 0} hari`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground shrink-0">Sandi:</span>
                                <code className="flex-1 min-w-0 truncate select-all font-mono font-bold text-primary">{m.password}</code>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(m.password!, 'Sandi disalin')}><Copy className="w-3 h-3" /></Button>
                              </div>
                              <div className="flex items-start gap-1.5">
                                <span className="text-muted-foreground shrink-0">Link:</span>
                                <code className="flex-1 min-w-0 break-all select-all font-mono text-foreground">{link}</code>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(link, 'Link disalin')}><Copy className="w-3 h-3" /></Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => copyText(link, 'Link disalin')}>
                                <Copy className="w-3 h-3 mr-1" /> Link
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => copyText(m.password!, 'Sandi disalin')}>
                                <Copy className="w-3 h-3 mr-1" /> Sandi
                              </Button>
                              <Button size="sm" className="h-8 text-[11px]" onClick={() => openMembership(m)}>
                                <ExternalLink className="w-3 h-3 mr-1" /> Buka
                              </Button>
                            </div>
                            <AccessInfoCard mtoken={m.token!} mpassword={m.password!} fallbackLink={link} compact />
                          </div>
                        )}

                        {isReserved && (
                          <p className="text-[10px] text-muted-foreground">
                            Selesaikan pembayaran QRIS sebelum slot dilepas. Kuota akan otomatis dikembalikan jika belum dibayar.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {user && <GameWinsHistory userId={user.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="w-4 h-4 text-primary" /> Link & Sandi Replay Saya</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PurchaseHistoryList
              emptyText="Belum ada pembelian show atau replay."
              items={myOrders.filter((o) => {
                // Link show satuan hilang 24 jam setelah jadwal (kecuali sudah jadi replay).
                if (!o.show_id || o.replay_id) return true;
                const sc = showSched[o.show_id];
                if (!sc) return false;
                return sc.converted || sc.endMs > Date.now();
              }).map((o) => ({
                key: o.id,
                title: o.item_title || 'Pembelian',
                dateLabel: o.paid_at
                  ? new Date(o.paid_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '',
                badge: o.replay_id ? 'Replay' : o.show_id ? 'Show' : 'Bundel',
                token: o.access_token!,
                showId: o.show_id || undefined,
                replayId: o.replay_id || undefined,
              }))}
            />
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="w-4 h-4" /> Ganti Kata Sandi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Kata sandi baru</Label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Tampilkan kata sandi"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ulangi kata sandi baru</Label>
              <Input
                type={showPwd ? 'text' : 'password'}
                value={newPwd2}
                onChange={e => setNewPwd2(e.target.value)}
                placeholder="Ulangi kata sandi"
                autoComplete="new-password"
              />
            </div>
            <Button onClick={handleChangePassword} disabled={pwdBusy || !newPwd || !newPwd2} className="w-full">
              <KeyRound className="w-4 h-4 mr-2" />
              {pwdBusy ? 'Memproses...' : 'Ganti Kata Sandi'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Perubahan langsung berlaku tanpa konfirmasi admin.
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ExternalLink className="w-4 h-4 text-sky-600" /> Hubungkan Telegram</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Dapatkan link token pembelian otomatis di Telegram juga — jadi kalau WhatsApp sedang gangguan, token tetap sampai.
            </p>
            {tgLinked ? (
              <Badge variant="outline" className="border-sky-500/40 text-sky-700">✅ Telegram sudah terhubung</Badge>
            ) : (
              <>
                <Button onClick={handleTelegramLink} disabled={tgBusy} variant="outline" className="w-full border-sky-500/40 hover:bg-sky-500/10">
                  {tgBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Hubungkan ke @Real48time_bot
                </Button>
                {tgCode && (
                  <div className="rounded-lg border border-sky-500/30 bg-background p-3 text-center space-y-1">
                    <p className="text-xs text-muted-foreground">Kode Anda (kirim ke bot jika diminta):</p>
                    <p className="font-mono font-bold tracking-widest">{tgCode}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="w-4 h-4 text-amber-600" /> Butuh Bantuan?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Mengalami masalah login, lupa email, atau ingin ubah nomor HP? Hubungi admin via WhatsApp.
            </p>
            <Button onClick={handleContactAdmin} variant="outline" className="w-full border-amber-500/40 hover:bg-amber-500/10">
              <MessageCircle className="w-4 h-4 mr-2" /> Hubungi Admin via WhatsApp
            </Button>
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" /> Keluar
        </Button>
      </main>
    </div>
  );
}
