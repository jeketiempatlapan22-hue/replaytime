import { useEffect, useState } from 'react';
import { Plus, Trash2, Radio, Film, Save, Loader2, KeyRound, ArrowRightLeft, Send } from 'lucide-react';
import ShowLiveTokensDialog from './ShowLiveTokensDialog';
import ShowOrdersResendDialog from './ShowOrdersResendDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import YouTubeIdInput from '@/components/admin/YouTubeIdInput';
import { parseYouTubeId } from '@/lib/youtube';

type SrcType = 'm3u8' | 'youtube' | 'cloudflare';
interface LiveSource { label: string; type: SrcType; url: string }

interface Props {
  showId: string;
  showTitle: string;
}

export default function ShowLiveControl({ showId, showTitle }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [resendOpen, setResendOpen] = useState(false);

  useEffect(() => {
    if (!showId) return;
    let mounted = true;
    void supabase
      .from('active_show_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', showId)
      .then(({ count }) => { if (mounted) setTokenCount(count ?? 0); });
    return () => { mounted = false; };
  }, [showId, tokensOpen]);


  const [isLive, setIsLive] = useState(false);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const [autoSchedule, setAutoSchedule] = useState(false);

  const [liveUrl, setLiveUrl] = useState('');
  const [liveType, setLiveType] = useState<SrcType>('m3u8');
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [livePassword, setLivePassword] = useState('');
  const [requirePw, setRequirePw] = useState(true);

  const [replayMode, setReplayMode] = useState(false);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [replayM3u8, setReplayM3u8] = useState('');
  const [replayYt, setReplayYt] = useState('');
  const [idnShowId, setIdnShowId] = useState('');
  const [groupLink, setGroupLink] = useState('');
  const [groupLinkEnabled, setGroupLinkEnabled] = useState(false);
  const [groupLinkLabel, setGroupLinkLabel] = useState('Join Saluran');
  const [groupLinkNote, setGroupLinkNote] = useState('');
  const [replayInfo, setReplayInfo] = useState('');

  const [freeEnabled, setFreeEnabled] = useState(false);
  const [freeShowId, setFreeShowId] = useState('');
  const [freeSaving, setFreeSaving] = useState(false);
  const [freeDuration, setFreeDuration] = useState(0);
  const [freeStartedAt, setFreeStartedAt] = useState('');
  const [wmEnabled, setWmEnabled] = useState(false);
  const [wmText, setWmText] = useState('');
  const [wmOpacity, setWmOpacity] = useState(25);
  const [wmSize, setWmSize] = useState(12);
  const [flEnabled, setFlEnabled] = useState(false);
  const [flUrl, setFlUrl] = useState('');
  const [flLabel, setFlLabel] = useState('Join Saluran');


  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<SrcType>('m3u8');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    supabase.from('site_settings').select('key,value')
      .in('key', ['free_mode_enabled', 'free_show_id', 'free_watermark_enabled', 'free_watermark_text', 'free_watermark_opacity', 'free_watermark_size', 'free_link_enabled', 'free_link_url', 'free_link_label', 'free_duration_minutes', 'free_started_at'])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map((r: any) => [r.key, String(r.value || '')]));
        setFreeEnabled(map.free_mode_enabled === 'true');
        setFreeShowId(map.free_show_id || '');
        setFreeDuration(Number(map.free_duration_minutes) || 0);
        setFreeStartedAt(map.free_started_at || '');
        setWmEnabled(map.free_watermark_enabled === 'true');

        setWmText(map.free_watermark_text || '');
        setWmOpacity(Number(map.free_watermark_opacity) || 25);
        setWmSize(Number(map.free_watermark_size) || 12);
        setFlEnabled(map.free_link_enabled === 'true');
        setFlUrl(map.free_link_url || '');
        setFlLabel(map.free_link_label || 'Join Saluran');
      });
  }, []);

  const saveSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase.from('site_settings').select('id').eq('key', key).maybeSingle();
    if (existing) {
      const { error } = await supabase.from('site_settings').update({ value }).eq('key', key);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('site_settings').insert({ key, value });
      if (error) throw error;
    }
  };

  const applyFree = async (enabled: boolean, targetShow: string) => {
    setFreeSaving(true);
    try {
      await saveSetting('free_mode_enabled', enabled ? 'true' : 'false');
      await saveSetting('free_show_id', targetShow);
      let startedAt = freeStartedAt;
      if (enabled) {
        // Setiap kali mode gratis dinyalakan, hitung mundur durasi dimulai dari sekarang.
        startedAt = new Date().toISOString();
        await saveSetting('free_started_at', startedAt);
        setFreeStartedAt(startedAt);
      }
      setFreeEnabled(enabled);
      setFreeShowId(targetShow);
      toast({
        title: enabled ? 'Mode gratis AKTIF' : 'Mode gratis MATI',
        description: enabled
          ? (freeDuration > 0 ? `Siaran gratis berjalan ${freeDuration} menit lalu mati otomatis.` : 'Halaman /free bisa diakses untuk show ini.')
          : 'Endpoint /free-token dinonaktifkan.',
      });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan mode gratis', description: e.message, variant: 'destructive' });
    }
    setFreeSaving(false);
  };

  const saveFreeExtras = async () => {
    setFreeSaving(true);
    try {
      await saveSetting('free_duration_minutes', String(Math.min(1440, Math.max(0, Math.round(freeDuration) || 0))));
      await saveSetting('free_watermark_enabled', wmEnabled ? 'true' : 'false');
      await saveSetting('free_watermark_text', wmText.slice(0, 120));
      await saveSetting('free_watermark_opacity', String(Math.min(100, Math.max(1, wmOpacity))));
      await saveSetting('free_watermark_size', String(Math.min(30, Math.max(2, wmSize))));
      await saveSetting('free_link_enabled', flEnabled ? 'true' : 'false');
      await saveSetting('free_link_url', flUrl.trim());
      await saveSetting('free_link_label', flLabel.trim().slice(0, 40) || 'Join Saluran');

      toast({ title: 'Pengaturan halaman /free disimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    }
    setFreeSaving(false);
  };

  useEffect(() => {
    if (!showId) return;
    setLoading(true);
    (supabase as any).rpc('admin_get_active_show', { _id: showId }).then(({ data }: any) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setIsLive(!!row.is_live);
        setHoldUntil((row as any).live_hold_until || null);
        setAutoSchedule(!!row.live_auto_schedule);

        setLiveUrl(row.live_url || '');
        setLiveType(((row.live_type as SrcType) || 'm3u8'));
        setLiveSources(Array.isArray(row.live_sources) ? row.live_sources as any : []);
        setLivePassword(row.live_password || '');
        setRequirePw(row.live_require_password !== false);
        setReplayMode(!!row.replay_mode);
        setReplayId((row as any).replay_id || null);
        setReplayM3u8(row.replay_m3u8_url || '');
        setReplayYt(row.replay_youtube_url || '');
        setIdnShowId((row as any).idn_show_id || '');
        setGroupLink((row as any).group_link || '');
        setGroupLinkEnabled(!!(row as any).group_link_enabled);
        setGroupLinkLabel((row as any).group_link_label || 'Join Saluran');
        setGroupLinkNote((row as any).group_link_note || '');
        setReplayInfo((row as any).replay_info || '');
      }
      setLoading(false);
    });
  }, [showId]);

  const addSource = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    if (newType === 'youtube' && !parseYouTubeId(newUrl)) {
      toast({ title: 'YouTube tidak valid', description: 'Format YouTube tidak dikenali. Periksa link/ID.', variant: 'destructive' });
      return;
    }
    const url = newType === 'youtube' ? (parseYouTubeId(newUrl) || '') : newUrl.trim();
    setLiveSources(prev => [...prev, { label: newLabel.trim().slice(0, 80), type: newType, url }]);
    setNewLabel(''); setNewUrl(''); setNewType('m3u8');
  };

  const removeSource = (i: number) => setLiveSources(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    // Normalisasi YouTube ke ID 11 karakter & validasi
    let normalizedLiveUrl = liveUrl.trim();
    if (liveType === 'youtube' && normalizedLiveUrl) {
      const id = parseYouTubeId(normalizedLiveUrl);
      if (!id) {
        toast({ title: 'YouTube tidak valid', description: 'Live URL Utama: format YouTube tidak dikenali.', variant: 'destructive' });
        return;
      }
      normalizedLiveUrl = id;
    }
    let normalizedReplayYt = replayYt.trim();
    if (normalizedReplayYt) {
      const id = parseYouTubeId(normalizedReplayYt);
      if (!id) {
        toast({ title: 'YouTube tidak valid', description: 'Replay YouTube: format tidak dikenali.', variant: 'destructive' });
        return;
      }
      normalizedReplayYt = id;
    }
    const normalizedSources = liveSources.map(s => s.type === 'youtube'
      ? { ...s, url: parseYouTubeId(s.url) || s.url }
      : s);
    const invalidYt = liveSources.find(s => s.type === 'youtube' && s.url && !parseYouTubeId(s.url));
    if (invalidYt) {
      toast({ title: 'YouTube tidak valid', description: `Sumber "${invalidYt.label}" memiliki YouTube tidak dikenali.`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-live', {
        body: {
          action: 'upsert_active_show',
          show: {
            id: showId,
            is_live: isLive,
            live_auto_schedule: autoSchedule,
            live_url: normalizedLiveUrl,
            live_type: liveType,
            live_sources: normalizedSources,
            live_password: livePassword,
            live_require_password: requirePw,
            replay_mode: replayMode,
            replay_m3u8_url: replayM3u8.trim(),
            replay_youtube_url: normalizedReplayYt,
            idn_show_id: idnShowId.trim(),
            group_link: groupLink.trim(),
            group_link_enabled: groupLinkEnabled,
            group_link_label: groupLinkLabel.trim() || 'Join Saluran',
            group_link_note: groupLinkNote.trim(),
            replay_info: replayInfo.trim(),
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLiveUrl(normalizedLiveUrl);
      setReplayYt(normalizedReplayYt);
      setLiveSources(normalizedSources);
      toast({ title: 'Pengaturan Live & Replay tersimpan' });

      // Mode Replay ON dan show belum punya replay → konversi otomatis:
      // kartu keluar dari menu Streaming Show dan pindah ke halaman Replay,
      // sehingga link token yang sudah dibagikan tetap membuka replaynya.
      if (replayMode && !replayId) {
        const { data: conv, error: convErr } = await (supabase as any).rpc('convert_show_to_replay', { _show_id: showId });
        if (convErr) throw convErr;
        setReplayId(conv as string);
        toast({ title: 'Show dipindahkan ke Replay', description: 'Kartu otomatis hilang dari menu Streaming Show.' });
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const holdActive = !!holdUntil && new Date(holdUntil).getTime() > Date.now();

  const applyHold = async (hours: number) => {
    const until = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-live', {
        body: {
          action: 'upsert_active_show',
          show: { id: showId, live_hold_until: until, ...(until ? { is_live: false, live_auto_schedule: false } : {}) },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setHoldUntil(until);
      if (until) { setIsLive(false); setAutoSchedule(false); }
      toast({
        title: until ? 'Live ditahan' : 'Tahan live dilepas',
        description: until ? `Auto-live tidak akan menyala sampai ${new Date(until).toLocaleString('id-ID')}.` : 'Auto-live kembali normal.',
      });
    } catch (e: any) {
      toast({ title: 'Gagal mengubah override', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };



  if (loading) return <div className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Memuat…</div>;

  return (
    <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm">Live & Replay — {showTitle || 'Show'}</h3>
      </div>

      {/* Live toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div>
            <Label className="text-sm">Sedang LIVE sekarang</Label>
            <p className="text-[11px] text-muted-foreground">Perubahan langsung berlaku tanpa perlu Simpan. Mematikan juga menonaktifkan jadwal otomatis.</p>
          </div>
          <Switch
            checked={isLive}
            disabled={saving}
            onCheckedChange={async (v) => {
              const prevLive = isLive;
              const prevAuto = autoSchedule;
              setIsLive(v);
              if (!v) setAutoSchedule(false);
              setSaving(true);
              try {
                const { data, error } = await supabase.functions.invoke('manage-live', {
                  body: {
                    action: 'upsert_active_show',
                    show: { id: showId, is_live: v, ...(v ? {} : { live_auto_schedule: false }) },
                  },
                });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                toast({ title: v ? 'Live diaktifkan' : 'Live dimatikan', description: v ? 'Show ini sekarang LIVE.' : 'Jadwal otomatis ikut dimatikan.' });
              } catch (e: any) {
                setIsLive(prevLive);
                setAutoSchedule(prevAuto);
                toast({ title: 'Gagal mengubah status live', description: e.message, variant: 'destructive' });
              }
              setSaving(false);
            }}
          />
        </div>
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div>
            <Label className="text-sm">Live Otomatis Sesuai Jadwal</Label>
            <p className="text-[11px] text-muted-foreground">Aktif otomatis pada jam show selama 8 jam.</p>
          </div>
          <Switch
            checked={autoSchedule}
            disabled={saving}
            onCheckedChange={async (v) => {
              const previous = autoSchedule;
              setAutoSchedule(v);
              setSaving(true);
              try {
                const { data, error } = await supabase.functions.invoke('manage-live', {
                  body: {
                    action: 'upsert_active_show',
                    show: { id: showId, live_auto_schedule: v },
                  },
                });
                if (error) throw error;
                if (data?.error) throw new Error(data.error);
                toast({
                  title: v ? 'Live otomatis diaktifkan' : 'Live otomatis dinonaktifkan',
                  description: v ? 'Show akan mulai 20 menit sebelum jadwal.' : 'Jadwal otomatis tidak akan mengubah status live.',
                });
              } catch (e: any) {
                setAutoSchedule(previous);
                toast({ title: 'Gagal mengubah live otomatis', description: e.message, variant: 'destructive' });
              }
              setSaving(false);
            }}
          />
        </div>
      </div>

      {/* Override: tahan live */}
      <div className="p-3 rounded bg-card border border-border space-y-2">
        <div>
          <Label className="text-sm">Override — Tahan Live (anti nyala otomatis)</Label>
          <p className="text-[11px] text-muted-foreground">
            Mematikan live dan mencegah sistem otomatis menyalakannya lagi sampai waktu yang dipilih.
          </p>
        </div>
        {holdActive ? (
          <p className="text-[11px] font-semibold text-amber-600">
            Ditahan sampai {new Date(holdUntil as string).toLocaleString('id-ID')}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Saat ini tidak ditahan.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {[
            { label: '1 jam', h: 1 },
            { label: '3 jam', h: 3 },
            { label: '12 jam', h: 12 },
            { label: '24 jam', h: 24 },
          ].map(o => (
            <Button key={o.h} size="sm" variant="outline" disabled={saving} onClick={() => applyHold(o.h)}>
              {o.label}
            </Button>
          ))}
          {holdActive && (
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => applyHold(0)}>
              Lepas tahan
            </Button>
          )}
        </div>
      </div>



      {/* Mode Gratis (/free) */}
      <div className="p-3 rounded bg-card border border-amber-500/40 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label className="text-sm">Mode Gratis — halaman /free</Label>
            <p className="text-[11px] text-muted-foreground">
              Saat OFF, endpoint /free-token mati total. Saat ON, hanya show yang dipilih di bawah yang bisa ditonton gratis (sesi 30 menit per perangkat).
            </p>
          </div>
          <Switch
            checked={freeEnabled}
            disabled={freeSaving}
            onCheckedChange={(v) => applyFree(v, v ? (freeShowId || showId) : freeShowId)}
          />
        </div>
        <div className="text-[11px]">
          Show gratis saat ini:{' '}
          <span className="font-mono">{freeShowId ? (freeShowId === showId ? showTitle : freeShowId) : '— belum dipilih —'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={freeShowId === showId ? 'secondary' : 'outline'} disabled={freeSaving}
            onClick={() => applyFree(freeEnabled, showId)}>
            Jadikan show ini gratis
          </Button>
          {freeShowId && (
            <Button size="sm" variant="outline" disabled={freeSaving} onClick={() => applyFree(false, '')}>
              Hapus show gratis
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => {
            navigator.clipboard.writeText(`https://realtime48show.my.id/free?show=${showId}`);
            toast({ title: 'Link /free disalin' });
          }}>
            Salin link /free
          </Button>
        </div>

        {/* Durasi siaran gratis */}
        <div className="pt-2 mt-1 border-t border-border/60 space-y-2">
          <Label className="text-sm">Durasi siaran gratis</Label>
          <p className="text-[11px] text-muted-foreground">
            Isi dalam menit. Siaran gratis mati otomatis saat durasi tercapai. Isi 0 untuk tanpa batas.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={0}
              max={1440}
              value={freeDuration}
              onChange={e => setFreeDuration(Number(e.target.value))}
              className="w-28"
            />
            <span className="text-[11px] text-muted-foreground">menit</span>
            {[30, 60, 90, 120].map(m => (
              <Button key={m} size="sm" variant={freeDuration === m ? 'secondary' : 'outline'} onClick={() => setFreeDuration(m)}>
                {m}m
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={freeSaving || !freeEnabled} onClick={async () => {
              setFreeSaving(true);
              try {
                const now = new Date().toISOString();
                await saveSetting('free_started_at', now);
                setFreeStartedAt(now);
                toast({ title: 'Hitung mundur gratis dimulai ulang' });
              } catch (e: any) {
                toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
              }
              setFreeSaving(false);
            }}>
              Mulai ulang hitung mundur
            </Button>
          </div>
          {freeEnabled && freeDuration > 0 && freeStartedAt && (
            <p className="text-[11px] text-muted-foreground">
              Berakhir sekitar:{' '}
              <span className="font-mono">
                {new Date(new Date(freeStartedAt).getTime() + freeDuration * 60000).toLocaleString('id-ID')}
              </span>
            </p>
          )}
        </div>



        {/* Watermark selayar khusus /free */}
        <div className="pt-2 mt-1 border-t border-border/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-sm">Watermark selayar (hanya halaman /free)</Label>
              <p className="text-[11px] text-muted-foreground">Teks putih menutupi 100% layar player, termasuk saat fullscreen.</p>
            </div>
            <Switch checked={wmEnabled} onCheckedChange={setWmEnabled} />
          </div>
          <div>
            <Label className="text-xs">Teks watermark</Label>
            <Input value={wmText} onChange={e => setWmText(e.target.value)} placeholder="REALTIME48STREAM" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Transparansi: {wmOpacity}%</Label>
              <input type="range" min={1} max={100} value={wmOpacity}
                onChange={e => setWmOpacity(Number(e.target.value))} className="w-full accent-primary" />
            </div>
            <div>
              <Label className="text-xs">Ukuran teks: {wmSize}</Label>
              <input type="range" min={2} max={30} value={wmSize}
                onChange={e => setWmSize(Number(e.target.value))} className="w-full accent-primary" />
            </div>
          </div>
        </div>

        {/* Tombol saluran khusus /free */}
        <div className="pt-2 mt-1 border-t border-border/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-sm">Tombol saluran (hanya halaman /free)</Label>
              <p className="text-[11px] text-muted-foreground">Tidak tampil di halaman live lain.</p>
            </div>
            <Switch checked={flEnabled} onCheckedChange={setFlEnabled} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Label tombol</Label>
              <Input value={flLabel} onChange={e => setFlLabel(e.target.value)} placeholder="Join Saluran" />
            </div>
            <div>
              <Label className="text-xs">Link saluran</Label>
              <Input value={flUrl} onChange={e => setFlUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        <Button size="sm" disabled={freeSaving} onClick={saveFreeExtras}>
          {freeSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Simpan pengaturan /free
        </Button>
      </div>

      {/* Live URL */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-1">
          <Label className="text-xs">Tipe Player Utama</Label>
          <select value={liveType} onChange={e => setLiveType(e.target.value as SrcType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="m3u8">M3U8 / HLS</option>
            <option value="youtube">YouTube</option>
            <option value="cloudflare">Cloudflare</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Live URL Utama</Label>
          {liveType === 'youtube' ? (
            <YouTubeIdInput value={liveUrl} onChange={setLiveUrl} placeholder="URL YouTube (live/watch/youtu.be) atau ID 11 karakter" />
          ) : (
            <Input value={liveUrl} onChange={e => setLiveUrl(e.target.value)} placeholder={liveType === 'cloudflare' ? 'Cloudflare UID atau URL' : 'https://...m3u8'} />
          )}
        </div>
      </div>

      {/* IDN Show ID */}
      <div>
        <Label className="text-xs flex items-center gap-1">📺 IDN Show ID (untuk Player IDN)</Label>
        <Input
          value={idnShowId}
          onChange={e => setIdnShowId(e.target.value)}
          placeholder="Show ID dari IDN (mis. 1234567). Kosongkan untuk menonaktifkan player IDN."
        />
        <p className="text-[11px] text-muted-foreground mt-1">Saat diisi, sumber "IDN" akan otomatis tampil di playlist player Live. Token stream diambil otomatis dari server.</p>
      </div>

      {/* Show Spesial: link grup & info replay */}
      <div className="p-3 rounded bg-card border border-border space-y-2">
        <Label className="text-xs flex items-center gap-1">👥 Link Grup (Show Spesial)</Label>
        <Input
          value={groupLink}
          onChange={e => setGroupLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/... (opsional). Otomatis dikirim ke WA pembeli show."
        />
        <div className="flex items-center justify-between gap-3 rounded border border-border bg-background px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Tampilkan tombol saluran di halaman Live</p>
            <p className="text-[11px] text-muted-foreground">Aktif/nonaktif realtime, tampil di atas Live Chat.</p>
          </div>
          <Switch checked={groupLinkEnabled} onCheckedChange={setGroupLinkEnabled} />
        </div>
        <Input
          value={groupLinkLabel}
          onChange={e => setGroupLinkLabel(e.target.value)}
          placeholder="Teks tombol (mis. Join Saluran WhatsApp)"
        />
        <Input
          value={groupLinkNote}
          onChange={e => setGroupLinkNote(e.target.value)}
          placeholder="Keterangan singkat di bawah tombol (opsional)"
        />
        <Label className="text-xs flex items-center gap-1 pt-1">🎞️ Info Replay (Show Spesial)</Label>
        <textarea
          value={replayInfo}
          onChange={e => setReplayInfo(e.target.value)}
          rows={2}
          placeholder="Info replay yang dikirim ke pembeli (mis. 'Replay tersedia 7 hari setelah show')."
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">Dikirim otomatis di pesan WhatsApp saat user membeli show (QRIS / koin).</p>
      </div>


      {/* Sumber video */}
      <div className="space-y-2">
        <Label className="text-xs flex items-center gap-1">📋 Sumber Video Tambahan</Label>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_2fr_auto] gap-2">
          <Input placeholder="Label (e.g. Server 1)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <select value={newType} onChange={e => setNewType(e.target.value as SrcType)}
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="m3u8">M3U8</option>
            <option value="youtube">YouTube</option>
            <option value="cloudflare">Cloudflare</option>
          </select>
          {newType === 'youtube' ? (
            <YouTubeIdInput value={newUrl} onChange={setNewUrl} placeholder="URL YouTube atau ID 11 karakter" />
          ) : (
            <Input placeholder={newType === 'cloudflare' ? 'Cloudflare UID atau URL' : 'https://...m3u8'} value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          )}
          <Button type="button" onClick={addSource} size="sm"><Plus className="w-4 h-4 mr-1" />Tambah</Button>
        </div>
        {liveSources.length > 0 && (
          <div className="space-y-1.5">
            {liveSources.map((s, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] uppercase">{s.type}</Badge>
                    <span className="truncate">{s.url}</span>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSource(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sandi */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <div className="sm:col-span-2">
          <Label className="text-xs">🔐 Sandi Akses LIVE</Label>
          <Input value={livePassword} onChange={e => setLivePassword(e.target.value)} placeholder="Sandi yang akan dibagi ke pembeli" />
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-card border border-border h-10">
          <Label className="text-xs">Wajib sandi</Label>
          <Switch checked={requirePw} onCheckedChange={setRequirePw} />
        </div>
      </div>

      {/* Replay mode */}
      <div className="pt-3 border-t border-border/40 space-y-3">
        <div className="flex items-center justify-between p-3 rounded bg-card border border-border">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <div>
              <Label className="text-sm">Mode Replay</Label>
              <p className="text-[11px] text-muted-foreground">Saat ON, kartu memutar replay langsung dari URL di bawah.</p>
            </div>
          </div>
          <Switch checked={replayMode} onCheckedChange={setReplayMode} />
        </div>
        <div>
          <Label className="text-xs">Link M3U8 (HLS)</Label>
          <Input value={replayM3u8} onChange={e => setReplayM3u8(e.target.value)} placeholder="https://...replay.m3u8" />
        </div>
        <div>
          <Label className="text-xs">Link YouTube (URL atau ID)</Label>
          <YouTubeIdInput value={replayYt} onChange={setReplayYt} placeholder="URL YouTube (live/watch/youtu.be) atau ID 11 karakter" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Pengaturan Live & Replay
        </Button>
        <Button type="button" variant="outline" onClick={() => setTokensOpen(true)} className="w-full sm:w-auto">
          <KeyRound className="w-4 h-4 mr-2" />Token & Riwayat Akses
          <Badge variant="secondary" className="ml-2 text-[10px]">{tokenCount ?? '…'}</Badge>
        </Button>

        <Button type="button" variant="outline" onClick={() => setResendOpen(true)} className="w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" />Resend WA Pembelian
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={async () => {
            if (!confirm('Konversi show ini menjadi Replay?\n\nKartu akan PINDAH dari menu Streaming Show ke halaman Replay (show aktif akan dinonaktifkan). Pastikan link replay sudah diisi.')) return;
            setSaving(true);
            try {
              const { data, error } = await (supabase as any).rpc('convert_show_to_replay', { _show_id: showId });
              if (error) throw error;
              toast({ title: 'Berhasil dikonversi ke Replay', description: `Replay ID: ${data}` });
              setTimeout(() => window.location.reload(), 800);
            } catch (e: any) {
              toast({ title: 'Gagal konversi', description: e.message, variant: 'destructive' });
            }
            setSaving(false);
          }}
        >
          <ArrowRightLeft className="w-4 h-4 mr-2" />Konversi ke Replay
        </Button>
      </div>
      <ShowLiveTokensDialog open={tokensOpen} onOpenChange={setTokensOpen} showId={showId} showTitle={showTitle} />
      <ShowOrdersResendDialog open={resendOpen} onOpenChange={setResendOpen} showId={showId} showTitle={showTitle} />
    </div>
  );
}
