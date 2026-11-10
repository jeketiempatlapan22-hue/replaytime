import { AlertTriangle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminBuyLink, waShowsAdminButton, type WaCheckStatus } from '@/lib/waCheck';

interface Props { status: WaCheckStatus; adminWa?: string; item?: string; phone?: string; extra?: string; approvalNote?: boolean }

export default function WaPhoneNotice({ status, adminWa, item = '', phone = '', extra = '', approvalNote = false }: Props) {
  return (
    <div className="space-y-2">
      <p className="flex gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] leading-snug text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Cantumkan hanya nomor WhatsApp aktif. Link token TIDAK akan dikirim jika nomor WhatsApp tidak jelas atau tidak aktif.
      </p>
      {status === 'checking' && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengecek nomor WhatsApp...</p>}
      {status === 'registered' && <p className="flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />WhatsApp aktif</p>}
      {status === 'invalid' && <p className="text-xs text-destructive">Format nomor salah. Contoh: 0812xxxxxxxx</p>}
      {status === 'not_registered' && <p className="text-xs font-medium text-destructive">Nomor ini tidak terdaftar di WhatsApp. Periksa lagi nomormu.</p>}
      {approvalNote && <p className="rounded-md border border-primary/30 bg-primary/10 p-2 text-[11px] leading-snug text-foreground">Setelah bayar, tunggu sampai tombol berubah menjadi <b>Tonton Show</b> setelah admin menyetujui pembelianmu.</p>}
      {waShowsAdminButton(status) && adminWa && (
        <Button asChild variant="outline" className="w-full">
          <a href={adminBuyLink(adminWa, item, phone, extra)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1.5 h-4 w-4" />Hubungi Admin untuk Beli
          </a>
        </Button>
      )}
    </div>
  );
}
