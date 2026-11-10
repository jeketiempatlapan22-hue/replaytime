import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Copy, RotateCcw, Trash2, Search, RefreshCw, Lock, Unlock, Link2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import AccessInfoCard from '@/components/AccessInfoCard';

type Kind = 'show' | 'membership';
type Status = 'active' | 'expired';

type ShowRow = {
  id: string; token: string; label: string; kind: string;
  show_id: string | null; show_title: string; show_date: string | null;
  max_devices: number; devices_used: number;
  revoked: boolean; single_use: boolean;
  created_at: string; expires_at: string | null; status: string;
};
type MbRow = {
  id: string; token: string; password: string; label: string; phone: string;
  package_id: string | null; package_name: string;
  starts_at: string | null; expires_at: string | null; duration_days: number | null;
  max_devices: number; devices_used: number;
  includes_replays: boolean; revoked: boolean;
  created_by: string; created_at: string; status: string;
};

const SITE = 'https://realtime48show.my.id';

async function copy(text: string, label: string) {
  const copied = await copyToClipboard(text);
  toast({ title: copied ? `${label} disalin` : 'Gagal menyalin', variant: copied ? 'default' : 'destructive' });
}

function TokenTable({ kind, status }: { kind: Kind; status: Status }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const rpc = kind === 'show' ? 'admin_list_show_tokens' : 'admin_list_membership_tokens';
    const { data, error } = await supabase.rpc(rpc, { _q: q, _status: status });
    setLoading(false);
    if (error) return toast({ title: 'Gagal memuat', description: error.message, variant: 'destructive' });
    if (kind === 'show' && data?.length) {
      const { data: owners, error: ownerError } = await supabase.rpc('admin_token_factory_owners', { _ids: data.map(r => r.id) });
      if (ownerError) toast({ title: 'Info pembeli gagal dimuat', description: ownerError.message, variant: 'destructive' });
      const ownerRows = Array.isArray(owners) ? owners as unknown as { id: string; phone: string; email: string; username: string; created_by: string }[] : [];
      setRows(data.map(r => ({ ...r, ...ownerRows.find(o => o.id === r.id) })));
    } else setRows(data || []);
    setSelected(new Set());
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, status]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r: any) =>
      (r.token||'').toLowerCase().includes(s) ||
      (r.label||'').toLowerCase().includes(s) ||
      (r.phone||'').toLowerCase().includes(s) ||
      (r.show_title||'').toLowerCase().includes(s) ||
      (r.package_name||'').toLowerCase().includes(s)
    );
  }, [rows, q]);

  const linkFor = (r: any) => kind === 'show'
    ? `${SITE}/live?${r.show_id ? `show=${encodeURIComponent(r.show_id)}&` : ''}t=${encodeURIComponent(r.token)}`
    : `${SITE}/live?mtoken=${encodeURIComponent(r.token)}`;

  const doReset = async (id: string) => {
    const { error } = await supabase.rpc('admin_reset_token_devices', { _kind: kind, _token_id: id });
    if (error) return toast({ title: 'Gagal reset', description: error.message, variant: 'destructive' });
    toast({ title: 'Device direset', description: 'Kuota kembali ke 0.' });
    load();
  };
  const doBlock = async (id: string) => {
    const { error } = await supabase.rpc('admin_block_token', { _kind: kind, _token_id: id });
    if (error) return toast({ title: 'Gagal memblokir', description: error.message, variant: 'destructive' });
    toast({ title: 'Token diblokir' });
    load();
  };
  const doUnblock = async (id: string) => {
    const { error } = await supabase.rpc('admin_unblock_token', { _kind: kind, _token_id: id });
    if (error) return toast({ title: 'Gagal membuka blokir', description: error.message, variant: 'destructive' });
    toast({ title: 'Blokir dibuka' });
    load();
  };
  const doDelete = async (id: string) => {
    const { error } = await supabase.rpc('admin_delete_token', { _kind: kind, _token_id: id });
    if (error) return toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    toast({ title: 'Token dihapus' });
    load();
  };

  const bulkDeleteSelected = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { data, error } = await supabase.rpc('admin_bulk_delete_expired_tokens', { _kind: kind, _ids: ids });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    toast({ title: `${data || 0} token dihapus` });
    load();
  };
  const bulkDeleteAllExpired = async () => {
    const { data, error } = await supabase.rpc('admin_bulk_delete_expired_tokens', { _kind: kind, _ids: null });
    if (error) return toast({ title: 'Gagal', description: error.message, variant: 'destructive' });
    toast({ title: `${data || 0} token kadaluarsa dihapus` });
    load();
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.map((r: any) => r.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected(prev => { const n = new Set(prev); if (checked) n.add(id); else n.delete(id); return n; });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari token / label / phone / show / paket" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key==='Enter' && load()} className="pl-8" />
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading?'animate-spin':''}`} />Muat</Button>
      </div>

      {kind === 'membership' && (
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
            const list = [...new Set(filtered.map((r: any) => r.phone).filter(Boolean))];
            if (!list.length) return toast({ title: 'Tidak ada nomor', variant: 'destructive' });
            copy(list.join('\n'), `${list.length} nomor`);
          }}>
            <Copy className="w-3.5 h-3.5 mr-1" />Salin Semua Nomor
          </Button>
        </div>
      )}

      {status === 'expired' && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Checkbox checked={selected.size>0 && selected.size===filtered.length} onCheckedChange={(c) => toggleAll(!!c)} />
          <span className="text-xs">Pilih semua ({selected.size}/{filtered.length})</span>
          <div className="ml-auto flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild><Button size="sm" variant="destructive" disabled={!selected.size}><Trash2 className="w-3.5 h-3.5 mr-1" />Hapus terpilih</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Hapus {selected.size} token?</AlertDialogTitle><AlertDialogDescription>Aksi ini permanen.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={bulkDeleteSelected}>Hapus</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button size="sm" variant="destructive"><Trash2 className="w-3.5 h-3.5 mr-1" />Hapus semua kadaluarsa</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Hapus SEMUA token kadaluarsa?</AlertDialogTitle><AlertDialogDescription>Semua token {kind==='show'?'show':'membership'} yang expired atau revoked akan dihapus.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={bulkDeleteAllExpired}>Hapus semua</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((r: any) => (
          <div key={r.id} className="border border-border rounded-lg p-3 bg-card/50">
            <div className="flex items-start gap-2">
              {status === 'expired' && (
                <Checkbox className="mt-1" checked={selected.has(r.id)} onCheckedChange={(c) => toggleOne(r.id, !!c)} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.status==='active'?'default':r.status==='expired'?'secondary':'destructive'}>{r.status}</Badge>
                  {kind==='show' ? (
                    <span className="text-sm font-medium truncate">{(r as ShowRow).show_title || '(tanpa show)'}</span>
                  ) : (
                    <span className="text-sm font-medium truncate">{(r as MbRow).package_name || '(tanpa paket)'}</span>
                  )}
                  {r.label && <Badge variant="outline" className="truncate max-w-[160px]">{r.label}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div className="font-mono text-foreground/80 break-all">🔑 {r.token}</div>
                  {kind==='membership' && (r as MbRow).password && <div className="font-mono">🔒 {(r as MbRow).password}</div>}
                  {kind==='membership' && (r as MbRow).phone && (
                    <div className="flex items-center gap-1.5">📱 {(r as MbRow).phone}
                      <button title="Salin nomor" onClick={() => copy((r as MbRow).phone, 'Nomor')} className="hover:text-primary"><Copy className="w-3 h-3" /></button>
                    </div>
                  )}
                  <div>📲 Device: {r.devices_used}/{r.max_devices}</div>
                  {kind === 'show' && r.phone && <div className="break-all">📱 {r.phone}</div>}
                  {kind === 'show' && r.email && <div className="break-all">{r.email}</div>}
                  {kind === 'show' && r.username && <div className="break-all">Akun: {r.username}</div>}
                  {r.created_by && <div className="break-all">Dibuat oleh: {r.created_by}</div>}
                  <div>🕒 Dibuat: {new Date(r.created_at).toLocaleString('id-ID')}</div>
                  <div>⏳ Berakhir: {r.expires_at ? new Date(r.expires_at).toLocaleString('id-ID') : '—'}</div>
                </div>
                {status === 'active' && (
                  <div className="mt-2">
                    <AccessInfoCard token={kind === 'show' ? r.token : undefined} showId={kind === 'show' ? r.show_id || undefined : undefined} mtoken={kind === 'membership' ? r.token : undefined} mpassword={kind === 'membership' ? r.password : undefined} compact />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 mt-2">
                  <Button size="sm" variant="outline" onClick={() => copy(r.token, 'Token')}><Copy className="w-3.5 h-3.5 mr-1" />Token</Button>
                  <Button size="sm" variant="outline" onClick={() => copy(linkFor(r), 'Link')}><Link2 className="w-3.5 h-3.5 mr-1" />Link</Button>
                  <Button size="sm" variant="outline" onClick={() => doReset(r.id)}><RotateCcw className="w-3.5 h-3.5 mr-1" />Reset</Button>
                  {r.revoked
                    ? <Button size="sm" variant="outline" onClick={() => doUnblock(r.id)}><Unlock className="w-3.5 h-3.5 mr-1" />Buka</Button>
                    : <Button size="sm" variant="outline" onClick={() => doBlock(r.id)}><Lock className="w-3.5 h-3.5 mr-1" />Blokir</Button>}
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="destructive"><Trash2 className="w-3.5 h-3.5 mr-1" />Hapus</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Hapus token ini?</AlertDialogTitle><AlertDialogDescription>Aksi ini permanen.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => doDelete(r.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && !loading && <div className="text-center text-sm text-muted-foreground py-8">Tidak ada token.</div>}
      </div>
    </div>
  );
}

export default function TokenFactoryAdmin() {
  const [kind, setKind] = useState<Kind>('show');
  const [status, setStatus] = useState<Status>('active');
  const [history, setHistory] = useState<{ id: string; token: string; kind: string; title: string; label: string; phone: string; created_at: string; expires_at: string | null; original_link: string }[]>([]);
  useEffect(() => {
    supabase.from('token_factory_history').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ title: 'Riwayat gagal dimuat', description: error.message, variant: 'destructive' });
        else setHistory(data || []);
      });
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-sans text-base sm:text-lg">Token Factory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="show">Token Show</TabsTrigger>
            <TabsTrigger value="membership">Token Membership</TabsTrigger>
          </TabsList>
          <TabsContent value="show" className="mt-3">
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="active">Aktif</TabsTrigger>
                <TabsTrigger value="expired">Kadaluarsa / Dicabut</TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-3"><TokenTable kind="show" status="active" /></TabsContent>
              <TabsContent value="expired" className="mt-3"><TokenTable kind="show" status="expired" /></TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="membership" className="mt-3">
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="active">Aktif</TabsTrigger>
                <TabsTrigger value="expired">Kadaluarsa / Dicabut</TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-3"><TokenTable kind="membership" status="active" /></TabsContent>
              <TabsContent value="expired" className="mt-3"><TokenTable kind="membership" status="expired" /></TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
        {history.length > 0 && <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Riwayat token dipulihkan ({history.length})</h3>
          {history.map(r => <div key={r.id} className="rounded-lg border border-border p-3 space-y-1 text-xs">
            <div className="font-medium text-sm break-words">{r.title}</div>
            <Badge variant="secondary">Riwayat · {r.kind}</Badge>
            <div className="font-mono break-all">{r.token}</div>
            <div className="break-all">Dibuat oleh: {r.label}</div>
            <div className="break-all">Pembeli: {r.phone || 'Tidak tercatat'}</div>
            <div>Dibuat: {new Date(r.created_at).toLocaleString('id-ID')}</div>
            <div>Berakhir: {r.expires_at ? new Date(r.expires_at).toLocaleString('id-ID') : 'Tidak tercatat'}</div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => copy(r.token, 'Token')}><Copy className="w-3.5 h-3.5 mr-1" />Token</Button>
              {r.original_link && <Button size="sm" variant="outline" onClick={() => copy(r.original_link, 'Link')}><Link2 className="w-3.5 h-3.5 mr-1" />Link</Button>}
            </div>
          </div>)}
        </section>}
      </CardContent>
    </Card>
  );
}
