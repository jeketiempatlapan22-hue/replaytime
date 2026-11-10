// Cek nomor WhatsApp aktif lewat Fonnte /validate (tanpa OTP).
export type WaStatus = 'registered' | 'not_registered' | 'unknown';
const cache = new Map<string, { s: WaStatus; at: number }>();

export async function checkWaNumber(phone: string): Promise<WaStatus> {
  if (!/^628\d{8,11}$/.test(phone)) return 'not_registered';
  const hit = cache.get(phone);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.s;
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) return 'unknown';
  try {
    const fd = new FormData();
    fd.append('target', phone);
    fd.append('countryCode', '62');
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch('https://api.fonnte.com/validate', { method: 'POST', headers: { Authorization: token }, body: fd, signal: ctl.signal });
    clearTimeout(to);
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === false) { console.error('fonnte validate', res.status, JSON.stringify(j)); return 'unknown'; }
    const reg = (j.registered || []).map((x: any) => String(x).replace(/\D/g, ''));
    const not = (j.not_registered || []).map((x: any) => String(x).replace(/\D/g, ''));
    const s: WaStatus = reg.includes(phone) ? 'registered' : not.includes(phone) ? 'not_registered' : 'unknown';
    if (s !== 'unknown') cache.set(phone, { s, at: Date.now() });
    return s;
  } catch (e) {
    console.error('fonnte validate error', String(e));
    return 'unknown';
  }
}

/** Returns an error code when the order must be blocked, else null. */
export async function waGuard(phone: string): Promise<string | null> {
  if (phone.startsWith('tg')) return null;
  const s = await checkWaNumber(phone);
  // Gangguan pengecekan tidak memblokir penjualan; layar tetap menampilkan tombol admin.
  return s === 'not_registered' ? 'wa_not_registered' : null;
}
