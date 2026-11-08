import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { Copy, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, AlertTriangle, Save, RotateCcw } from 'lucide-react';

const DEFAULT_WA_TPL =
  '🎬 *{title}*\n{date_line}\n🔗 Link Akses:\n{link}\n{password_line}{live_link_block}\n— *ReplayTime* 💖';

const DEFAULT_SHOW_TPL =
  '🔐 *TOKEN LIVE SATUAN*\n\n🎤 *{title}*\n\n📅 {date}\n\n🔗 *Link Live:*\n{live_link}\n\n🎬 *Link Replay:* {site}\n\n{password_line}👤 Hanya untuk *1 perangkat pertama*.\n\n— *ReplayTime* 💖';

const DEFAULT_MEMBERSHIP_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n🎬 *Link Replay:* realtime48show.my.id\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

function renderMembershipPreview(tpl: string) {
  const vars = {
    package_name: 'Premium 30 Hari',
    link: 'https://realtime48show.my.id/live?mtoken=ABC123&mp=PASS9999',
    password: 'PASS9999',
    expires_at: '24 Juni 2026',
    duration_days: '30',
    max_devices: '1',
    replay_info: 'Daftar replay yang termasuk:\n• Show A (12/05)\n• Show B (18/05)',
    site: 'realtime48show.my.id',
  };
  return tpl
    .replace(/\{replay_info_block\}\n?/g, vars.replay_info ? `🎬 *Info Replay:*\n${vars.replay_info}\n\n` : '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string>)[k] ?? '');
}


function renderShowPreview(tpl: string) {
  const vars = {
    title: 'PASSION 200% - Ladies Night',
    date: '2026-05-19 19:00',
    live_link: 'https://realtime48show.my.id/live?show=3e6c0444&t=b390f1055',
    password: 'Ladies',
    site: 'realtime48show.my.id',
  };
  return tpl
    .replace(/\{password_line\}\n?/g, vars.password ? `🗝️ Sandi: *${vars.password}*\n\n` : '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string>)[k] ?? '');
}

function renderPreview(tpl: string) {
  const vars = {
    title: 'Show • Sample Konser',
    date: '15 Mei 2026',
    link: 'https://realtime48show.my.id/akses?token=abc123&replay=xyz',
    live_link: 'https://realtime48show.my.id/live?show=xyz&t=abc123',
    password: 'KONSER48',
    order_id: 'rt-demo-001',
    site: 'https://realtime48show.my.id',
  };
  return tpl
    .replace(/\{date_line\}\n?/g, vars.date ? `📅 ${vars.date}\n` : '')
    .replace(/\{password_line\}\n?/g, vars.password ? `🔐 Sandi: *${vars.password}*\n` : '')
    .replace(/\{live_link_block\}\n?/g, vars.live_link ? `\n📺 Link Live:\n${vars.live_link}\n` : '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string>)[k] ?? '');
}

interface CheckRow { name: string; ok: boolean; detail: string }

export default function DOKUAdmin() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const webhookUrl = `${supabaseUrl}/functions/v1/doku-webhook`;

  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [allOk, setAllOk] = useState<boolean | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string>('');
  const [stats, setStats] = useState({ pending: 0, paid24h: 0, sent24h: 0, lastPaid: '' });
  const [pollRunning, setPollRunning] = useState(false);
  const [tpl, setTpl] = useState<string>(DEFAULT_WA_TPL);
  const [tplLoaded, setTplLoaded] = useState<string>(DEFAULT_WA_TPL);
  const [savingTpl, setSavingTpl] = useState(false);
  const [showTpl, setShowTpl] = useState<string>(DEFAULT_SHOW_TPL);
  const [showTplLoaded, setShowTplLoaded] = useState<string>(DEFAULT_SHOW_TPL);
  const [savingShowTpl, setSavingShowTpl] = useState(false);
  const [memTpl, setMemTpl] = useState<string>(DEFAULT_MEMBERSHIP_TPL);
  const [memTplLoaded, setMemTplLoaded] = useState<string>(DEFAULT_MEMBERSHIP_TPL);
  const [savingMemTpl, setSavingMemTpl] = useState(false);


  const loadStatus = async () => {
    try {
      const { data: s } = await supabase
        .from('site_settings')
        .select('key,value')
        .in('key', ['doku_webhook_verified_at', 'wa_message_template', 'wa_show_template', 'wa_membership_template']);
      const verified = s?.find(r => r.key === 'doku_webhook_verified_at')?.value || '';
      setVerifiedAt(verified);
      const t = s?.find(r => r.key === 'wa_message_template')?.value;
      if (t) { setTpl(t); setTplLoaded(t); }
      const st = s?.find(r => r.key === 'wa_show_template')?.value;
      if (st) { setShowTpl(st); setShowTplLoaded(st); }
      const mt = s?.find(r => r.key === 'wa_membership_template')?.value;
      if (mt) { setMemTpl(mt); setMemTplLoaded(mt); }


      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [pending, paid24h, sent24h, lastPaid] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'paid').gte('paid_at', since),
        supabase.from('orders').select('id', { count: 'exact', head: true }).not('token_sent_at', 'is', null).gte('token_sent_at', since),
        supabase.from('orders').select('paid_at').eq('status', 'paid').order('paid_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        pending: pending.count || 0,
        paid24h: paid24h.count || 0,
        sent24h: sent24h.count || 0,
        lastPaid: (lastPaid.data as any)?.paid_at || '',
      });
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadStatus(); }, []);

  const runSelfTest = async () => {
    setRunning(true);
    setChecks([]);
    setAllOk(null);
    try {
      const { data, error } = await supabase.functions.invoke('doku-selftest', { body: {} });
      if (error) throw error;
      const r = data as { ok: boolean; checks: CheckRow[] };
      setChecks(r.checks || []);
      setAllOk(!!r.ok);
      if (r.ok) toast.success('Koneksi DOKU berhasil');
      else toast.error('Ada cek yang gagal — periksa detail');
      void loadStatus();
    } catch (e: any) {
      toast.error('Self-test gagal: ' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  };

  const runPollNow = async () => {
    setPollRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('poll-pending-orders', { body: {} });
      if (error) throw error;
      const r = data as { scanned: number; results: any[] };
      const paid = (r.results || []).filter(x => x.status === 'paid' || x.sent).length;
      toast.success(`Cron dijalankan: ${r.scanned} order discan, ${paid} ditandai paid`);
      void loadStatus();
    } catch (e: any) {
      toast.error('Cron gagal: ' + (e?.message || e));
    } finally {
      setPollRunning(false);
    }
  };

  const copy = async (text: string) => {
    if (await copyToClipboard(text)) toast.success('Disalin'); else toast.error('Salin URL secara manual dari kolom.');
  };

  const saveTpl = async () => {
    setSavingTpl(true);
    try {
      const { data: existing } = await supabase
        .from('site_settings').select('id').eq('key', 'wa_message_template').maybeSingle();
      if (existing?.id) {
        await supabase.from('site_settings').update({ value: tpl }).eq('id', existing.id);
      } else {
        await supabase.from('site_settings').insert({ key: 'wa_message_template', value: tpl });
      }
      setTplLoaded(tpl);
      toast.success('Template tersimpan');
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || e));
    } finally {
      setSavingTpl(false);
    }
  };

  const saveShowTpl = async () => {
    setSavingShowTpl(true);
    try {
      const { data: existing } = await supabase
        .from('site_settings').select('id').eq('key', 'wa_show_template').maybeSingle();
      if (existing?.id) {
        await supabase.from('site_settings').update({ value: showTpl }).eq('id', existing.id);
      } else {
        await supabase.from('site_settings').insert({ key: 'wa_show_template', value: showTpl });
      }
      setShowTplLoaded(showTpl);
      toast.success('Template Live Show tersimpan');
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || e));
    } finally {
      setSavingShowTpl(false);
    }
  };

  const saveMemTpl = async () => {
    setSavingMemTpl(true);
    try {
      const { data: existing } = await supabase
        .from('site_settings').select('id').eq('key', 'wa_membership_template').maybeSingle();
      if (existing?.id) {
        await supabase.from('site_settings').update({ value: memTpl }).eq('id', existing.id);
      } else {
        await supabase.from('site_settings').insert({ key: 'wa_membership_template', value: memTpl });
      }
      setMemTplLoaded(memTpl);
      toast.success('Template Membership tersimpan');
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || e));
    } finally {
      setSavingMemTpl(false);
    }
  };




  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            Webhook URL DOKU
            {verifiedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> tervalidasi {new Date(verifiedAt).toLocaleString('id-ID')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" /> belum tervalidasi
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Salin URL ini ke kolom <em>Webhook URL</em> di dashboard DOKU</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)} title="Salin">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1 pl-1">
            <li>Buka dashboard DOKU → pengaturan integrasi QRIS SNAP.</li>
            <li>Tempel URL di atas pada kolom <b>Webhook URL</b> (HTTP POST, JSON).</li>
            <li>Pastikan <b>Client ID</b>, <b>Secret Key</b>, dan kunci RSA terdaftar telah disimpan aman.</li>
            <li>Klik <b>Jalankan Self-Test</b> di bawah untuk memeriksa koneksi DOKU (bukan uji pembayaran).</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runSelfTest} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Jalankan Self-Test
            </Button>
            <Button variant="outline" asChild>
              <a href="https://dashboard.doku.com" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Buka Dashboard DOKU
              </a>
            </Button>
          </div>

          {checks.length > 0 && (
            <div className={`rounded-md border p-3 space-y-2 ${allOk ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {c.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-muted-foreground break-all">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Status Pemrosesan Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Pending (semua)</div>
              <div className="text-xl font-bold">{stats.pending}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Paid 24 jam</div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{stats.paid24h}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Token terkirim 24 jam</div>
              <div className="text-xl font-bold text-primary">{stats.sent24h}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground">Bayar terakhir</div>
              <div className="text-xs font-mono">{stats.lastPaid ? new Date(stats.lastPaid).toLocaleString('id-ID') : '—'}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPollNow} disabled={pollRunning}>
              {pollRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Jalankan Cron Poller Sekarang
            </Button>
            <Button variant="ghost" onClick={loadStatus}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Selain webhook, sistem juga punya cron 1 menit (<code>poll-pending-orders</code>) sebagai jaring pengaman.
            Klien juga melakukan polling ke <code>check-doku-status</code> selama dialog QR terbuka. Idempotensi
            dijamin: token & link hanya dikirim sekali per order.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Template Pesan WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Template ini dipakai saat <b>token & link replay</b> dikirim setelah pembayaran QRIS lunas.
            Pakai placeholder berikut — sistem otomatis menyembunyikan baris kosong:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            {[
              ['{title}', 'Nama show / replay'],
              ['{date}', 'Tanggal hari ini'],
              ['{date_line}', 'Baris tanggal (📅)'],
              ['{link}', 'Link akses replay'],
              ['{live_link}', 'Link tonton Live'],
              ['{live_link_block}', 'Blok link Live (📺)'],
              ['{password}', 'Sandi dari kartu show'],
              ['{password_line}', 'Baris sandi (🔐)'],
              ['{order_id}', 'Order ID DOKU'],
              ['{site}', 'realtime48show.my.id'],
            ].map(([k, d]) => (
              <code key={k} className="bg-muted/40 rounded px-1.5 py-1 text-foreground" title={d}>
                {k} <span className="text-muted-foreground">— {d}</span>
              </code>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Textarea
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              rows={10}
              className="font-mono text-xs whitespace-pre"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pratinjau</Label>
            <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-sans">
              {renderPreview(tpl)}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveTpl} disabled={savingTpl || tpl === tplLoaded}>
              {savingTpl ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Template
            </Button>
            <Button variant="outline" onClick={() => setTpl(DEFAULT_WA_TPL)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset Default
            </Button>
            <Button variant="ghost" onClick={() => setTpl(tplLoaded)} disabled={tpl === tplLoaded}>
              Batalkan Perubahan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Template Pesan WhatsApp — Live Show</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Template ini dipakai saat <b>token Live Show</b> dikirim (lewat QRIS DOKU maupun pembelian koin).
            Placeholder yang tersedia:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            {[
              ['{title}', 'Nama show'],
              ['{date}', 'Tanggal & jam show'],
              ['{live_link}', 'Link token Live'],
              ['{password}', 'Sandi live show'],
              ['{password_line}', 'Baris sandi (🗝️)'],
              ['{site}', 'realtime48show.my.id'],
            ].map(([k, d]) => (
              <code key={k} className="bg-muted/40 rounded px-1.5 py-1 text-foreground" title={d}>
                {k} <span className="text-muted-foreground">— {d}</span>
              </code>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Textarea
              value={showTpl}
              onChange={(e) => setShowTpl(e.target.value)}
              rows={12}
              className="font-mono text-xs whitespace-pre"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pratinjau</Label>
            <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-sans">
              {renderShowPreview(showTpl)}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveShowTpl} disabled={savingShowTpl || showTpl === showTplLoaded}>
              {savingShowTpl ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Template
            </Button>
            <Button variant="outline" onClick={() => setShowTpl(DEFAULT_SHOW_TPL)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset Default
            </Button>
            <Button variant="ghost" onClick={() => setShowTpl(showTplLoaded)} disabled={showTpl === showTplLoaded}>
              Batalkan Perubahan
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Template Pesan WhatsApp — Membership</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Template ini dipakai saat user berhasil membeli paket membership (QRIS atau koin).
            Placeholder yang tersedia:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
            {[
              ['{package_name}', 'Nama paket membership'],
              ['{link}', 'Link akses /live?mtoken=...'],
              ['{password}', 'Sandi membership'],
              ['{expires_at}', 'Tanggal berakhir'],
              ['{duration_days}', 'Durasi (hari)'],
              ['{max_devices}', 'Jumlah perangkat'],
              ['{replay_info}', 'Info replay (teks mentah)'],
              ['{replay_info_block}', 'Blok info replay (🎬)'],
              ['{site}', 'realtime48show.my.id'],
            ].map(([k, d]) => (
              <code key={k} className="bg-muted/40 rounded px-1.5 py-1 text-foreground" title={d}>
                {k} <span className="text-muted-foreground">— {d}</span>
              </code>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Template</Label>
            <Textarea
              value={memTpl}
              onChange={(e) => setMemTpl(e.target.value)}
              rows={12}
              className="font-mono text-xs whitespace-pre"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Pratinjau</Label>
            <pre className="rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-sans">
              {renderMembershipPreview(memTpl)}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveMemTpl} disabled={savingMemTpl || memTpl === memTplLoaded}>
              {savingMemTpl ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Template
            </Button>
            <Button variant="outline" onClick={() => setMemTpl(DEFAULT_MEMBERSHIP_TPL)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset Default
            </Button>
            <Button variant="ghost" onClick={() => setMemTpl(memTplLoaded)} disabled={memTpl === memTplLoaded}>
              Batalkan Perubahan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

