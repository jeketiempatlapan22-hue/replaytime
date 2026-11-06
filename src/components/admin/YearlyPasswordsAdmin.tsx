import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, Save, Trash2, Shuffle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Row = { id: string; label: string; password: string; starts_at: string; expires_at: string; paused: boolean };

const gen = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join('');
};
const fmt = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function YearlyPasswordsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState('');
  const [pw, setPw] = useState('');

  const load = async () => {
    const { data } = await (supabase as any).from('yearly_passwords').select('*').order('created_at', { ascending: false });
    setRows((data as Row[]) || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const p = pw.trim();
    if (p.length < 4) { toast({ title: 'Sandi minimal 4 karakter', variant: 'destructive' }); return; }
    const { error } = await (supabase as any).from('yearly_passwords').insert({ label: label.trim(), password: p });
    if (error) { toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' }); return; }
    setLabel(''); setPw(''); toast({ title: 'Sandi tahunan dibuat (berlaku 1 tahun)' }); load();
  };
  const toggle = async (id: string, paused: boolean) => {
    await (supabase as any).from('yearly_passwords').update({ paused }).eq('id', id); load();
  };
  const del = async (id: string) => {
    if (!confirm('Hapus sandi tahunan ini?')) return;
    await (supabase as any).from('yearly_passwords').delete().eq('id', id); load();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" />Sandi Tahunan</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Membuka semua live & replay selama 1 tahun sejak dibuat. Hanya admin yang bisa membuat.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div><Label>Catatan</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nama pemilik..." /></div>
          <div><Label>Sandi</Label>
            <div className="flex gap-1">
              <Input value={pw} onChange={e => setPw(e.target.value)} placeholder="Sandi tahunan..." />
              <Button type="button" size="icon" variant="outline" onClick={() => setPw(gen())}><Shuffle className="w-4 h-4" /></Button>
            </div>
          </div>
          <Button onClick={save} size="sm" className="h-10"><Save className="w-4 h-4 mr-1" />Simpan</Button>
        </div>
        {rows.map(r => {
          const expired = new Date(r.expires_at).getTime() < Date.now();
          return (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-secondary/40">
              <div className="min-w-0">
                <Badge variant={r.paused || expired ? 'outline' : 'secondary'} className="text-xs select-all">{r.password}</Badge>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{r.label || '—'} · {fmt(r.starts_at)} – {fmt(r.expires_at)}{expired ? ' · Hangus' : ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={!r.paused} onCheckedChange={v => toggle(r.id, !v)} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
