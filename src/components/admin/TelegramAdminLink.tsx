import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { copyToClipboard } from '@/lib/clipboard';
import { Send, Trash2, Copy } from 'lucide-react';

type Row = { chat_id: number; user_id: string; label: string; created_at: string };

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => chars[b % chars.length]).join('');
}

/** Hubungkan akun Telegram admin ke bot dengan kode sekali pakai (10 menit). */
export default function TelegramAdminLink() {
  const [rows, setRows] = useState<Row[]>([]);
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from('telegram_admins').select('*').order('created_at', { ascending: false });
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error('Silakan login ulang');
      const code = randomCode();
      const { error } = await (supabase as any).from('telegram_admin_link_codes').insert({
        code, user_id: auth.user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw error;
      setCommand(`/adminlink ${code}`);
    } catch (e: any) {
      toast({ title: 'Gagal membuat kode', description: e?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const disconnect = async (chatId: number) => {
    const { error } = await (supabase as any).from('telegram_admins').delete().eq('chat_id', chatId);
    if (error) toast({ title: 'Gagal memutus', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Telegram admin diputus' }); load(); }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2"><Send className="w-4 h-4" /> Telegram Admin</h3>
      <p className="text-xs text-muted-foreground">
        Hubungkan Telegram Anda untuk menerima notifikasi bukti transfer & QRIS lunas, menyetujui pesanan, dan membuat link token dari bot.
        Kode berlaku 10 menit dan hanya sekali pakai.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" onClick={generate} disabled={busy}>Hubungkan Telegram Admin</Button>
        <Button size="sm" variant="outline" onClick={load}>Muat ulang</Button>
      </div>
      {command && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Kirim perintah ini ke bot Telegram, lalu tekan Muat ulang:</p>
          <div className="flex items-center gap-2">
            <code className="select-all break-all font-mono text-sm flex-1">{command}</code>
            <Button size="sm" variant="ghost" onClick={async () => {
              const ok = await copyToClipboard(command);
              toast({ title: ok ? 'Disalin' : 'Salin manual teks di atas' });
            }}><Copy className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Belum ada Telegram admin terhubung.</p>}
        {rows.map((r) => (
          <div key={r.chat_id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
            <div>
              <div className="font-mono">Chat {r.chat_id}</div>
              <div className="text-xs text-muted-foreground">Terhubung {new Date(r.created_at).toLocaleString('id-ID')}</div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => disconnect(r.chat_id)}><Trash2 className="w-4 h-4 mr-1" /> Putuskan</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
