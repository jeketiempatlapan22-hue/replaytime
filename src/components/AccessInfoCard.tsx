import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, AlertTriangle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { copyToClipboard } from '@/lib/clipboard';
import JoinGroupButton from '@/components/JoinGroupButton';
import { Textarea } from '@/components/ui/textarea';

export interface AccessInfo {
  ok: boolean;
  title?: string;
  date?: string;
  link?: string;
  replay_link?: string;
  password?: string;
  replay_info?: string;
  group_link?: string;
  message?: string;
}

interface Props {
  token?: string;
  showId?: string;
  replayId?: string;
  mtoken?: string;
  mpassword?: string;
  /** Link cadangan bila edge function gagal (mis. offline) */
  fallbackLink?: string;
  compact?: boolean;
}

async function copyText(text: string, label: string) {
  if (await copyToClipboard(text)) {
    toast.success(`${label} disalin`, { description: 'Tempel ke chat WhatsApp sendiri atau catatan HP kamu.' });
  } else toast.error('Gagal menyalin, salin manual dari kotak di bawah');
}

export default function AccessInfoCard({ token, showId, replayId, mtoken, mpassword, fallbackLink, compact }: Props) {
  const [info, setInfo] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (info) { setOpen(true); return info; }
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('get-access-info', {
        body: { token, show_id: showId, replay_id: replayId, mtoken, mpassword },
      });
      const d = (data || {}) as AccessInfo;
      if (!d.ok) {
        if (fallbackLink) {
          const fb: AccessInfo = { ok: true, link: fallbackLink, message: fallbackLink };
          setInfo(fb); setOpen(true); return fb;
        }
        toast.error('Info akses belum tersedia, coba lagi sebentar lagi');
        return null;
      }
      setInfo(d);
      setOpen(true);
      return d;
    } catch {
      toast.error('Gagal memuat info akses');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setInfo(null); setOpen(false);
    void supabase.functions.invoke('get-access-info', {
      body: { token, show_id: showId, replay_id: replayId, mtoken, mpassword },
    }).then(({ data }) => { if (active && data?.ok) setInfo(data as AccessInfo); });
    return () => { active = false; };
  }, [token, showId, replayId, mtoken, mpassword]);

  const copyFull = async () => {
    const d = info || (await load());
    if (!d) return;
    await copyText(d.message || d.link || '', 'Link + info replay');
  };

  const copyLinkPassword = async () => {
    const d = info || (await load());
    if (!d) return;
    const text = d.password ? `${d.link}\nSandi replay: ${d.password}` : String(d.link || '');
    await copyText(text, d.password ? 'Link + sandi replay' : 'Link akses');
  };

  return (
    <div className="min-w-0 rounded-lg border-2 border-primary/40 bg-primary/10 p-2.5 space-y-2">
      <div className="flex items-start gap-1.5 text-[10px] text-primary font-semibold leading-snug">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>SIMPAN LINK KAMU! Salin lalu tempel ke chat WhatsApp sendiri atau catatan HP — biar tidak hilang.</span>
      </div>

      <div className={compact ? 'space-y-1.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-1.5'}>
        <Button size="sm" className="w-full h-auto min-h-8 py-2 whitespace-normal text-[11px] gap-1" onClick={copyFull} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />} Salin Link + Info Replay
        </Button>
        <Button size="sm" variant="outline" className="w-full h-auto min-h-8 py-2 whitespace-normal text-[11px] gap-1" onClick={copyLinkPassword} disabled={loading}>
          <KeyRound className="w-3 h-3" /> Salin Link + Sandi
        </Button>
      </div>

      <JoinGroupButton link={info?.group_link} />

      {!open ? (
        <Button
          type="button"
          onClick={() => void load()}
          variant="link" className="w-full h-auto whitespace-normal text-[10px] gap-1"
        >
          <Eye className="w-3 h-3" /> Lihat link & sandi replay
        </Button>
      ) : info ? (
        <div className="space-y-1.5">
          {info.link && (
            <div className="rounded bg-background/70 border border-border p-1.5">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Link akses</div>
              <code className="text-[10px] font-mono break-all text-foreground">{info.link}</code>
            </div>
          )}
          {info.password ? (
            <div className="rounded bg-background/70 border border-border p-1.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Sandi replay</div>
                <code className="text-[11px] font-mono break-all text-foreground">{info.password}</code>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => copyText(info.password || '', 'Sandi replay')}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Sandi replay akan muncul di sini setelah admin mengaturnya.</p>
          )}
          {info.replay_info && (
            <div className="rounded bg-background/70 border border-border p-1.5">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Info replay</div>
              <p className="text-[10px] whitespace-pre-wrap text-foreground">{info.replay_info}</p>
            </div>
          )}
          <Textarea readOnly aria-label="Pesan link dan info replay" value={info.message || info.link || ''} className="min-h-40 text-xs" />
        </div>
      ) : null}
    </div>
  );
}
