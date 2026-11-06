import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import UserBlockAdmin from './UserBlockAdmin';
import BulkDeviceResetAdmin from './BulkDeviceResetAdmin';
import ModeratorAdmin from './ModeratorAdmin';
import { Search, Coins, Plus, Minus, KeyRound, RefreshCw, User as UserIcon, Mail, Phone, Save, Copy } from 'lucide-react';

interface UserRow {
  user_id: string;
  email: string;
  phone: string | null;
  username: string | null;
  balance: number;
  created_at?: string;
  last_sign_in_at?: string | null;
  has_profile?: boolean;
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [grant, setGrant] = useState<Record<string, { amount: string; reason: string }>>({});
  const [edits, setEdits] = useState<Record<string, { username: string; phone: string }>>({});
  const [savingId, setSavingId] = useState<string>('');
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-users', {
        body: { search: search.trim() },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Gagal memuat user');
        return;
      }
      const list = ((data as any)?.users || []) as UserRow[];
      setUsers(list);
      setTotal((data as any)?.total || list.length);
      // Seed edit drafts
      const draft: Record<string, { username: string; phone: string }> = {};
      list.forEach(u => { draft[u.user_id] = { username: u.username || '', phone: u.phone || '' }; });
      setEdits(draft);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} disalin`); }
    catch { toast.error('Gagal menyalin'); }
  };

  const copyBulk = (field: 'email' | 'phone') => {
    const list = [...new Set(users.map(u => field === 'email' ? u.email : u.phone).filter(Boolean))] as string[];
    if (!list.length) return toast.error('Tidak ada data');
    void copyText(list.join('\n'), `${list.length} ${field === 'email' ? 'email' : 'nomor'}`);
  };

  const grantCoins = async (u: UserRow, delta: number, reason?: string) => {
    if (!delta || isNaN(delta)) return toast.error('Masukkan jumlah koin');
    const { error } = await supabase.rpc('grant_coins', {
      _user_id: u.user_id,
      _delta: delta,
      _reason: delta > 0 ? 'admin_grant' : 'admin_revoke',
      _meta: reason ? { note: reason } : {},
      _order_id: null,
    } as any);
    if (error) return toast.error(error.message);
    toast.success(`Saldo ${delta > 0 ? '+' : ''}${delta} koin untuk ${u.email}`);
    setGrant(g => ({ ...g, [u.user_id]: { amount: '', reason: '' } }));
    setUsers(us => us.map(x => x.user_id === u.user_id ? { ...x, balance: x.balance + delta } : x));
  };

  const saveProfile = async (u: UserRow) => {
    const e = edits[u.user_id];
    if (!e) return;
    setSavingId(u.user_id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user-profile', {
        body: { user_id: u.user_id, username: e.username, phone: e.phone },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || 'Gagal menyimpan');
        return;
      }
      toast.success(`Profil ${u.email} tersimpan`);
      setUsers(us => us.map(x => x.user_id === u.user_id
        ? { ...x, username: e.username || null, phone: e.phone || null, has_profile: true }
        : x));
    } finally { setSavingId(''); }
  };

  const submitNewPw = async () => {
    if (!pwUser) return;
    if (!newPw || newPw.length < 6) return toast.error('Password minimal 6 karakter');
    setPwSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { user_id: pwUser.user_id, password: newPw },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.message || (data as any)?.error || error?.message || 'Gagal mengubah sandi');
        return;
      }
      toast.success(`Sandi ${pwUser.email} berhasil diubah`);
      setPwUser(null);
      setNewPw('');
    } finally { setPwSaving(false); }
  };

  return (
    <div className="space-y-4">
      <UserBlockAdmin />
      <BulkDeviceResetAdmin />
      <ModeratorAdmin />
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="w-4 h-4" />Manajemen User
            <Badge variant="secondary" className="ml-2">{total} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari username, email, nomor HP, atau user_id…"
              onKeyDown={e => e.key === 'Enter' && load()}
              aria-label="Cari user"
            />
            <Button onClick={load} disabled={loading} aria-label="Cari">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copyBulk('email')}>
              <Copy className="w-3.5 h-3.5 mr-1" />Salin Semua Email ({users.length})
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copyBulk('phone')}>
              <Copy className="w-3.5 h-3.5 mr-1" />Salin Semua Nomor
            </Button>
          </div>

          <div className="space-y-2">
            {users.map(u => {
              const g = grant[u.user_id] || { amount: '', reason: '' };
              const e = edits[u.user_id] || { username: u.username || '', phone: u.phone || '' };
              const amt = Number(g.amount || 0);
              const dirty = (e.username !== (u.username || '')) || (e.phone !== (u.phone || ''));
              return (
                <div key={u.user_id} className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[200px] space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />{u.email || <span className="italic">tanpa email</span>}
                        {u.email && (
                          <button title="Salin email" onClick={() => copyText(u.email, 'Email')} className="hover:text-primary">
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" />{u.phone}
                          <button title="Salin nomor" onClick={() => copyText(u.phone!, 'Nomor')} className="hover:text-primary">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      {!u.has_profile && (
                        <Badge variant="outline" className="text-[10px]">Belum punya profil</Badge>
                      )}
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      <Coins className="w-3 h-3 mr-1 text-primary" />{u.balance}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => { setPwUser(u); setNewPw(''); }}>
                      <KeyRound className="w-3.5 h-3.5 mr-1" />Sandi
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] flex items-center gap-1"><UserIcon className="w-3 h-3" />Username</Label>
                      <Input
                        className="h-8 text-xs"
                        value={e.username}
                        placeholder="username"
                        onChange={ev => setEdits(s => ({ ...s, [u.user_id]: { ...e, username: ev.target.value } }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] flex items-center gap-1"><Phone className="w-3 h-3" />Nomor HP</Label>
                      <Input
                        className="h-8 text-xs"
                        value={e.phone}
                        placeholder="0812xxxxxxxx"
                        onChange={ev => setEdits(s => ({ ...s, [u.user_id]: { ...e, phone: ev.target.value } }))}
                      />
                    </div>
                  </div>
                  {dirty && (
                    <Button size="sm" className="w-full" disabled={savingId === u.user_id} onClick={() => saveProfile(u)}>
                      {savingId === u.user_id
                        ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                        : <Save className="w-3.5 h-3.5 mr-1" />}
                      Simpan Profil
                    </Button>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                    <Input
                      className="w-24"
                      type="number"
                      placeholder="Jumlah"
                      value={g.amount}
                      onChange={ev => setGrant(s => ({ ...s, [u.user_id]: { ...g, amount: ev.target.value } }))}
                      aria-label="Jumlah koin"
                    />
                    <Input
                      className="flex-1 min-w-[120px]"
                      placeholder="Catatan (opsional)"
                      value={g.reason}
                      onChange={ev => setGrant(s => ({ ...s, [u.user_id]: { ...g, reason: ev.target.value } }))}
                      aria-label="Catatan transaksi koin"
                    />
                    <Button size="sm" disabled={!amt} onClick={() => grantCoins(u, Math.abs(amt), g.reason)}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Tambah
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!amt} onClick={() => grantCoins(u, -Math.abs(amt), g.reason)}>
                      <Minus className="w-3.5 h-3.5 mr-1" />Kurangi
                    </Button>
                  </div>
                </div>
              );
            })}
            {users.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-6">Tidak ada user ditemukan.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!pwUser} onOpenChange={o => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ganti Sandi User</DialogTitle></DialogHeader>
          {pwUser && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 bg-card/50 text-sm">
                <div className="font-medium">{pwUser.username || pwUser.email}</div>
                <div className="text-xs text-muted-foreground">{pwUser.email}</div>
                {pwUser.phone && <div className="text-xs text-muted-foreground">{pwUser.phone}</div>}
              </div>
              <div>
                <Label>Sandi baru (min. 6 karakter)</Label>
                <Input
                  type="text"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Sandi baru"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwUser(null)} disabled={pwSaving}>Batal</Button>
            <Button onClick={submitNewPw} disabled={pwSaving || newPw.length < 6}>
              {pwSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
