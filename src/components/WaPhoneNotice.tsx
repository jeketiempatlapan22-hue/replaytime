import { AlertTriangle, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminBuyLink, waShowsAdminButton, type WaCheckStatus } from '@/lib/waCheck';

interface Props { status: WaCheckStatus; adminWa?: string; item?: string; phone?: string; extra?: string }

export default function WaPhoneNotice({ status, adminWa, item = '', phone = '', extra = '' }: Props) {
  return (
    <div className="space-y-2">
      <p className="flex gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] leading-snug text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Pastikan nomor WhatsApp aktif dan benar. Link token TIDAK akan dikirim jika nomor WhatsApp tidak jelas atau tidak aktif.
      </p>
      {status === 'checking' && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Mengecek nomor WhatsApp...</p>}
      {status === 'registered' && <p className="flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />WhatsApp aktif</p>}
      {status === 'invalid' && <p className="text-xs text-destructive">Format nomor salah. Contoh: 0812xxxxxxxx</p>}
      {status === 'not_registered' && <p className="text-xs font-medium text-destructive">Nomor ini tidak terdaftar di WhatsApp. Periksa lagi nomormu.</p>}
      {status === 'unknown' && <p className="text-xs text-muted-foreground">Pengecekan nomor sedang gangguan. Kamu tetap bisa lanjut, atau beli lewat admin.</p>}
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
