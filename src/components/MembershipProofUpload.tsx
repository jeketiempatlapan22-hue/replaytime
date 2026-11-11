import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { adminWaNumber } from '@/lib/adminWa';
import { compressImage } from '@/lib/imageUrl';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId?: string | null;
  showOrderId?: string | null;
  packageName?: string;
  amount?: number;
  defaultEmail?: string;
  defaultPhone?: string;
}

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

export default function MembershipProofUpload({ open, onOpenChange, orderId, showOrderId, packageName = '', amount = 0, defaultEmail = '', defaultPhone = '' }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminWa, setAdminWa] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEmail(defaultEmail); }, [defaultEmail]);
  useEffect(() => { setPhone(defaultPhone); }, [defaultPhone]);

  useEffect(() => {
    if (!open) return;
    void supabase.from('site_settings').select('key,value').in('key', ['owner_wa_number','admin_wa_phone']).then(({ data }) => {
      const m = new Map((data || []).map((r: any) => [r.key, String(r.value || '')]));
      setAdminWa(m.get('owner_wa_number') || m.get('admin_wa_phone') || '');
    });

  }, [open]);

  const onPickFile = (f: File | null) => {
    if (!f) return setFile(null);
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) { toast.error('Format harus JPG/PNG/WEBP'); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error('Maks 2 MB'); return; }
    setFile(f);
  };

  const submit = async () => {
    const e = email.trim().toLowerCase();
    const ph = normalizePhone(phone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { toast.error('Email tidak valid'); return; }
    if (!/^62\d{8,13}$/.test(ph)) { toast.error('Nomor WhatsApp tidak valid'); return; }
    if (!file) { toast.error('Pilih file bukti transaksi'); return; }
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const compressed = await compressImage(file, 0, 0.7);
      const { error: upErr } = await supabase.storage.from('membership-proofs').upload(name, compressed, { contentType: compressed.type, upsert: false });
      if (upErr) throw upErr;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      const proofId = crypto.randomUUID();
      const { error: insErr } = await supabase.from('membership_payment_proofs').insert({
        id: proofId,
        order_id: orderId || null,
        show_order_id: showOrderId || null,
        user_id: userId,
        email: e,
        phone: ph,
        package_name: packageName,
        amount,
        image_path: name,
        note: note.trim(),
      } as never);
      if (insErr) throw insErr;
      // Notifikasi Telegram admin (tidak menghalangi alur user bila gagal).
      supabase.functions.invoke('proof-submitted-notify', { body: { proof_id: proofId } }).catch(() => {});

      toast.success('Bukti terkirim. Diarahkan ke WhatsApp admin…');
      const target = adminWaNumber(adminWa);
      if (target) {
        const msg = encodeURIComponent(
          `Halo admin, saya sudah melakukan pembayaran membership.\n\n` +
          (packageName ? `Paket: ${packageName}\n` : '') +
          (amount ? `Nominal: Rp ${amount.toLocaleString('id-ID')}\n` : '') +
          (orderId ? `Order ID: ${orderId}\n` : '') +
          `Email: ${e}\nWhatsApp: ${ph}\n\nBukti transaksi sudah saya upload di website. Mohon dicek ya.`,
        );
        window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
      } else {
        toast.message('Nomor admin belum diset. Hubungi admin secara manual.');
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal upload bukti');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Kirim Bukti Transaksi</DialogTitle>
          <DialogDescription className="text-xs">
            Gunakan ini jika pembayaran sudah dilakukan tapi belum terkonfirmasi otomatis. Admin akan menghubungi Anda di WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
          </div>
          <div>
            <Label className="text-xs">Nomor WhatsApp</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxx" />
          </div>
          <div>
            <Label className="text-xs">Bukti Transfer / QRIS (JPG/PNG/WEBP, maks 2MB)</Label>
            <Input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
            {file && <p className="text-[10px] text-muted-foreground mt-1">{file.name} · {(file.size/1024).toFixed(0)} KB</p>}
          </div>
          <div>
            <Label className="text-xs">Catatan (opsional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misal: transfer via BCA jam 19.00" />
          </div>
          <Button className="w-full gap-2" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            {busy ? 'Mengirim…' : 'Kirim & Hubungi Admin'}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">Bukti tersimpan max 7 hari lalu otomatis dihapus.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
