import { supabase } from '@/integrations/supabase/client';

export type WaCheckStatus = 'idle' | 'checking' | 'registered' | 'not_registered' | 'unknown' | 'invalid';

/** Hanya nomor yang jelas tidak terdaftar yang diblokir; gangguan tetap boleh lanjut. */
export const waBlocksPurchase = (s: WaCheckStatus) => s === 'not_registered' || s === 'invalid';
export const waShowsAdminButton = (s: WaCheckStatus) => s === 'not_registered';

export async function checkWaNumber(phone: string): Promise<WaCheckStatus> {
  try {
    const { data, error } = await supabase.functions.invoke('check-wa-number', { body: { phone } });
    if (error) return 'unknown';
    const s = (data as any)?.status;
    return s === 'registered' || s === 'not_registered' || s === 'invalid' ? s : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function adminBuyLink(adminWa: string, item: string, phone: string, extra = '') {
  const num = String(adminWa || '').replace(/\D/g, '');
  const text = `Halo Admin, saya ingin membeli:\n• ${item}${extra ? `\n${extra}` : ''}\n• Nomor saya: ${phone || '-'}\n\nMohon dibantu karena nomor WhatsApp saya tidak bisa dicek otomatis. Terima kasih 🙏`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
