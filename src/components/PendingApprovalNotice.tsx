import { Clock, MessageCircle, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminWaLink } from '@/lib/adminWa';
import type { ApprovalState } from '@/lib/purchaseSync';

interface Props {
  state: ApprovalState;
  adminWa?: string | null;
  itemTitle: string;
  date?: string;
  orderId?: string;
  phone?: string;
}

/** Tampil saat pembayaran sudah lunas namun admin belum menyetujui (Mode Persetujuan Admin). */
export default function PendingApprovalNotice({ state, adminWa, itemTitle, date, orderId, phone }: Props) {
  const savedPhone = (() => { try { return phone || localStorage.getItem('replaytime-phone') || ''; } catch { return phone || ''; } })();
  const info = `• Item: ${itemTitle}${date ? `\n• Tanggal: ${date}` : ''}\n• Nomor WhatsApp saya: ${savedPhone || '-'}${orderId ? `\n• Order: ${orderId.slice(0, 8)}` : ''}`;
  const proofText = `Halo admin, saya sudah membayar dan ingin mengirim bukti transaksi:\n\n${info}\n\nMohon disetujui. Terima kasih 🙏`;
  const contactText = `Halo admin, saya ingin menanyakan pesanan saya:\n\n${info}`;
  const rejected = state === 'rejected';
  return (
    <div className="pt-2 space-y-2">
      <div className={`flex items-start gap-2 rounded-md border p-3 text-xs ${rejected ? 'border-destructive/40 bg-destructive/10' : 'border-primary/40 bg-primary/10'}`}>
        {rejected ? <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /> : <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
        <div className="text-foreground">
          <div className="font-semibold">{rejected ? 'Pesanan ditolak admin' : 'Pending — Menunggu Persetujuan Admin'}</div>
          <div className="text-muted-foreground">
            {rejected
              ? 'Silakan hubungi admin untuk informasi lebih lanjut.'
              : 'Pembayaran Anda sudah diterima. Tombol tonton akan muncul otomatis setelah admin menyetujui.'}
          </div>
        </div>
      </div>
      <Button disabled className="w-full gap-2" variant="secondary">
        <Clock className="w-4 h-4" /> {rejected ? 'Ditolak' : 'Pending'}
      </Button>
      <Button asChild variant="outline" className="w-full gap-2">
        <a href={adminWaLink(adminWa, proofText)} target="_blank" rel="noopener noreferrer">
          <Upload className="w-4 h-4" /> Kirim Bukti Transaksi
        </a>
      </Button>
      <Button asChild variant="outline" className="w-full gap-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground">
        <a href={adminWaLink(adminWa, contactText)} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="w-4 h-4" /> Hubungi Admin
        </a>
      </Button>
    </div>
  );
}
