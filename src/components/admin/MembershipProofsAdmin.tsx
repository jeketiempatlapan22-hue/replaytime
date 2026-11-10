import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Trash2, CheckCircle2, ExternalLink, Save, Phone, Send, Copy, XCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { adminWaNumber } from '@/lib/adminWa';
import { toast } from '@/hooks/use-toast';

type Proof = {
  id: string; order_id: string | null; show_order_id: string | null; user_id: string | null;
  email: string; phone: string; package_name: string; amount: number;
  image_path: string; note: string; handled: boolean;
  created_at: string; expires_at: string;
};

type Opt = { id: string; label: string };

export default function MembershipProofsAdmin() {
  const [rows, setRows] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adminWa, setAdminWa] = useState('');
  const [manual, setManual] = useState<Record<string, { kind: string; target: string }>>({});
  const [targets, setTargets] = useState<{ shows: Opt[]; replays: Opt[]; packages: Opt[] }>({ shows: [], replays: [], packages: [] });
  const [results, setResults] = useState<Record<string, string>>({});
  const [savingWa, setSavingWa] = useState(false);
  const [approvalMode, setApprovalMode] = useState(false);
  const [orderInfo, setOrderInfo] = useState<Record<string, { status: string; access_token: string | null; show_id: string | null; replay_id: string | null; kind: string; item_title: string; user_phone: string }>>({});

  const loadApprovalMode = async () => {
    const { data } = await supabase.from('site_settings').select('value').eq('key', 'require_admin_approval').maybeSingle();
    setApprovalMode(String((data as any)?.value || '') === 'true');
  };
  const toggleApprovalMode = async (on: boolean) => {
    setApprovalMode(on);
    const { error } = await supabase.from('site_settings').upsert({ key: 'require_admin_approval', value: on ? 'true' : 'false' }, { onConflict: 'key' });
    if (error) { setApprovalMode(!on); return toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' }); }
    toast({ title: on ? 'Mode Persetujuan Admin aktif' : 'Mode Persetujuan Admin nonaktif' });
  };
  const loadOrders = async (list: Proof[]) => {
    const ids = list.map((r) => r.show_order_id).filter(Boolean) as string[];
    if (!ids.length) return;
    const { data } = await supabase.from('orders').select('id,status,access_token,show_id,replay_id,kind,item_title,user_phone').in('id', ids);
    const m: typeof orderInfo = {};
    for (const o of (data || []) as any[]) m[o.id] = o;
    setOrderInfo(m);
  };
  const orderAction = async (r: Proof, action: 'reject' | 'reset') => {
    if (action === 'reject' && !confirm('Tolak pesanan ini?')) return;
    setApproving((s) => ({ ...s, [r.id]: true }));
    const { data, error } = await supabase.functions.invoke('admin-approve-proof', { body: { proof_id: r.id, action } });
    setApproving((s) => ({ ...s, [r.id]: false }));
    const res = data as any;
    if (error || !res?.ok) return toast({ title: 'Gagal', description: error?.message || res?.error, variant: 'destructive' });
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, handled: action === 'reject' } : y)));
    if (r.show_order_id) setOrderInfo((m) => ({ ...m, [r.show_order_id!]: { ...m[r.show_order_id!], status: res.status } }));
    toast({ title: action === 'reject' ? 'Pesanan ditolak' : 'Status dikembalikan ke Pending' });
  };
  const copyTokenMessage = async (r: Proof) => {
    let o = r.show_order_id ? orderInfo[r.show_order_id] : undefined;
    if (r.show_order_id) {
      const { data } = await supabase.from('orders').select('id,status,access_token,show_id,replay_id,kind,item_title,user_phone').eq('id', r.show_order_id).maybeSingle();
      if (data) o = data as any;
    }
    const tok = o?.access_token || results[r.id];
    if (!o || !tok) return toast({ title: 'Token belum ada', description: 'Setujui pesanan dulu agar token terbit.', variant: 'destructive' });
    const origin = window.location.origin;
    const link = o.kind === 'bundle' ? `${origin}/shows?bt=${tok}`
      : o.show_id && !o.replay_id ? `${origin}/live?show=${o.show_id}&t=${tok}`
      : `${origin}/akses?token=${tok}${o.replay_id ? `&replay=${o.replay_id}` : ''}`;
    let pw = '';
    if (o.replay_id) {
      const { data: rp } = await (supabase as any).rpc('admin_get_replays');
      pw = ((rp || []) as any[]).find((x) => x.id === o!.replay_id)?.password || '';
    }
    const msg = `📱 *Nomor Pembeli:* ${o.user_phone || r.phone || '-'}\n\n🎤 *${o.item_title || r.package_name}*\n\n🔗 *Link Akses:*\n${link}\n\n🎬 *Link Replay:* ${origin}${pw ? `\n🔐 Sandi Replay: *${pw}*` : ''}\n\n👤 Hanya untuk 1 perangkat pertama.\n\n— *ReplayTime* 💖`;
    void copyText(msg, 'Link token + info replay');
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_membership_proofs');
    setLoading(false);
    if (error) { toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' }); return; }
    const list = (data || []) as Proof[];
    setRows(list);
    void loadOrders(list);
    // Sign URLs
    const map: Record<string, string> = {};
    await Promise.all(list.filter((r) => r.image_path).map(async (r) => {
      const { data: s } = await supabase.storage.from('membership-proofs').createSignedUrl(r.image_path, 60 * 30);
      if (s?.signedUrl) map[r.id] = s.signedUrl;
    }));
    setUrls(map);
  };

  const loadWa = async () => {
    const { data } = await supabase.from('site_settings').select('key,value').in('key', ['owner_wa_number', 'admin_wa_phone']);
    const m = new Map(((data || []) as any[]).map((r) => [r.key, String(r.value || '')]));
    setAdminWa(m.get('owner_wa_number') || m.get('admin_wa_phone') || '');
  };


  const loadTargets = async () => {
    const [sh, rp, pk] = await Promise.all([
      (supabase as any).rpc('admin_get_active_shows'),
      (supabase as any).rpc('admin_get_replays'),
      (supabase as any).rpc('admin_get_membership_packages'),
    ]);
    setTargets({
      shows: ((sh.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.title} • ${x.show_date}` })),
      replays: ((rp.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.title} • ${x.date}` })),
      packages: ((pk.data || []) as any[]).map((x) => ({ id: x.id, label: `${x.name} • ${x.duration_days} hari` })),
    });
  };

  useEffect(() => { void load(); void loadWa(); void loadTargets(); void loadApprovalMode(); }, []);

  const saveWa = async () => {
    setSavingWa(true);
    const v = adminWaNumber(adminWa);
    const { error } = await supabase.from('site_settings').upsert(
      [{ key: 'owner_wa_number', value: v }, { key: 'admin_wa_phone', value: v }],
      { onConflict: 'key' },
    );
    setSavingWa(false);
    if (error) toast({ title: 'Gagal simpan', description: error.message, variant: 'destructive' });
    else toast({ title: 'Nomor admin tersimpan', description: v || '(kosong)' });
  };


  const copyText = async (text: string, label: string) => {
    const value = String(text || '').trim();
    if (!value) { toast({ title: 'Data kosong', variant: 'destructive' }); return; }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({ title: `${label} disalin`, description: value });
    } catch { toast({ title: 'Gagal menyalin', variant: 'destructive' }); }
  };


  const copyBulk = (field: 'email' | 'phone') => {
    const list = [...new Set(rows.map(r => field === 'email' ? r.email : r.phone).filter(Boolean))];
    if (!list.length) return toast({ title: 'Tidak ada data', variant: 'destructive' });
    void copyText(list.join('\n'), `${list.length} ${field === 'email' ? 'email' : 'nomor'}`);
  };

  const setHandled = async (r: Proof, h: boolean) => {
    const { error } = await supabase.rpc('admin_set_proof_handled', { _id: r.id, _handled: h });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, handled: h } : y)));
  };

  const approveAndSend = async (r: Proof) => {
    const m = manual[r.id];
    if (!r.order_id && !r.show_order_id && !(m?.kind && m?.target)) {
      toast({ title: 'Pilih jenis & target', description: 'Bukti ini belum terhubung ke order — pilih Show/Replay/Membership dulu.', variant: 'destructive' });
      return;
    }
    setApproving((s) => ({ ...s, [r.id]: true }));
    const { data, error } = await supabase.functions.invoke('admin-approve-proof', {
      body: { proof_id: r.id, kind: m?.kind, target_id: m?.target, phone: r.phone, email: r.email },
    });
    setApproving((s) => ({ ...s, [r.id]: false }));
    if (error) return toast({ title: 'Gagal setujui', description: error.message, variant: 'destructive' });
    const res = data as { ok?: boolean; order_kind?: string; finalize?: { sent?: boolean; status?: string; error?: string } };
    const sent = res?.finalize?.sent;
    const tokenVal = (res?.finalize as any)?.access_token || (res?.finalize as any)?.token || '';
    if (tokenVal) setResults((x) => ({ ...x, [r.id]: String(tokenVal) }));
    setRows((x) => x.map((y) => (y.id === r.id ? { ...y, handled: true } : y)));
    if (r.show_order_id) setOrderInfo((m) => ({ ...m, [r.show_order_id!]: { ...m[r.show_order_id!], status: 'paid', access_token: tokenVal || m[r.show_order_id!]?.access_token || null } }));
    if (sent) {
      toast({ title: 'Disetujui & WA terkirim', description: `${res.order_kind === 'membership' ? 'Membership' : 'Show/Replay'} aktif — token dikirim ke ${r.phone}.` });
    } else if (res?.finalize?.error) {
      toast({ title: 'Order ditandai paid, WA gagal', description: String(res.finalize.error), variant: 'destructive' });
    } else {
      toast({ title: 'Disetujui', description: 'Order ditandai paid. WA sedang diproses / tertunda — cek log.' });
    }
  };


  const remove = async (r: Proof) => {
    if (!confirm('Hapus bukti ini?')) return;
    const { data: path, error } = await supabase.rpc('admin_delete_membership_proof', { _id: r.id });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    // Remove the underlying storage object via Storage API (SQL cannot touch storage.objects).
    const p = (path as unknown as string) || r.image_path;
    if (p) {
      try { await supabase.storage.from('membership-proofs').remove([p]); } catch { /* best-effort */ }
    }
    setRows((x) => x.filter((y) => y.id !== r.id));
    toast({ title: 'Bukti dihapus' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Wajib Persetujuan Admin Setelah Bayar</div>
            <p className="text-xs text-muted-foreground">Jika aktif, pembelian show/replay/bundle yang sudah lunas di QRIS berstatus Pending sampai Anda menekan Setujui di bawah. Berlaku untuk user login, guest, dan tanpa login.</p>
          </div>
          <Switch checked={approvalMode} onCheckedChange={toggleApprovalMode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Phone className="w-5 h-5" />Nomor WhatsApp Admin</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Nomor WA yang akan dihubungi user setelah upload bukti (format 628xxx)</Label>
          <div className="flex gap-2">
            <Input value={adminWa} onChange={(e) => setAdminWa(e.target.value)} placeholder="6283899087711" />
            <Button onClick={saveWa} disabled={savingWa}>{savingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}<span className="ml-1 hidden sm:inline">Simpan</span></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base sm:text-lg flex items-center justify-between gap-2">
            <span>Bukti Transaksi ({rows.length})</span>
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => copyBulk('email')} title="Salin semua email"><Copy className="w-3.5 h-3.5 mr-1" />Email</Button>
              <Button size="sm" variant="outline" onClick={() => copyBulk('phone')} title="Salin semua nomor"><Copy className="w-3.5 h-3.5 mr-1" />Nomor</Button>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Muat</Button>
            </div>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Bukti otomatis dihapus 7 hari setelah dibuat.</p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Belum ada bukti masuk.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {rows.map((r) => (
                <div key={r.id} className="border border-border rounded-lg overflow-hidden bg-card/50">
                  {urls[r.id] ? (
                    <a href={urls[r.id]} target="_blank" rel="noreferrer" className="block">
                      <img src={urls[r.id]} alt="bukti" className="w-full h-48 object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="w-full h-48 bg-secondary flex items-center justify-center text-xs text-muted-foreground">Memuat gambar…</div>
                  )}
                  <div className="p-3 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant={r.handled ? 'default' : 'secondary'}>{r.handled ? 'Selesai' : 'Baru'}</Badge>
                      <Badge variant="outline">{r.order_id ? 'Membership' : r.show_order_id ? 'Show/Replay' : 'Tanpa order'}</Badge>
                      <Badge variant="outline">{r.package_name || 'Paket -'}</Badge>
                      {r.amount > 0 && <Badge variant="outline">Rp {r.amount.toLocaleString('id-ID')}</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5">📧 <span className="truncate select-all">{r.email}</span>
                      {r.email && <button type="button" title="Salin email" onClick={() => copyText(r.email, 'Email')} className="shrink-0 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary"><Copy className="w-3 h-3" />Salin</button>}
                    </div>
                    <div className="flex items-center gap-1.5">📱 <a href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer" className="text-primary underline select-all">{r.phone}</a>
                      {r.phone && <button type="button" title="Salin nomor" onClick={() => copyText(r.phone, 'Nomor')} className="shrink-0 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary"><Copy className="w-3 h-3" />Salin</button>}
                    </div>

                    {r.order_id && <div className="font-mono text-[10px] truncate">Order Membership: {r.order_id}</div>}
                    {r.show_order_id && <div className="font-mono text-[10px] truncate">Order Show: {r.show_order_id}</div>}
                    {r.show_order_id && orderInfo[r.show_order_id] && (
                      <Badge variant={orderInfo[r.show_order_id].status === 'paid' ? 'default' : orderInfo[r.show_order_id].status === 'rejected' ? 'destructive' : 'secondary'}>
                        {orderInfo[r.show_order_id].status === 'paid' ? 'Disetujui' : orderInfo[r.show_order_id].status === 'rejected' ? 'Ditolak' : orderInfo[r.show_order_id].status === 'awaiting_approval' ? 'Lunas — Menunggu Persetujuan' : orderInfo[r.show_order_id].status}
                      </Badge>
                    )}
                    {r.note && <div className="text-muted-foreground italic">"{r.note}"</div>}
                    <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString('id-ID')}</div>
                    {results[r.id] && (
                      <div className="font-mono text-[10px] break-all bg-secondary rounded px-2 py-1">Token: {results[r.id]}</div>
                    )}
                    {!r.order_id && !r.show_order_id && (
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        <select
                          className="h-8 rounded-md border border-input bg-background px-1 text-[11px]"
                          value={manual[r.id]?.kind || ''}
                          onChange={(e) => setManual((s) => ({ ...s, [r.id]: { kind: e.target.value, target: '' } }))}
                        >
                          <option value="">Jenis…</option>
                          <option value="show">Show</option>
                          <option value="replay">Replay</option>
                          <option value="membership">Membership</option>
                        </select>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-1 text-[11px]"
                          value={manual[r.id]?.target || ''}
                          disabled={!manual[r.id]?.kind}
                          onChange={(e) => setManual((s) => ({ ...s, [r.id]: { kind: s[r.id]?.kind || '', target: e.target.value } }))}
                        >
                          <option value="">Pilih…</option>
                          {(manual[r.id]?.kind === 'show' ? targets.shows : manual[r.id]?.kind === 'replay' ? targets.replays : manual[r.id]?.kind === 'membership' ? targets.packages : []).map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-1 flex-wrap pt-1">
                      {(r.order_id || r.show_order_id || (manual[r.id]?.kind && manual[r.id]?.target)) && (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => approveAndSend(r)}
                          disabled={!!approving[r.id]}
                        >
                          {approving[r.id] ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                          Setujui & Kirim Token
                        </Button>
                      )}
                      {urls[r.id] && (
                        <a href={urls[r.id]} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]"><ExternalLink className="w-3 h-3 mr-1" />Buka</Button>
                        </a>
                      )}
                      {r.show_order_id && orderInfo[r.show_order_id]?.status !== 'paid' && orderInfo[r.show_order_id]?.status !== 'rejected' && (
                        <Button size="sm" variant="destructive" className="h-7 text-[11px]" disabled={!!approving[r.id]} onClick={() => orderAction(r, 'reject')}>
                          <XCircle className="w-3 h-3 mr-1" />Tolak
                        </Button>
                      )}
                      {r.show_order_id && orderInfo[r.show_order_id]?.status === 'rejected' && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={!!approving[r.id]} onClick={() => orderAction(r, 'reset')}>
                          <RotateCcw className="w-3 h-3 mr-1" />Reset
                        </Button>
                      )}
                      {r.show_order_id && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyTokenMessage(r)}>
                          <Copy className="w-3 h-3 mr-1" />Salin Link Token + Info Replay
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setHandled(r, !r.handled)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />{r.handled ? 'Buka lagi' : 'Tandai selesai'}
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => remove(r)}>
                        <Trash2 className="w-3 h-3 mr-1" />Hapus
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
