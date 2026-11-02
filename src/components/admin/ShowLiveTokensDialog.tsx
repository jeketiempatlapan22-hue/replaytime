import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Copy, Ban, RotateCcw, Smartphone, ShieldOff, ShieldCheck, Search, X } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import AccessInfoCard from '@/components/AccessInfoCard';

type Token = {
  id: string;
  token: string;
  label: string;
  kind: string;
  max_devices: number;
  revoked: boolean;
  created_at: string;
};
type Device = { id: string; token_id: string; browser_id: string; created_at: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showId: string;
  showTitle: string;
}

export default function ShowLiveTokensDialog({ open, onOpenChange, showId, showTitle }: Props) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [devices, setDevices] = useState<Record<string, Device[]>>({});
  const [blocked, setBlocked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [maxDevices, setMaxDevices] = useState(1);
  const [kind, setKind] = useState<'personal' | 'public'>('personal');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: list } = await supabase
      .from('active_show_tokens')
      .select('id,token,label,kind,max_devices,revoked,created_at')
      .eq('show_id', showId)
      .order('created_at', { ascending: false });
    const ids = (list ?? []).map((t: any) => t.id);
    const grouped: Record<string, Device[]> = {};
    if (ids.length) {
      const { data: devs } = await supabase
        .from('active_show_token_devices')
        .select('id,token_id,browser_id,created_at')
        .in('token_id', ids)
        .order('created_at', { ascending: false });
      (devs ?? []).forEach((d: any) => {
        (grouped[d.token_id] ||= []).push(d);
      });
    }
    setTokens((list ?? []) as Token[]);
    setDevices(grouped);
    // Load block status for all browser_ids in devices
    const allBids = Array.from(new Set(Object.values(grouped).flat().map(d => d.browser_id)));
    const blkMap: Record<string, boolean> = {};
    if (allBids.length) {
      const { data: blks } = await supabase
        .from('blocked_browsers')
        .select('browser_id,unblocked')
        .in('browser_id', allBids);
      (blks ?? []).forEach((b: any) => { blkMap[b.browser_id] = !b.unblocked; });
    }
    setBlocked(blkMap);
    setLoading(false);
  };

  useEffect(() => { if (open && showId) load(); }, [open, showId]);

  const create = async () => {
    const tokenStr = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
    const md = kind === 'public' ? Math.max(1, maxDevices) : 1;
    const { error } = await supabase.from('active_show_tokens').insert({
      show_id: showId, token: tokenStr, label: label.trim(), kind, max_devices: md,
    });
    if (error) { toast({ title: 'Gagal', description: error.message, variant: 'destructive' }); return; }
    setLabel(''); setMaxDevices(kind === 'public' ? 50 : 1);
    toast({ title: 'Token dibuat' });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Hapus token ini? Akses pengguna akan dicabut.')) return;
    await supabase.from('active_show_token_devices').delete().eq('token_id', id);
    await supabase.from('active_show_tokens').delete().eq('id', id);
    load();
  };

  const toggleRevoke = async (t: Token) => {
    await supabase.from('active_show_tokens').update({ revoked: !t.revoked }).eq('id', t.id);
    toast({ title: t.revoked ? 'Token diaktifkan kembali' : 'Token dicabut' });
    load();
  };

  const resetDevices = async (id: string) => {
    if (!confirm('Reset semua perangkat token ini? User harus buka link lagi.')) return;
    await supabase.from('active_show_token_devices').delete().eq('token_id', id);
    toast({ title: 'Perangkat direset' });
    load();
  };

  const removeDevice = async (deviceId: string) => {
    await supabase.from('active_show_token_devices').delete().eq('id', deviceId);
    load();
  };

  const blockBrowser = async (browser_id: string) => {
    if (!confirm('Blokir perangkat ini? User tidak bisa akses live (semua show) sampai dibuka admin.')) return;
    // upsert: jika sudah ada (unblocked), set unblocked=false; jika belum, insert
    const { data: existing } = await supabase.from('blocked_browsers').select('id').eq('browser_id', browser_id).maybeSingle();
    if (existing) {
      await supabase.from('blocked_browsers').update({ unblocked: false, reason: 'admin_block' }).eq('id', existing.id);
    } else {
      await supabase.from('blocked_browsers').insert({ browser_id, reason: 'admin_block', unblocked: false });
    }
    toast({ title: 'Perangkat diblokir' });
    load();
  };

  const unblockBrowser = async (browser_id: string) => {
    await supabase.from('blocked_browsers').update({ unblocked: true }).eq('browser_id', browser_id);
    toast({ title: 'Blokir dibuka' });
    load();
  };

  const copyLink = async (token: string) => {
    const url = `https://realtime48show.my.id/live?show=${showId}&t=${token}`;
    const copied = await copyToClipboard(url);
    toast({ title: copied ? 'Link tersalin' : 'Tidak bisa menyalin otomatis', description: copied ? undefined : 'Buka info akses di bawah untuk menyalin manual.' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Token Akses Live</DialogTitle>
          <DialogDescription className="truncate">{showTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">Total token show ini:</span>
          <Badge className="text-[11px] font-semibold">{tokens.length}</Badge>
          <Badge variant="secondary" className="text-[10px]">Aktif {tokens.filter(t => !t.revoked).length}</Badge>
          <Badge variant="destructive" className="text-[10px]">Dicabut {tokens.filter(t => t.revoked).length}</Badge>
          <Badge variant="outline" className="text-[10px]">Device {Object.values(devices).reduce((n, d) => n + d.length, 0)}</Badge>
        </div>


        <div className="space-y-3 border border-border rounded-lg p-3 bg-secondary/30">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={kind === 'personal' ? 'default' : 'outline'} onClick={() => { setKind('personal'); setMaxDevices(1); }}>
              Satuan (1 device)
            </Button>
            <Button size="sm" variant={kind === 'public' ? 'default' : 'outline'} onClick={() => { setKind('public'); setMaxDevices(50); }}>
              Publik (multi)
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Label (opsional)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Mis. nama pembeli / kode promo" />
            </div>
            <div>
              <Label className="text-xs">Max device</Label>
              <Input type="number" min={1} value={maxDevices} disabled={kind === 'personal'}
                onChange={e => setMaxDevices(parseInt(e.target.value) || 1)} />
            </div>
          </div>
          <Button onClick={create} className="w-full"><Plus className="w-4 h-4 mr-1" />Buat Token</Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari token, label, atau ID perangkat…"
            className="pl-9 pr-9 h-9 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          {(() => {
            const q = search.trim().toLowerCase();
            const filtered = q
              ? tokens.filter(t => {
                  if (t.token.toLowerCase().includes(q)) return true;
                  if ((t.label || '').toLowerCase().includes(q)) return true;
                  const devs = devices[t.id] || [];
                  return devs.some(d => d.browser_id.toLowerCase().includes(q));
                })
              : tokens;
            if (loading) return <p className="text-sm text-muted-foreground">Memuat…</p>;
            if (tokens.length === 0) return <p className="text-sm text-muted-foreground italic">Belum ada token.</p>;
            if (filtered.length === 0) return <p className="text-sm text-muted-foreground italic">Tidak ada token cocok dengan pencarian.</p>;
            return filtered.map(t => {
            const devs = devices[t.id] || [];
            const isOpen = expanded === t.id;
            return (
              <div key={t.id} className="border border-border rounded-lg p-2 bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {t.label || '(tanpa label)'}
                      <span className="ml-1 text-[10px] text-muted-foreground uppercase">· {t.kind}</span>
                    </p>
                    <code className="block text-[10px] text-muted-foreground break-all select-text">{t.token}</code>
                    <p className="text-[10px] text-muted-foreground">Dibuat: {new Date(t.created_at).toLocaleString('id-ID')}</p>
                  </div>
                  <Badge variant={t.revoked ? 'destructive' : 'secondary'} className="text-[10px]">
                    {devs.length}/{t.max_devices}{t.revoked ? ' · DICABUT' : ''}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => copyLink(t.token)}>
                    <Copy className="w-3 h-3 mr-1" />Link
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setExpanded(isOpen ? null : t.id)}>
                    <Smartphone className="w-3 h-3 mr-1" />{isOpen ? 'Tutup' : `Device (${devs.length})`}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => resetDevices(t.id)}>
                    <RotateCcw className="w-3 h-3 mr-1" />Reset
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toggleRevoke(t)}>
                    <Ban className="w-3 h-3 mr-1" />{t.revoked ? 'Aktifkan' : 'Cabut'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive" onClick={() => remove(t.id)}>
                    <Trash2 className="w-3 h-3 mr-1" />Hapus
                  </Button>
                </div>
                {!t.revoked && <AccessInfoCard token={t.token} showId={showId} compact />}
                {isOpen && (
                  <div className="border-t border-border pt-2 space-y-1">
                    {devs.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">Belum ada perangkat terhubung.</p>
                    ) : devs.map(d => {
                      const isBlk = !!blocked[d.browser_id];
                      return (
                      <div key={d.id} className={`flex items-center gap-2 text-[11px] rounded p-1.5 ${isBlk ? 'bg-destructive/10 border border-destructive/30' : 'bg-secondary/30'}`}>
                        <Smartphone className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <code className="break-all text-foreground">{d.browser_id.slice(0, 20)}…{isBlk && <Badge variant="destructive" className="ml-1 text-[9px]">DIBLOKIR</Badge>}</code>
                          <p className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString('id-ID')}</p>
                        </div>
                        {isBlk ? (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-green-600" title="Buka blokir" onClick={() => unblockBrowser(d.browser_id)}>
                            <ShieldCheck className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-orange-600" title="Blokir perangkat" onClick={() => blockBrowser(d.browser_id)}>
                            <ShieldOff className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" title="Reset device" onClick={() => removeDevice(d.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
