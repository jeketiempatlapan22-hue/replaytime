import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Search, Ban, Wrench, Unlock } from 'lucide-react';

type Found = { user_id: string; email: string; username: string | null; phone: string | null; created_at: string; blocked: boolean; block_reason: string | null };
type BlockedRow = { id: string; user_id: string | null; phone: string; email: string; reason: string; created_at: string };

export default function UserBlockAdmin() {
  const [mode, setMode] = useState(false);
  const [msg, setMsg] = useState('');
  const [replayHost, setReplayHost] = useState('');
  const [liveOrigin, setLiveOrigin] = useState('');
  const [mainOrigin, setMainOrigin] = useState('');
  const [replayOrigin, setReplayOrigin] = useState('');
  const [linkOrigin, setLinkOrigin] = useState('');
  const [hideYt, setHideYt] = useState(false);
  const [compact, setCompact] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [reason, setReason] = useState('');
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    const { data } = await supabase.from('site_settings').select('key,value').in('key', ['maintenance_mode', 'maintenance_message', 'replay_path', 'live_origin', 'main_origin', 'replay_origin', 'link_origin', 'hide_youtube_on_main', 'compact_replay_cards']);
    const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    setMode(m.maintenance_mode === 'true'); setMsg(m.maintenance_message || ''); setReplayHost(m.replay_path || 'rply'); setLiveOrigin(m.live_origin || ''); setMainOrigin(m.main_origin || ''); setReplayOrigin(m.replay_origin || ''); setLinkOrigin(m.link_origin || ''); setHideYt(m.hide_youtube_on_main === 'true'); setCompact(m.compact_replay_cards === 'true');
    const { data: b } = await supabase.from('blocked_users').select('id,user_id,phone,email,reason,created_at').eq('active', true).order('created_at', { ascending: false });
    setBlocked((b || []) as BlockedRow[]);
  };
  useEffect(() => { loadAll(); }, []);

  const setSetting = async (key: string, value: string) => {
    const { data: ex } = await supabase.from('site_settings').select('id').eq('key', key).maybeSingle();
    const { error } = ex
      ? await supabase.from('site_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
      : await supabase.from('site_settings').insert({ key, value });
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const toggleMode = async (v: boolean) => {
    if (await setSetting('maintenance_mode', v ? 'true' : 'false')) {
      setMode(v); toast.success(v ? 'Mode Perbaikan aktif (kecuali halaman Live)' : 'Mode Perbaikan dimatikan');
    }
  };

  const search = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_search_users_by_phone', { _q: q });
    setBusy(false);
    if (error) return toast.error(error.message);
    setFound((data || []) as Found[]);
    if (!data?.length) toast.info('Tidak ada akun dengan nomor itu. Anda tetap bisa memblokir nomornya.');
  };

  const block = async (userId: string | null, phone: string) => {
    const { error } = await supabase.rpc('admin_block_user', { _user_id: userId as any, _phone: phone, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success('User diblokir'); setReason('');
    await loadAll(); if (q) search();
  };

  const unblock = async (id: string) => {
    const { error } = await supabase.rpc('admin_unblock_user', { _id: id });
    if (error) return toast.error(error.message);
    toast.success('Blokir dibuka'); await loadAll(); if (q) search();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" /> Mode Perbaikan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Saat aktif, semua halaman tertutup kecuali halaman Live dan panel admin.</p>
            <Switch checked={mode} onCheckedChange={toggleMode} />
          </div>
          <div className="flex gap-2">
            <Input placeholder="Pesan untuk pengunjung (opsional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <Button variant="outline" onClick={async () => { if (await setSetting('maintenance_message', msg)) toast.success('Pesan disimpan'); }}>Simpan</Button>
          </div>
          <div className="space-y-1 pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">Path Replay Rahasia</p>
            <p className="text-xs text-muted-foreground">Halaman daftar replay di realtime48show.my.id/&lt;path&gt; — selalu terbuka walau Mode Perbaikan aktif, hanya bisa diakses lewat link. Dipakai untuk "Link Replay" di semua pesan. Halaman utama (/) tetap tertutup saat Mode Perbaikan.</p>
            <div className="flex gap-2">
              <Input placeholder="contoh: rply" value={replayHost} onChange={(e) => setReplayHost(e.target.value)} />
              <Button variant="outline" onClick={async () => {
                const v = replayHost.trim().replace(/^https?:\/\//i, '').replace(/^[a-z0-9.-]+\//i, '').replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'rply';
                if (await setSetting('replay_path', v)) { setReplayHost(v); toast.success(`Path replay disimpan: realtime48show.my.id/${v}`); }
              }}>Simpan</Button>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">Pengaturan Domain Website A / B</p>
            <p className="text-xs text-muted-foreground">Website A dan B memakai data yang sama. Isi alamat website tujuan untuk tiap fungsi; pengunjung otomatis dipindahkan ke sana beserta token/sandinya. Kosongkan = tetap di website yang sedang dibuka. Admin dan reseller tidak dipindahkan.</p>
            {([
              ['main_origin', 'Website Pembayaran & halaman utama', mainOrigin, setMainOrigin],
              ['live_origin', 'Website Live (halaman Live & TV)', liveOrigin, setLiveOrigin],
              ['replay_origin', 'Website Replay (path replay rahasia)', replayOrigin, setReplayOrigin],
              ['link_origin', 'Domain yang tertulis di pesan (WA/Telegram/link)', linkOrigin, setLinkOrigin],
            ] as const).map(([key, label, val, set]) => (
              <div key={key} className="space-y-1">
                <p className="text-xs font-medium text-foreground">{label}</p>
                <div className="flex gap-2">
                  <Input placeholder="https://domain.com (kosong = tidak dialihkan)" value={val} onChange={(e) => set(e.target.value)} />
                  <Button variant="outline" onClick={async () => {
                    let v = val.trim();
                    if (v) {
                      if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
                      try { v = 'https://' + new URL(v).host.toLowerCase(); } catch { return toast.error('Domain tidak valid'); }
                    }
                    if (key === 'link_origin' && v) v = v.replace(/^https:\/\//, '');
                    if (await setSetting(key, v)) { set(v); toast.success(v ? `${label}: ${v}` : `${label}: tidak dialihkan`); }
                  }}>Simpan</Button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Catatan: domain di pesan hanya mengganti alamat; pastikan domain itu sudah tersambung ke website A atau B.</p>
          </div>
          <div className="space-y-3 pt-2 border-t border-border">
            <p className="text-sm font-medium text-foreground">Tampilan Replay di Website Ini</p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Sembunyikan sumber YouTube di website ini — ID & video YouTube tidak dikirim ke penonton kecuali di Website Replay (B). Matikan untuk kembali normal.</p>
              <Switch checked={hideYt} onCheckedChange={async (v) => { if (await setSetting('hide_youtube_on_main', v ? 'true' : 'false')) { setHideYt(v); toast.success(v ? 'Sumber YouTube disembunyikan' : 'Sumber YouTube kembali normal'); } }} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Kartu replay ringkas — hanya singkatan judul, tanggal, kriteria, line up (tanpa foto), dan tombol beli. Judul asli & foto tidak dihapus; matikan untuk kembali seperti semula.</p>
              <Switch checked={compact} onCheckedChange={async (v) => { if (await setSetting('compact_replay_cards', v ? 'true' : 'false')) { setCompact(v); toast.success(v ? 'Kartu ringkas aktif' : 'Kartu kembali lengkap'); } }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Ban className="h-4 w-4" /> Blokir User per Nomor HP</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="08… / 62… / +62…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
            <Button onClick={search} disabled={busy || q.replace(/\D/g, '').length < 4}><Search className="h-4 w-4" /></Button>
          </div>
          <Input placeholder="Alasan blokir (catatan admin)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {found.map((u) => (
            <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
              <div>
                <div className="font-medium">{u.email} {u.username ? `· ${u.username}` : ''}</div>
                <div className="text-xs text-muted-foreground">{u.phone} · daftar {new Date(u.created_at).toLocaleDateString('id-ID')}</div>
              </div>
              {u.blocked ? <Badge variant="destructive">Diblokir</Badge>
                : <Button size="sm" variant="destructive" onClick={() => block(u.user_id, u.phone || '')}>Blokir</Button>}
            </div>
          ))}
          {q.replace(/\D/g, '').length >= 8 && (
            <Button size="sm" variant="outline" onClick={() => block(null, q)}>Blokir nomor {q} saja (tanpa akun)</Button>
          )}
          <p className="text-xs text-muted-foreground">User terblokir melihat "Website dalam perbaikan" dan ditolak masuk Live/Replay, termasuk lewat link token atau sandi yang terdaftar dengan nomornya.</p>

          <div className="space-y-2 pt-2">
            <div className="text-sm font-semibold">User Diblokir ({blocked.length})</div>
            {blocked.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <div>
                  <div className="font-medium">{b.email || '(tanpa akun)'} · {b.phone || '-'}</div>
                  {b.reason && <div className="text-xs text-muted-foreground">{b.reason}</div>}
                </div>
                <Button size="sm" variant="outline" onClick={() => unblock(b.id)}><Unlock className="mr-1 h-3 w-3" /> Buka</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
