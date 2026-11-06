import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, RefreshCw, Trash2 } from 'lucide-react';

interface ModRow { user_id: string; email: string; username: string }

/** Daftar moderator live chat. Pengangkatan dilakukan dari jendela info pengirim di chat. */
export default function ModeratorAdmin() {
  const [mods, setMods] = useState<ModRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_moderators');
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setMods((data || []) as ModRow[]);
  };
  useEffect(() => { load(); }, []);

  const revoke = async (m: ModRow) => {
    const { error } = await supabase.rpc('admin_set_moderator', { _user_id: m.user_id, _on: false });
    if (error) { toast.error(error.message); return; }
    toast.success(`Moderator ${m.username || m.email} dicabut`);
    setMods((prev) => prev.filter((x) => x.user_id !== m.user_id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" />Moderator Live Chat
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={load} aria-label="Muat ulang">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Moderator bisa menghapus pesan dan memblokir penonton di live chat, tanpa melihat nomor HP.
          Angkat moderator dari jendela info pengirim di chat (klik nama pengirim).
        </p>
        {mods.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-3">Belum ada moderator.</p>
        )}
        {mods.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2 border border-border rounded-lg p-2.5 bg-card/50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.username || m.email}</p>
              <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => revoke(m)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />Cabut
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
