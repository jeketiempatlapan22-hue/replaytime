import { useEffect, useState } from 'react';
import { History, Trash2, Copy, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';

type Delivery = {
  id: string;
  phone: string;
  replay_id: string | null;
  replay_title: string;
  order_id: string | null;
  access_token: string;
  link: string;
  source: string;
  requested_by: string;
  sent_at: string;
};

export default function TokenHistoryAdmin() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('token_deliveries')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(200);
    setItems((data ?? []) as Delivery[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i =>
    !q || i.phone.includes(q) || i.replay_title.toLowerCase().includes(q.toLowerCase())
  );

  const remove = async (id: string) => {
    if (!confirm('Hapus catatan ini?')) return;
    await supabase.from('token_deliveries').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const copy = async (text: string) => {
    const copied = await copyToClipboard(text);
    toast({ title: copied ? 'Disalin' : 'Gagal menyalin', variant: copied ? 'default' : 'destructive' });
  };

  const copyAllPhones = () => {
    const list = [...new Set(filtered.map(i => i.phone).filter(Boolean))].join('\n');
    if (!list) return toast({ title: 'Tidak ada nomor', variant: 'destructive' });
    void copy(list);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <History className="w-4 h-4" /> Riwayat Pengiriman Token ({filtered.length})
        </CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={copyAllPhones} title="Salin semua nomor pada hasil filter">
            <Copy className="w-3.5 h-3.5 mr-1" />Salin Nomor
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nomor / judul replay…"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Memuat…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Belum ada riwayat.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <div key={item.id} className="border border-border rounded-lg p-3 bg-card/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">+{item.phone}</span>
                      <button title="Salin nomor" onClick={() => copy(item.phone)} className="text-muted-foreground hover:text-primary">
                        <Copy className="w-3 h-3" />
                      </button>
                      <Badge variant={item.source === 'pakasir' ? 'default' : 'secondary'} className="text-[10px]">
                        {item.source === 'pakasir' ? '💳 Pakasir' : '🤖 Bot'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.replay_title || '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(item.sent_at).toLocaleString('id-ID')}
                      {item.requested_by && item.requested_by !== item.phone && ` • via ${item.requested_by}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {item.link && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copy(item.link)} title="Salin link">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Buka link">
                          <a href={item.link} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
