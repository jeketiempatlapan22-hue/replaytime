import { enrichAccessMessage } from './group-link.ts';
import { rewriteReplay } from './replay-origin.ts';
// Helper Telegram bersama: kirim pesan lewat connector gateway Lovable.
// Dipakai oleh telegram-webhook, poll-pending-orders, dan pakasir-webhook.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claimWaSend, markWaSent } from './wa-guard.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];

async function gatewayCall(method: string, payload: Record<string, unknown>) {
  const headers = gatewayHeaders();
  if (!headers) return { ok: false, data: { error: 'telegram_not_configured' } };
  try {
    const res = await fetch(`${GATEWAY_URL}/${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as any)?.ok !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

/** Kirim pesan dengan tombol inline (opsional). */
export async function sendTelegramRich(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  extra: Record<string, unknown> = {},
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...extra,
  };
  if (keyboard?.length) payload.reply_markup = { inline_keyboard: keyboard };
  const first = await gatewayCall('sendMessage', payload);
  if (first.ok) return first;
  const { parse_mode: _pm, ...plain } = payload as any;
  return await gatewayCall('sendMessage', plain);
}

/** Kirim gambar (mis. QRIS) dengan caption. */
export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  caption: string,
  keyboard?: InlineKeyboard,
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId, photo: photoUrl, caption, parse_mode: 'Markdown',
  };
  if (keyboard?.length) payload.reply_markup = { inline_keyboard: keyboard };
  const first = await gatewayCall('sendPhoto', payload);
  if (first.ok) return first;
  const { parse_mode: _pm, ...plain } = payload as any;
  return await gatewayCall('sendPhoto', plain);
}

export async function answerCallbackQuery(id: string, text = '') {
  return await gatewayCall('answerCallbackQuery', { callback_query_id: id, text });
}

/** Hapus pesan (dipakai untuk menghapus QRIS yang kedaluwarsa). */
export async function deleteTelegramMessage(chatId: number | string, messageId: number) {
  return await gatewayCall('deleteMessage', { chat_id: chatId, message_id: messageId });
}



/** Daftarkan menu perintah bot agar rapi di UI Telegram. */
export async function setBotCommands(commands: { command: string; description: string }[]) {
  return await gatewayCall('setMyCommands', { commands });
}


function gatewayHeaders() {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const tgKey = Deno.env.get('TELEGRAM_API_KEY');
  if (!lovableKey || !tgKey) return null;
  return {
    'Authorization': `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': tgKey,
    'Content-Type': 'application/json',
  };
}

export function telegramConfigured(): boolean {
  return !!(Deno.env.get('LOVABLE_API_KEY') && Deno.env.get('TELEGRAM_API_KEY'));
}

/** Kirim pesan Telegram ke chat_id. Markdown WA (*bold*) kompatibel dengan parse_mode Markdown. */
export async function sendTelegram(chatId: number | string, text: string): Promise<{ ok: boolean; data: unknown }> {
  text = rewriteReplay(text);
  const headers = gatewayHeaders();
  if (!headers) return { ok: false, data: { error: 'telegram_not_configured' } };
  try {
    const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    // Telegram menaruh error di dalam body 200/4xx dengan ok:false
    const ok = res.ok && (data as any)?.ok !== false;
    // Fallback tanpa parse_mode kalau Markdown gagal (karakter aneh)
    if (!ok && (data as any)?.description && /parse|markdown/i.test(String((data as any).description))) {
      const res2 = await fetch(`${GATEWAY_URL}/sendMessage`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(12000),
      });
      const data2 = await res2.json().catch(() => ({}));
      return { ok: res2.ok && (data2 as any)?.ok !== false, data: data2 };
    }
    return { ok, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

/**
 * Kirim pesan Telegram ke user berdasarkan nomor WA (mencari telegram_links).
 * Mengembalikan true jika terkirim. Tidak pernah melempar error.
 */
export async function sendTelegramByPhone(
  admin: ReturnType<typeof createClient>,
  phone: string,
  message: string,
): Promise<boolean> {
  try {
    if (!telegramConfigured()) return false;
    message = await enrichAccessMessage(admin, message);
    const raw = String(phone || '').trim();
    // Pembeli Telegram murni memakai identitas semu `tg<chat_id>`:
    // chat_id-nya sudah ada di string, jangan dinormalisasi jadi nomor telepon.
    const pseudo = /^tg(\d+)$/i.exec(raw);
    let chatId: number | string | null = pseudo ? Number(pseudo[1]) : null;
    if (!chatId) {
      const p = normalizePhone(raw);
      if (!p) return false;
      const { data } = await admin
        .from('telegram_links')
        .select('chat_id')
        .eq('phone', p)
        .not('chat_id', 'is', null)
        .maybeSingle();
      if (!data?.chat_id) return false;
      chatId = data.chat_id as number;
    }
    const data = { chat_id: chatId } as { chat_id: number | string };

    // Anti-dobel: webhook Pakasir, poller, dan cek status bisa jalan bersamaan.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    const hash = Array.from(new Uint8Array(digest)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `tg:${data.chat_id}:${hash}`;
    if (!(await claimWaSend(key))) return true;
    const sent = await sendTelegram(data.chat_id, message);
    if (sent.ok) await markWaSent(key);
    else console.error('telegram send failed:', JSON.stringify(sent.data));
    return sent.ok;
  } catch (e) {
    console.error('sendTelegramByPhone error:', String(e));
    return false;
  }
}

/** Turunan secret webhook yang sama dengan pola di pengetahuan Telegram. */
export async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Kirim gambar QRIS sebagai file (multipart) — lebih tajam & pasti terbaca
 * dibanding mengandalkan Telegram mengunduh URL gambar pihak ketiga.
 */
export async function sendTelegramPhotoBytes(
  chatId: number | string,
  bytes: Uint8Array,
  caption: string,
  keyboard?: InlineKeyboard,
  filename = 'qris.png',
) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const tgKey = Deno.env.get('TELEGRAM_API_KEY');
  if (!lovableKey || !tgKey) return { ok: false, data: { error: 'telegram_not_configured' } };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');
    if (keyboard?.length) form.append('reply_markup', JSON.stringify({ inline_keyboard: keyboard }));
    form.append('photo', new Blob([bytes], { type: 'image/png' }), filename);
    const res = await fetch(`${GATEWAY_URL}/sendPhoto`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lovableKey}`, 'X-Connection-Api-Key': tgKey },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && (data as any)?.ok !== false, data };
  } catch (e) {
    return { ok: false, data: { error: String(e) } };
  }
}
