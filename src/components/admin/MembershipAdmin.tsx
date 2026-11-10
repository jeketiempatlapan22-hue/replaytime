import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Copy, RefreshCw, RotateCcw, ChevronDown, ChevronUp, Send, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MembershipToken {
  id: string;
  token: string;
  password: string;
  label: string;
  phone: string;
  duration_days: number;
  starts_at: string;
  expires_at: string;
  revoked: boolean;
  manual_resets_used: number;
  manual_resets_max: number;
  includes_replays: boolean;
  max_devices: number;
  replay_info: string;
  group_link_override?: string | null;
  created_at: string;
}

interface DeviceRow { id: string; token_id: string; browser_id: string; created_at: string; last_seen: string }

const randStr = (n = 10) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

async function createFreshMembershipToken(length: number) {
  for (let i = 0; i < 8; i++) {
    const token = randStr(length);
    const { data } = await supabase.from('membership_tokens').select('id').eq('token', token).maybeSingle();
    if (!data) return token;
  }
  return `${randStr(length)}${Date.now().toString(36).toUpperCase()}`;
}

export default function MembershipAdmin() {
  const [rows, setRows] = useState<MembershipToken[]>([]);
  const [devices, setDevices] = useState<Record<string, DeviceRow[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', phone: '', duration_days: 30, includes_replays: true, max_devices: 1, replay_info: '', group_link: '' });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: tokens }, { data: devs }] = await Promise.all([
      supabase.from('membership_tokens').select('*').order('created_at', { ascending: false }),
      supabase.from('membership_token_devices').select('*'),
    ]);
    setRows((tokens as MembershipToken[]) || []);
    const map: Record<string, DeviceRow[]> = {};
    ((devs as DeviceRow[]) || []).forEach(d => {
      (map[d.token_id] ||= []).push(d);
    });
    setDevices(map);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.label || '').toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.token || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const create = async () => {
    if (!form.phone.trim()) { toast.error('Nomor WA wajib diisi'); return; }
    setCreating(true);
    // Selalu generate token & sandi BARU — tidak menyalin token yang sudah ada.
    const token = await createFreshMembershipToken(12);
    const password = await createFreshMembershipToken(8);
    const starts_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + form.duration_days * 86400000).toISOString();
    const { error } = await supabase.from('membership_tokens').insert({
      token, password, label: form.label, phone: form.phone.trim(),
      duration_days: form.duration_days, starts_at, expires_at,
      includes_replays: form.includes_replays,
      max_devices: Math.max(1, Math.min(10000, Number(form.max_devices) || 1)),
      replay_info: form.replay_info,
      group_link_override: form.group_link.trim() || null,
      created_by: 'admin',
    });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Membership baru dibuat');
    setForm({ label: '', phone: '', duration_days: 30, includes_replays: true, max_devices: 1, replay_info: '', group_link: '' });
    void load();
  };

  const sendWa = async (r: MembershipToken) => {
    if (!r.phone) { toast.error('Token ini belum memiliki nomor WA'); return; }
    setSendingId(r.id);
    const { data, error } = await supabase.functions.invoke('send-membership-token-wa', {
      body: { token_id: r.id },
    });
    setSendingId(null);
    if (error || !data?.ok) {
      toast.error('Gagal kirim WA: ' + (error?.message || JSON.stringify(data?.data || data || {})).slice(0, 180));
    } else {
      toast.success(`Link membership terkirim ke ${r.phone}`);
    }
  };

  const toggleRevoke = async (r: MembershipToken) => {
    await supabase.from('membership_tokens').update({ revoked: !r.revoked }).eq('id', r.id);
    toast.success(r.revoked ? 'Membership diaktifkan' : 'Membership dicabut');
    void load();
  };
  const remove = async (id: string) => {
    if (!confirm('Hapus membership token ini? Tindakan tidak bisa dibatalkan.')) return;
    await supabase.from('membership_tokens').delete().eq('id', id);
    toast.success('Membership dihapus');
    void load();
  };
  const resetDevices = async (id: string) => {
    await supabase.from('membership_token_devices').delete().eq('token_id', id);
    toast.success('Perangkat tertaut direset');
    void load();
  };
  const revokeOneDevice = async (deviceId: string) => {
    await supabase.from('membership_token_devices').delete().eq('id', deviceId);
    toast.success('Perangkat dicabut');
    void load();
  };
  const resetQuota = async (id: string) => {
    await supabase.from('membership_tokens').update({ manual_resets_used: 0, updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('Kuota reset perangkat dikembalikan ke 0');
    void load();
  };
  const editMaxDevices = async (r: MembershipToken) => {
    const v = prompt('Atur Max Device baru', String(r.max_devices ?? 1));
    if (v == null) return;
    const n = Math.max(1, Math.min(10000, Number(v) || 1));
    await supabase.from('membership_tokens').update({ max_devices: n, updated_at: new Date().toISOString() }).eq('id', r.id);
    toast.success(`Max device diubah ke ${n}`);
    void load();
  };
  const editGroup = async (r: MembershipToken) => {
    const value = prompt('Link grup membership (kosongkan untuk menghapus)', r.group_link_override || '');
    if (value === null) return;
    const { error } = await supabase.from('membership_tokens').update({ group_link_override: value.trim() }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Grup membership diperbarui'); void load();
  };
  const copyLink = (r: MembershipToken) => {
    const link = `${window.location.origin}/live?mtoken=${encodeURIComponent(r.token)}&mp=${encodeURIComponent(r.password)}`;
    navigator.clipboard.writeText(link);
    toast.success('Link disalin');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Tambah Membership Manual</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Nama / Label</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="cth: Budi - Premium" /></div>
          <div><Label className="text-xs">Nomor WA *</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="62xxx" /></div>
          <div>
            <Label className="text-xs">Durasi (hari)</Label>
            <Input type="number" value={form.duration_days} onChange={e => setForm({ ...form, duration_days: Number(e.target.value) || 30 })} />
            <p className="text-[11px] text-muted-foreground mt-1">
              Berakhir: <span className="font-medium text-foreground">{new Date(Date.now() + (Number(form.duration_days) || 0) * 86400000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </p>
          </div>
          <div><Label className="text-xs">Max Device</Label><Input type="number" min={1} value={form.max_devices} onChange={e => setForm({ ...form, max_devices: Number(e.target.value) || 1 })} placeholder="cth: 1" /></div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Info Replay (opsional)</Label>
            <Textarea rows={2} value={form.replay_info} onChange={e => setForm({ ...form, replay_info: e.target.value })} placeholder="cth: 5 replay terbaru bulan ini" />
          </div>
          <div className="sm:col-span-2"><Label htmlFor="manual-membership-group" className="text-xs">Link Grup Membership</Label><Input id="manual-membership-group" type="url" value={form.group_link} onChange={e => setForm({ ...form, group_link: e.target.value })} placeholder="https://chat.whatsapp.com/..." /></div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.includes_replays} onChange={e => setForm({ ...form, includes_replays: e.target.checked })} /> Termasuk replay</label>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={create} disabled={creating} className="w-full sm:w-auto">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Buat & Simpan</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Daftar Membership</CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                const list = [...new Set(filtered.map(r => r.phone).filter(Boolean))];
                if (!list.length) return toast.error('Tidak ada nomor');
                navigator.clipboard.writeText(list.join('\n')); toast.success(`${list.length} nomor disalin`);
              }} title="Salin semua nomor pada daftar ini">
                <Copy className="w-3.5 h-3.5 mr-1" />Salin Nomor
              </Button>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cari nomor / nama / token…"
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada membership.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => {
                const expired = r.expires_at && new Date(r.expires_at).getTime() < Date.now();
                const tokenDevices = devices[r.id] || [];
                const isOpen = !!expanded[r.id];
                return (
                  <div key={r.id} className="border border-border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium">
                        {r.label || '(tanpa label)'} {expired && <span className="text-xs text-destructive">[expired]</span>} {r.revoked && <span className="text-xs text-destructive">[revoked]</span>}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="default" onClick={() => sendWa(r)} disabled={sendingId === r.id || !r.phone} title="Kirim link & info ke WA">
                          {sendingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                          Kirim WA
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => editGroup(r)}>Grup</Button>
                        <Button size="sm" variant="outline" onClick={() => copyLink(r)} title="Salin link"><Copy className="w-3.5 h-3.5 mr-1" />Link</Button>
                        <Button size="sm" variant="outline" onClick={() => editMaxDevices(r)} title="Ubah max device">Max: {r.max_devices ?? 1}</Button>
                        <Button size="sm" variant="outline" onClick={() => resetDevices(r.id)} title="Cabut semua perangkat tertaut"><RefreshCw className="w-3.5 h-3.5 mr-1" />Reset Device</Button>
                        <Button size="sm" variant="outline" onClick={() => resetQuota(r.id)} title="Reset kuota reset manual ke 0"><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset Kuota</Button>
                        <Button size="sm" variant={r.revoked ? 'default' : 'secondary'} onClick={() => toggleRevoke(r)}>{r.revoked ? 'Aktifkan' : 'Cabut'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)} title="Hapus"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all">Token: {r.token} · Sandi: {r.password}</div>
                    <div className="text-xs text-muted-foreground">
                      WA: {r.phone || '-'}
                      {r.phone && (
                        <button title="Salin nomor" onClick={() => { navigator.clipboard.writeText(r.phone); toast.success('Nomor disalin'); }} className="hover:text-primary align-middle mx-1">
                          <Copy className="w-3 h-3 inline" />
                        </button>
                      )}
                      · Kuota reset: <span className="font-mono">{r.manual_resets_used}/{r.manual_resets_max}</span> · Durasi: <span className="font-medium text-foreground">{r.duration_days} hari</span> · Aktif s/d <span className="font-medium text-foreground">{new Date(r.expires_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      {(() => {
                        const ms = new Date(r.expires_at).getTime() - Date.now();
                        if (ms <= 0) return <span className="text-destructive"> · sudah expired</span>;
                        const days = Math.floor(ms / 86400000);
                        const hours = Math.floor((ms % 86400000) / 3600000);
                        return <span> · sisa <span className="font-medium text-foreground">{days}h {hours}j</span></span>;
                      })()}
                      {r.includes_replays ? ' · termasuk replay' : ' · live saja'}
                    </div>
                    {r.replay_info && (
                      <div className="text-xs text-muted-foreground italic">🎬 {r.replay_info}</div>
                    )}
                    <button
                      type="button"
                      className="text-xs text-primary inline-flex items-center gap-1"
                      onClick={() => setExpanded(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                    >
                      {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Perangkat tertaut ({tokenDevices.length}/{r.max_devices ?? 1})
                    </button>
                    {isOpen && (
                      <div className="rounded border border-border bg-muted/30 p-2 space-y-1">
                        {tokenDevices.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Belum ada perangkat terikat.</p>
                        ) : tokenDevices.map(d => (
                          <div key={d.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="font-mono truncate">
                              {d.browser_id.slice(0, 12)}…{d.browser_id.slice(-4)}
                              <span className="text-muted-foreground ml-2">last seen {new Date(d.last_seen).toLocaleString()}</span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => revokeOneDevice(d.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
