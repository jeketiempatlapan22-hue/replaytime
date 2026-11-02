import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Copy, Edit2, Trash2, RotateCcw, Search, RefreshCw, Link2, Plus, Send, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Row = {
  order_id: string; user_id: string | null; email: string; phone: string; kind: string;
  amount: number; coin_amount: number; paid_at: string | null; created_at: string;
  package_id: string | null; package_name: string;
  token_id: string | null; token: string; password: string;
  starts_at: string | null; expires_at: string | null; duration_days: number | null;
  max_devices: number; includes_replays: boolean; revoked: boolean;
  devices_used: number; days_remaining: number | null; status: string;
};

type Pkg = {
  id: string; name: string; duration_days: number;
  max_devices: number; includes_replays: boolean; replay_info: string;
};

const SITE = 'https://realtime48show.my.id';

function normPhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export default function MembershipUsersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all'|'active'|'expired'|'revoked'>('all');
  const [edit, setEdit] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; phone: string; expires_at: string; max_devices: number; includes_replays: boolean; revoked: boolean; extend: number }>({ email: '', phone: '', expires_at: '', max_devices: 1, includes_replays: true, revoked: false, extend: 0 });
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Create dialog state
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{ email: string; phone: string; package_id: string; days: number; max_devices: number; includes_replays: boolean; replay_info: string }>({
    email: '', phone: '', package_id: '', days: 30, max_devices: 1, includes_replays: true, replay_info: ''
  });
  const [createdInfo, setCreatedInfo] = useState<{ order_id: string; token_id: string; token: string; password: string; link: string; phone: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_membership_users', { _q: q, _status: status });
    setLoading(false);
    if (error) { toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' }); return; }
    setRows((data || []) as any);
  };

  const loadPkgs = async () => {
    setPkgLoading(true);
    setPkgError(null);
    // Kolom replay_info hanya boleh dibaca lewat jalur admin server-side.
    const { data, error } = await (supabase as any).rpc('admin_get_membership_packages');
    setPkgLoading(false);
    if (error) {
      setPkgError(error.message);
      toast({ title: 'Gagal memuat paket', description: error.message, variant: 'destructive' });
      setPkgs([]);
      return;
    }
    const list = ([...((data || []) as Pkg[])] as Pkg[]).sort(
      (a: any, b: any) => (a.sort_order - b.sort_order) || String(a.created_at || '').localeCompare(String(b.created_at || '')),
    );
    setPkgs(list);
    setCreateForm(f => {
      if (f.package_id && list.some(p => p.id === f.package_id)) return f;
      const first = list[0];
      if (!first) return f;
      return {
        ...f,
        package_id: first.id,
        days: first.duration_days || f.days,
        max_devices: first.max_devices || f.max_devices,
        includes_replays: first.includes_replays ?? f.includes_replays,
        replay_info: first.replay_info || f.replay_info,
      };
    });
  };


  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => { void loadPkgs(); }, []);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${label} disalin` }); }
    catch { toast({ title: 'Gagal menyalin', variant: 'destructive' }); }
  };

  const copyBulk = (field: 'email' | 'phone') => {
    const list = [...new Set(filtered.map(r => field === 'email' ? r.email : r.phone).filter(Boolean))];
    if (!list.length) return toast({ title: 'Tidak ada data', variant: 'destructive' });
    void copy(list.join('\n'), `${list.length} ${field === 'email' ? 'email' : 'nomor'}`);
  };

  const linkFor = (r: Row) => r.token ? `${SITE}/live?mtoken=${encodeURIComponent(r.token)}` : '';

  const openEdit = (r: Row) => {
    setEdit(r);
    setEditForm({
      email: r.email || '', phone: r.phone || '',
      expires_at: r.expires_at ? new Date(r.expires_at).toISOString().slice(0,16) : '',
      max_devices: r.max_devices || 1,
      includes_replays: r.includes_replays, revoked: r.revoked, extend: 0,
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    let expiresIso: string | null = editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null;
    if (editForm.extend && editForm.extend > 0) {
      const base = expiresIso && new Date(expiresIso).getTime() > Date.now() ? new Date(expiresIso).getTime() : Date.now();
      expiresIso = new Date(base + editForm.extend * 86400_000).toISOString();
    }
    const { error } = await supabase.rpc('admin_update_membership_user', {
      _order_id: edit.order_id,
      _email: editForm.email || null,
      _phone: editForm.phone || null,
      _expires_at: expiresIso,
      _max_devices: editForm.max_devices,
      _includes_replays: editForm.includes_replays,
      _revoked: editForm.revoked,
    });
    if (error) { toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Tersimpan' });
    setEdit(null);
    load();
  };

  const resetDevices = async (r: Row) => {
    if (!r.token_id) return;
    const { error } = await supabase.rpc('admin_reset_token_devices', { _kind: 'membership', _token_id: r.token_id });
    if (error) return toast({ title: 'Gagal reset', description: error.message, variant: 'destructive' });
    toast({ title: 'Device direset' });
    load();
  };

  const remove = async (r: Row) => {
    const { error } = await supabase.rpc('admin_delete_membership_user', { _order_id: r.order_id });
    if (error) return toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    toast({ title: 'User membership dihapus' });
    load();
  };

  const sendWa = async (tokenId: string | null, phoneOverride?: string) => {
    if (!tokenId) return toast({ title: 'Tidak ada token', variant: 'destructive' });
    setSendingId(tokenId);
    try {
      const { data, error } = await supabase.functions.invoke('send-membership-token-wa', {
        body: { token_id: tokenId, phone: phoneOverride || undefined },
      });
      if (error) throw error;
      const r: any = data;
      if (r?.ok) toast({ title: 'Pesan WhatsApp terkirim' });
      else toast({ title: 'Gagal kirim WA', description: JSON.stringify(r?.data || r), variant: 'destructive' });
    } catch (e: any) {
      toast({ title: 'Gagal kirim WA', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  const openCreate = () => {
    setCreatedInfo(null);
    setCreateForm({
      email: '', phone: '', package_id: pkgs[0]?.id || '',
      days: pkgs[0]?.duration_days || 30,
      max_devices: pkgs[0]?.max_devices || 1,
      includes_replays: pkgs[0]?.includes_replays ?? true,
      replay_info: pkgs[0]?.replay_info || '',
    });
    setCreateOpen(true);
    // Refresh paket setiap kali dialog dibuka supaya tidak stuck "Memuat paket..."
    void loadPkgs();
  };


  const onPkgChange = (id: string) => {
    const p = pkgs.find(x => x.id === id);
    setCreateForm(f => ({
      ...f, package_id: id,
      days: p?.duration_days || f.days,
      max_devices: p?.max_devices || f.max_devices,
      includes_replays: p?.includes_replays ?? f.includes_replays,
      replay_info: p?.replay_info || f.replay_info,
    }));
  };

  const submitCreate = async () => {
    const email = createForm.email.trim().toLowerCase();
    const phone = normPhone(createForm.phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast({ title: 'Email tidak valid', variant: 'destructive' });
    if (!/^62\d{8,13}$/.test(phone)) return toast({ title: 'Nomor WhatsApp tidak valid', variant: 'destructive' });
    if (!createForm.package_id) return toast({ title: 'Pilih paket dulu', variant: 'destructive' });
    if (!createForm.days || createForm.days < 1) return toast({ title: 'Durasi tidak valid', variant: 'destructive' });
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_membership_user', {
        _email: email, _phone: phone, _package_id: createForm.package_id,
        _days: createForm.days, _max_devices: createForm.max_devices,
        _includes_replays: createForm.includes_replays, _replay_info: createForm.replay_info,
      });
      if (error) throw error;
      const r: any = data;
      if (!r?.ok) throw new Error(r?.error || 'gagal');
      const link = `${SITE}/live?mtoken=${encodeURIComponent(r.token)}&mp=${encodeURIComponent(r.password)}`;
      setCreatedInfo({ order_id: r.order_id, token_id: r.token_id, token: r.token, password: r.password, link, phone });
      toast({ title: 'User membership dibuat' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal membuat', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter(r =>
      r.email?.toLowerCase().includes(s) ||
      r.phone?.toLowerCase().includes(s) ||
      r.token?.toLowerCase().includes(s) ||
      r.package_name?.toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base sm:text-lg flex items-center justify-between gap-2 flex-wrap">
          <span>User Membership ({filtered.length})</span>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Buat User</Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading?'animate-spin':''}`} />Muat</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cari email / phone / token / paket" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key==='Enter' && load()} className="pl-8" />
          </div>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="expired">Kadaluarsa</SelectItem>
              <SelectItem value="revoked">Dicabut</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copyBulk('email')}>
            <Copy className="w-3.5 h-3.5 mr-1" />Salin Email ({filtered.length})
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copyBulk('phone')}>
            <Copy className="w-3.5 h-3.5 mr-1" />Salin Nomor
          </Button>
        </div>

        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.order_id} className="border border-border rounded-lg p-3 bg-card/50">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.email || '(no email)'}</span>
                    {r.email && (
                      <button title="Salin email" onClick={() => copy(r.email, 'Email')} className="text-muted-foreground hover:text-primary">
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    <Badge variant={r.status==='active'?'default':r.status==='expired'?'secondary':'destructive'}>{r.status}</Badge>
                    <Badge variant="outline">{r.kind}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      📱 {r.phone || '-'}
                      {r.phone && (
                        <button title="Salin nomor" onClick={() => copy(r.phone, 'Nomor')} className="text-muted-foreground hover:text-primary">
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      · 📦 {r.package_name || '-'}
                    </div>
                    <div>🕒 Dibeli: {r.paid_at ? new Date(r.paid_at).toLocaleString('id-ID') : '-'}</div>
                    <div>⏳ Berakhir: {r.expires_at ? new Date(r.expires_at).toLocaleString('id-ID') : '-'} {r.days_remaining!=null && r.days_remaining >= 0 && ` (${r.days_remaining}h lagi)`}</div>
                    <div>📲 Device: {r.devices_used}/{r.max_devices}</div>
                    {r.token && (<div className="font-mono text-foreground/80 break-all">🔑 {r.token}</div>)}
                    {r.password && (<div className="font-mono text-foreground/80">🔒 {r.password}</div>)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 mt-2">
                {r.token && <Button size="sm" variant="outline" onClick={() => copy(r.token, 'Token')}><Copy className="w-3.5 h-3.5 mr-1" />Token</Button>}
                {r.password && <Button size="sm" variant="outline" onClick={() => copy(r.password, 'Sandi')}><Copy className="w-3.5 h-3.5 mr-1" />Sandi</Button>}
                {r.token && <Button size="sm" variant="outline" onClick={() => copy(linkFor(r), 'Link')}><Link2 className="w-3.5 h-3.5 mr-1" />Link</Button>}
                {r.token_id && r.phone && (
                  <Button size="sm" variant="outline" onClick={() => sendWa(r.token_id, r.phone)} disabled={sendingId===r.token_id}>
                    {sendingId===r.token_id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}Kirim WA
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
                {r.token_id && <Button size="sm" variant="outline" onClick={() => resetDevices(r)}><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset</Button>}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive"><Trash2 className="w-3.5 h-3.5 mr-1" />Hapus</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Hapus user membership ini?</AlertDialogTitle>
                      <AlertDialogDescription>Order dan token akan dihapus permanen.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(r)}>Hapus</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
          {!filtered.length && !loading && <div className="text-center text-sm text-muted-foreground py-8">Tidak ada data.</div>}
        </div>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User Membership</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Phone (628xxx)</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Berakhir</Label><Input type="datetime-local" value={editForm.expires_at} onChange={e => setEditForm(f => ({ ...f, expires_at: e.target.value }))} /></div>
            <div>
              <Label>Perpanjang (+hari)</Label>
              <div className="flex flex-wrap gap-1.5 my-1.5">
                <Button type="button" size="sm" variant={editForm.extend === 31 ? 'default' : 'outline'} onClick={() => setEditForm(f => ({ ...f, extend: 31 }))}>+31 hari (1 bulan)</Button>
                <Button type="button" size="sm" variant={editForm.extend === 62 ? 'default' : 'outline'} onClick={() => setEditForm(f => ({ ...f, extend: 62 }))}>+62 hari (2 bulan)</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditForm(f => ({ ...f, extend: 0 }))}>Reset</Button>
              </div>
              <Input type="number" min={0} value={editForm.extend} onChange={e => setEditForm(f => ({ ...f, extend: parseInt(e.target.value)||0 }))} />
              <p className="text-[10px] text-muted-foreground mt-1">Durasi bebas per user — boleh berbeda dari durasi paket. Menambah N hari dari tanggal berakhir saat ini (atau dari sekarang bila sudah lewat).</p>
            </div>
            <div><Label>Max Device</Label><Input type="number" min={1} value={editForm.max_devices} onChange={e => setEditForm(f => ({ ...f, max_devices: parseInt(e.target.value)||1 }))} /></div>
            <div className="flex items-center justify-between"><Label>Termasuk replay</Label><Switch checked={editForm.includes_replays} onCheckedChange={(v) => setEditForm(f => ({ ...f, includes_replays: v }))} /></div>
            <div className="flex items-center justify-between"><Label>Dicabut (revoked)</Label><Switch checked={editForm.revoked} onCheckedChange={(v) => setEditForm(f => ({ ...f, revoked: v }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!creating) { setCreateOpen(o); if (!o) setCreatedInfo(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buat User Membership Baru</DialogTitle>
            <DialogDescription className="text-xs">Token link & order akan dibuat otomatis. Klik “Kirim WA” untuk mengirim ke user.</DialogDescription>
          </DialogHeader>

          {!createdInfo ? (
            <div className="space-y-3">
              <div><Label>Email user</Label><Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="nama@email.com" /></div>
              <div><Label>Nomor WhatsApp</Label><Input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="0812xxxx" /></div>
              <div>
                <Label>Paket</Label>
                <select
                  value={createForm.package_id}
                  onChange={(e) => onPkgChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="" disabled>{pkgLoading ? 'Memuat paket...' : 'Pilih paket'}</option>
                  {pkgs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.duration_days}h)</option>
                  ))}
                </select>
                {pkgError && (
                  <p className="text-[10px] text-destructive mt-1">Gagal memuat paket: {pkgError}</p>
                )}
                {!pkgError && !pkgLoading && pkgs.length === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Belum ada paket. Buat dulu di menu “Paket Membership”.</p>
                )}
              </div>
              <div>
                <Label>Tipe Durasi</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Button type="button" size="sm" variant={createForm.days === 31 ? 'default' : 'outline'} onClick={() => setCreateForm(f => ({ ...f, days: 31 }))}>Otomatis 1 Bulan (31 hari)</Button>
                  <Button type="button" size="sm" variant={createForm.days === 62 ? 'default' : 'outline'} onClick={() => setCreateForm(f => ({ ...f, days: 62 }))}>Otomatis 2 Bulan (62 hari)</Button>
                  <Button
                    type="button" size="sm"
                    variant={createForm.days !== 31 && createForm.days !== 62 ? 'default' : 'outline'}
                    onClick={() => setCreateForm(f => ({ ...f, days: pkgs.find(p => p.id === f.package_id)?.duration_days || f.days }))}
                  >
                    Durasi Admin (paket/manual)
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Durasi (hari)</Label><Input type="number" min={1} value={createForm.days} onChange={e => setCreateForm(f => ({ ...f, days: parseInt(e.target.value)||1 }))} /></div>
                <div><Label>Max Device</Label><Input type="number" min={1} value={createForm.max_devices} onChange={e => setCreateForm(f => ({ ...f, max_devices: parseInt(e.target.value)||1 }))} /></div>
              </div>
              <div className="flex items-center justify-between"><Label>Termasuk replay</Label><Switch checked={createForm.includes_replays} onCheckedChange={(v) => setCreateForm(f => ({ ...f, includes_replays: v }))} /></div>
              <div><Label>Info Replay (opsional)</Label><Textarea rows={3} value={createForm.replay_info} onChange={e => setCreateForm(f => ({ ...f, replay_info: e.target.value }))} placeholder="Sandi replay & info lain (sama seperti yang dikirim WA)" /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Batal</Button>
                <Button onClick={submitCreate} disabled={creating}>{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buat & Lanjut'}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-xs text-green-700 dark:text-green-300">
                ✅ Membership berhasil dibuat. Klik “Kirim WA” untuk mengirim link & info ke {createdInfo.phone}.
              </div>
              <div className="space-y-1.5 text-xs">
                <div><span className="text-muted-foreground">Token:</span> <span className="font-mono">{createdInfo.token}</span> <Button size="sm" variant="ghost" onClick={() => copy(createdInfo.token, 'Token')}><Copy className="w-3 h-3" /></Button></div>
                <div><span className="text-muted-foreground">Sandi Replay:</span> <span className="font-mono">{createdInfo.password}</span> <Button size="sm" variant="ghost" onClick={() => copy(createdInfo.password, 'Sandi')}><Copy className="w-3 h-3" /></Button></div>
                <div className="break-all"><span className="text-muted-foreground">Link:</span> <span className="font-mono">{createdInfo.link}</span> <Button size="sm" variant="ghost" onClick={() => copy(createdInfo.link, 'Link')}><Copy className="w-3 h-3" /></Button></div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setCreateOpen(false); setCreatedInfo(null); }}>Tutup</Button>
                <Button onClick={() => sendWa(createdInfo.token_id, createdInfo.phone)} disabled={sendingId===createdInfo.token_id}>
                  {sendingId===createdInfo.token_id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}Kirim WA
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
