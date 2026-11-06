import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MonitorSmartphone, RefreshCw, ShieldAlert } from 'lucide-react';

type Kind = 'membership' | 'show' | 'replay' | 'order' | 'reseller' | 'live' | 'all';

const KIND_LABEL: Record<Kind, string> = {
  membership: 'Membership',
  show: 'Token Show',
  replay: 'Token Replay',
  order: 'Pembelian QRIS',
  reseller: 'Token Reseller',
  live: 'Token Live',
  all: 'Semua Kategori',
};

/** Reset massal ikatan perangkat: token tetap berlaku, hanya perangkat terdaftar yang dilepas. */
export default function BulkDeviceResetAdmin() {
  const [kind, setKind] = useState<Kind>('membership');
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const run = async (k: Kind) => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('admin_bulk_reset_devices', { _kind: k });
      if (error) {
        toast.error(error.message);
        return;
      }
      const res = (data || {}) as Record<string, number>;
      setResult(res);
      const total = Object.values(res).reduce((a, b) => a + (Number(b) || 0), 0);
      toast.success(`Selesai. ${total} ikatan perangkat dilepas.`);
    } finally {
      setRunning(false);
      setConfirm(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4" />Reset Massal Perangkat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Melepas semua perangkat yang terikat pada token. Link/token tetap berlaku dan jatah reset manual kembali ke 0.
        </p>
        <div className="flex gap-2">
          <select
            className="flex-1 min-w-0 h-10 rounded-md border border-input bg-background px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            aria-label="Kategori reset"
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
          <Button variant="destructive" onClick={() => setConfirm(kind)} disabled={running}>
            {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Reset Sekarang'}
          </Button>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setConfirm('membership')} disabled={running}>
          Reset Semua Membership
        </Button>
        {result && (
          <div className="rounded-md border border-border bg-card/50 p-3 text-xs space-y-1">
            <p className="font-semibold">Hasil reset:</p>
            {Object.entries(result).map(([k, n]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{KIND_LABEL[k as Kind] || k}</span>
                <span className="font-mono font-medium">{n} perangkat</span>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-destructive" />Konfirmasi Reset</DialogTitle>
              <DialogDescription>
                Semua perangkat untuk kategori <span className="font-semibold">{confirm ? KIND_LABEL[confirm] : ''}</span> akan dilepas.
                Penonton harus membuka ulang link token mereka. Token tidak dicabut.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)} disabled={running}>Batal</Button>
              <Button variant="destructive" onClick={() => confirm && run(confirm)} disabled={running}>
                {running ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
                Ya, Reset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
