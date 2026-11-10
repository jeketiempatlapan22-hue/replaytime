import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, Edit2, Crown, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import MembershipOrdersDialog from './MembershipOrdersDialog';


interface Pkg {
  id: string;
  name: string;
  description: string;
  replay_info: string;
  group_link?: string;
  duration_days: number;
  price_idr: number;
  price_coins: number;
  pakasir_amount: number;
  quota_total: number;
  quota_reserved: number;
  max_devices: number;
  includes_replays: boolean;
  status: 'open' | 'closed';
  sort_order: number;
  paused: boolean;
  pause_message: string;
  fixed_starts_at: string | null;
  fixed_expires_at: string | null;
  show_to_user?: boolean;
  show_to_reseller?: boolean;
}


const emptyForm = {
  id: '' as string | undefined,
  name: '',
  description: '',
  replay_info: '',
  group_link: '',
  duration_days: 30,
  price_idr: 0,
  price_coins: 0,
  pakasir_amount: 0,
  quota_total: 10,
  max_devices: 1,
  includes_replays: true,
  status: 'open' as 'open' | 'closed',
  sort_order: 0,
  fixed_starts_at: '',
  fixed_expires_at: '',
  show_to_user: true,
  show_to_reseller: true,
};

// Convert ISO timestamp <-> <input type="date"> value (YYYY-MM-DD) in local time.
function isoToDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateInputToIso(s: string, endOfDay = false) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return date.toISOString();
}
function daysBetweenInputs(startStr: string, endStr: string) {
  if (!startStr || !endStr) return 0;
  const a = new Date(startStr + 'T00:00:00').getTime();
  const b = new Date(endStr + 'T23:59:59').getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.max(1, Math.ceil((b - a) / 86400000));
}
function fmtDateRange(p: Pkg) {
  if (!p.fixed_expires_at) return null;
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const start = p.fixed_starts_at ? new Date(p.fixed_starts_at).toLocaleDateString('id-ID', opts) : '—';
  const end = new Date(p.fixed_expires_at).toLocaleDateString('id-ID', opts);
  return `${start} → ${end}`;
}

export default function MembershipPackagesAdmin() {
  const [rows, setRows] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [ordersFor, setOrdersFor] = useState<Pkg | null>(null);


  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc('admin_get_membership_packages');
    setRows((data || []) as Pkg[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    const ch = supabase
      .channel('admin-membership-pkg')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_packages' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'membership_orders' }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nama paket wajib'); return; }
    if (form.duration_days <= 0) { toast.error('Durasi harus > 0'); return; }
    if (form.quota_total <= 0) { toast.error('Kuota harus > 0'); return; }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      description: form.description,
      replay_info: form.replay_info,
      group_link: form.group_link.trim(),
      duration_days: Number(form.duration_days),
      price_idr: Number(form.price_idr) || 0,
      price_coins: Number(form.price_coins) || 0,
      pakasir_amount: Number(form.pakasir_amount) || 0,
      quota_total: Number(form.quota_total),
      max_devices: Math.max(1, Number(form.max_devices) || 1),
      includes_replays: form.includes_replays,
      status: form.status,
      sort_order: Number(form.sort_order) || 0,
      fixed_starts_at: dateInputToIso(form.fixed_starts_at, false),
      fixed_expires_at: dateInputToIso(form.fixed_expires_at, true),
      show_to_user: form.show_to_user,
      show_to_reseller: form.show_to_reseller,
    };
    const editingId = form.id;
    const { error } = editingId
      ? await supabase.from('membership_packages').update(payload).eq('id', editingId)
      : await supabase.from('membership_packages').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? 'Paket diperbarui' : 'Paket dibuat');

    if (editingId) {
      const prev = rows.find((r) => r.id === editingId);
      const changed = !prev
        || prev.duration_days !== payload.duration_days
        || prev.max_devices !== payload.max_devices
        || prev.includes_replays !== payload.includes_replays
        || (prev.fixed_starts_at || null) !== payload.fixed_starts_at
        || (prev.fixed_expires_at || null) !== payload.fixed_expires_at;
      if (changed) {
        // Otomatis terapkan ke semua member aktif paket ini agar durasi & akses live langsung ikut berubah.
        const { data: n, error: syncErr } = await (supabase as any).rpc('admin_sync_package_duration', {
          _package_id: editingId,
          _include_expired: false,
        });
        if (syncErr) toast.error(`Gagal sinkron member: ${syncErr.message}`);
        else toast.success(`${Number(n) || 0} membership diperbarui`);
      }
    }

    setForm({ ...emptyForm });
    void load();
  };


  const edit = (p: Pkg) => {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description,
      replay_info: p.replay_info,
      group_link: p.group_link || '',
      duration_days: p.duration_days,
      price_idr: p.price_idr,
      price_coins: p.price_coins,
      pakasir_amount: p.pakasir_amount,
      quota_total: p.quota_total,
      max_devices: p.max_devices,
      includes_replays: p.includes_replays,
      status: p.status,
      sort_order: p.sort_order,
      fixed_starts_at: isoToDateInput(p.fixed_starts_at),
      fixed_expires_at: isoToDateInput(p.fixed_expires_at),
      show_to_user: p.show_to_user !== false,
      show_to_reseller: p.show_to_reseller !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleStatus = async (p: Pkg) => {
    const next = p.status === 'open' ? 'closed' : 'open';
    await supabase.from('membership_packages').update({ status: next }).eq('id', p.id);
    toast.success(`Paket ${next === 'open' ? 'dibuka' : 'ditutup'}`);
  };
  const togglePause = async (p: Pkg) => {
    const next = !p.paused;
    let message = p.pause_message || '';
    if (next) {
      const input = prompt('Pesan jeda yang ditampilkan ke user membership paket ini:', message || 'Akses sedang dijeda. Mohon menunggu.');
      if (input === null) return;
      message = input;
    }
    await supabase.from('membership_packages').update({ paused: next, pause_message: message }).eq('id', p.id);
    toast.success(next ? 'Akses paket dijeda' : 'Akses paket dilanjutkan');
  };
  const editPauseMessage = async (p: Pkg) => {
    const input = prompt('Edit pesan jeda untuk paket ini:', p.pause_message || '');
    if (input === null) return;
    await supabase.from('membership_packages').update({ pause_message: input }).eq('id', p.id);
    toast.success('Pesan jeda diperbarui');
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus paket ini? Order yang sudah terbuat tetap tersimpan.')) return;
    const { error } = await supabase.from('membership_packages').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Paket dihapus');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" /> {form.id ? 'Edit Paket Membership' : 'Buat Paket Membership'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Nama Paket</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Premium 30 Hari" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Tipe Durasi</Label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
              <Button type="button" size="sm" variant={form.duration_days === 31 ? 'default' : 'outline'} onClick={() => setForm({ ...form, duration_days: 31, fixed_starts_at: '', fixed_expires_at: '' })}>Otomatis 1 Bulan (31 hari)</Button>
              <Button type="button" size="sm" variant={form.duration_days === 62 ? 'default' : 'outline'} onClick={() => setForm({ ...form, duration_days: 62, fixed_starts_at: '', fixed_expires_at: '' })}>Otomatis 2 Bulan (62 hari)</Button>
              <Button type="button" size="sm" variant={form.duration_days !== 31 && form.duration_days !== 62 ? 'default' : 'outline'} onClick={() => setForm({ ...form, duration_days: form.duration_days === 31 || form.duration_days === 62 ? 30 : form.duration_days })}>Durasi Admin (manual)</Button>
            </div>
            <Label className="text-xs">Durasi (hari)</Label>
            <Input type="number" min={1} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: Number(e.target.value) || 0, fixed_starts_at: '', fixed_expires_at: '' })} />
          </div>
          <div>
            <Label className="text-xs">Kuota Total</Label>
            <Input type="number" min={1} value={form.quota_total} onChange={(e) => setForm({ ...form, quota_total: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Harga IDR (untuk QRIS)</Label>
            <Input type="number" min={0} value={form.price_idr} onChange={(e) => setForm({ ...form, price_idr: Number(e.target.value) || 0 })} placeholder="99000" />
          </div>
          <div>
            <Label className="text-xs">Pakasir Amount (kosongkan = pakai harga IDR)</Label>
            <Input type="number" min={0} value={form.pakasir_amount} onChange={(e) => setForm({ ...form, pakasir_amount: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Harga Koin (0 = nonaktif)</Label>
            <Input type="number" min={0} value={form.price_coins} onChange={(e) => setForm({ ...form, price_coins: Number(e.target.value) || 0 })} placeholder="990" />
          </div>
          <div>
            <Label className="text-xs">Max Device per Token</Label>
            <Input type="number" min={1} value={form.max_devices} onChange={(e) => setForm({ ...form, max_devices: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <Label className="text-xs">Sort Order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.includes_replays} onCheckedChange={(v) => setForm({ ...form, includes_replays: !!v })} /> Termasuk akses replay
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.status === 'open'} onCheckedChange={(v) => setForm({ ...form, status: v ? 'open' : 'closed' })} />
              {form.status === 'open' ? 'Dibuka' : 'Ditutup'}
            </label>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.show_to_user} onCheckedChange={(v) => setForm({ ...form, show_to_user: !!v })} /> Tampilkan ke user
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.show_to_reseller} onCheckedChange={(v) => setForm({ ...form, show_to_reseller: !!v })} /> Tampilkan ke reseller
            </label>
            <p className="w-full text-[11px] text-muted-foreground">Disembunyikan tidak mematikan token yang sudah dibuat — tetap berlaku sampai masa membership habis.</p>
          </div>
          <div className="sm:col-span-2 grid sm:grid-cols-2 gap-3 border-2 border-primary/30 bg-primary/5 rounded-lg p-3">
            <div className="sm:col-span-2 text-xs">
              <strong className="text-primary">📅 Periode Tetap Membership (opsional)</strong>
              <p className="text-muted-foreground mt-1">Atur tanggal mulai & berakhir agar SEMUA user yang membeli paket ini punya tanggal berakhir yang sama (mis. 1 Jan – 28 Feb 2026). Kosongkan untuk pakai durasi hari di atas.</p>
            </div>
            <div>
              <Label className="text-xs">Tanggal Mulai</Label>
              <Input
                type="date"
                value={form.fixed_starts_at}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...form, fixed_starts_at: v };
                  const d = daysBetweenInputs(v, form.fixed_expires_at);
                  if (d > 0) next.duration_days = d;
                  setForm(next);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Tanggal Berakhir</Label>
              <Input
                type="date"
                value={form.fixed_expires_at}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...form, fixed_expires_at: v };
                  const d = daysBetweenInputs(form.fixed_starts_at, v);
                  if (d > 0) next.duration_days = d;
                  setForm(next);
                }}
              />
            </div>
            {form.fixed_starts_at && form.fixed_expires_at && (
              <div className="sm:col-span-2 text-xs text-primary font-medium">
                ✓ Berlaku {new Date(form.fixed_starts_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} – {new Date(form.fixed_expires_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} ({daysBetweenInputs(form.fixed_starts_at, form.fixed_expires_at)} hari)
              </div>
            )}
            {(form.fixed_starts_at || form.fixed_expires_at) && (
              <button
                type="button"
                onClick={() => setForm({ ...form, fixed_starts_at: '', fixed_expires_at: '' })}
                className="sm:col-span-2 text-xs text-destructive hover:underline text-left"
              >
                ✕ Kosongkan periode tetap (gunakan durasi hari)
              </button>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Deskripsi Keuntungan (terlihat di kartu paket publik)</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={'✓ Akses semua live show selama 30 hari\n✓ Tonton dari 1 perangkat\n✓ Dapat akses replay show eksklusif'}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Info Replay (HANYA dikirim ke WhatsApp setelah pembelian)</Label>
            <Textarea
              rows={4}
              value={form.replay_info}
              onChange={(e) => setForm({ ...form, replay_info: e.target.value })}
              placeholder={'Daftar replay yang bisa diakses dengan membership:\n• Show A (12/05)\n• Show B (18/05)\n• Show C (24/05)'}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Tidak akan terlihat di kartu publik. Hanya dikirim via WhatsApp setelah user berhasil membeli.</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="membership-group" className="text-xs">Link Grup Membership</Label>
            <Input id="membership-group" type="url" value={form.group_link} onChange={(e) => setForm({ ...form, group_link: e.target.value })} placeholder="https://chat.whatsapp.com/..." />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1 sm:flex-none">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />{form.id ? 'Simpan' : 'Buat Paket'}</>}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => setForm({ ...emptyForm })}>Batal</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daftar Paket ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada paket.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((p) => {
                const remaining = Math.max(0, p.quota_total - p.quota_reserved);
                const pct = p.quota_total > 0 ? Math.round((p.quota_reserved / p.quota_total) * 100) : 0;
                return (
                  <div key={p.id} className="border border-border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-semibold flex items-center gap-2 flex-wrap">
                          {p.name}
                          {p.status === 'open' ? (
                            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">DIBUKA</Badge>
                          ) : (
                            <Badge variant="secondary">DITUTUP</Badge>
                          )}
                          {remaining <= 0 && p.status === 'open' && <Badge variant="destructive">SOLD OUT</Badge>}
                          {p.paused && <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30">JEDA</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.duration_days} hari · Rp {p.price_idr.toLocaleString('id-ID')} · {p.price_coins} koin · {p.max_devices} perangkat
                          {p.includes_replays ? ' · termasuk replay' : ''}
                        </div>
                        {fmtDateRange(p) && (
                          <div className="text-[11px] text-primary mt-1">📅 Periode tetap: {fmtDateRange(p)}</div>
                        )}
                        {p.paused && p.pause_message && (
                          <div className="text-[11px] text-orange-600 dark:text-orange-400 mt-1 whitespace-pre-line border-l-2 border-orange-500/40 pl-2">
                            “{p.pause_message}”
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => edit(p)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => setOrdersFor(p)}><ListOrdered className="w-3.5 h-3.5 mr-1" />Pesanan</Button>
                        <Button size="sm" variant={p.status === 'open' ? 'secondary' : 'default'} onClick={() => toggleStatus(p)}>
                          {p.status === 'open' ? 'Tutup' : 'Buka'}
                        </Button>
                        <Button size="sm" variant={p.paused ? 'default' : 'secondary'} onClick={() => togglePause(p)}>
                          {p.paused ? 'Lanjutkan' : 'Jeda'}
                        </Button>
                        {p.paused && (
                          <Button size="sm" variant="ghost" onClick={() => editPauseMessage(p)}>Edit Pesan</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>


                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Terpakai</span>
                        <span className="font-mono">{p.quota_reserved} / {p.quota_total} (sisa {remaining})</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {ordersFor && (
        <MembershipOrdersDialog
          open={!!ordersFor}
          onOpenChange={(v) => { if (!v) setOrdersFor(null); }}
          packageId={ordersFor.id}
          packageName={ordersFor.name}
        />
      )}
    </div>
  );
}

