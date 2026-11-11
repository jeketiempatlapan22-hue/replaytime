// Bot Telegram khusus admin: verifikasi admin, notifikasi bukti transfer & QRIS lunas.
// Nomor HP pembeli hanya dikirim ke chat yang terdaftar di telegram_admins dan masih ber-role admin.
import { sendTelegramRich, sendTelegramPhoto, telegramConfigured, type InlineKeyboard } from './telegram.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Kembalikan user_id admin bila chat ini terdaftar DAN akunnya masih admin; selain itu null. */
export async function isTelegramAdmin(admin: Admin, chatId: number): Promise<string | null> {
  if (!chatId) return null;
  const { data } = await admin.from('telegram_admins').select('user_id').eq('chat_id', chatId).maybeSingle();
  if (!data?.user_id) return null;
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', data.user_id).eq('role', 'admin').maybeSingle();
  return role ? String(data.user_id) : null;
}

async function adminChats(admin: Admin): Promise<number[]> {
  const { data } = await admin.from('telegram_admins').select('chat_id,user_id');
  const rows = (data ?? []) as { chat_id: number; user_id: string }[];
  if (!rows.length) return [];
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'admin').in('user_id', rows.map((r) => r.user_id));
  const ok = new Set((roles ?? []).map((r: any) => String(r.user_id)));
  return rows.filter((r) => ok.has(String(r.user_id))).map((r) => Number(r.chat_id));
}

export async function notifyTelegramAdmins(admin: Admin, text: string, keyboard?: InlineKeyboard, photoUrl?: string) {
  if (!telegramConfigured()) return 0;
  const chats = await adminChats(admin);
  let sent = 0;
  for (const chat of chats) {
    let r = photoUrl ? await sendTelegramPhoto(chat, photoUrl, text.slice(0, 1000), keyboard) : null;
    if (!r?.ok) r = await sendTelegramRich(chat, text, keyboard);
    if (r.ok) sent++;
  }
  return sent;
}

export const wib = (iso?: string | null) => new Date(iso || Date.now()).toLocaleString('id-ID', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
}) + ' WIB';
const rp = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const clean = (s: unknown) => String(s ?? '').replace(/[*_`\[\]]/g, '');

export const proofKeyboard = (id: string): InlineKeyboard => [
  [{ text: '✅ Setujui', callback_data: `pa:${id}` }, { text: '❌ Tolak', callback_data: `pr:${id}` }],
  [{ text: '🔄 Reset', callback_data: `px:${id}` }, { text: '📋 Salin Info Akses', callback_data: `pm:${id}` }],
];

export function proofText(p: any, title = '🧾 *BUKTI TRANSFER BARU*') {
  return [title, '━━━━━━━━━━━━━━━━━━',
    `📦 ${clean(p.package_name) || '-'}`, `💰 ${rp(p.amount)}`,
    `📱 WA: \`${clean(p.phone) || '-'}\``, p.email ? `✉️ ${clean(p.email)}` : '',
    p.note ? `📝 ${clean(p.note).slice(0, 200)}` : '', `🕒 ${wib(p.created_at)}`, `🆔 \`${p.id}\``,
  ].filter(Boolean).join('\n');
}

/** Kirim notifikasi bukti transfer sekali saja (klaim atomik pada telegram_notified_at). */
export async function notifyProof(admin: Admin, proofId: string): Promise<boolean> {
  const { data: p } = await admin.from('membership_payment_proofs')
    .update({ telegram_notified_at: new Date().toISOString() })
    .eq('id', proofId).is('telegram_notified_at', null).select('*').maybeSingle();
  if (!p) return false;
  // Pesanan yang lunas otomatis juga ditandai, agar tidak terkirim dua kali sebagai "QRIS LUNAS".
  if (p.show_order_id) await admin.from('orders').update({ telegram_notified_at: new Date().toISOString() }).eq('id', p.show_order_id).is('telegram_notified_at', null);
  if (p.order_id) await admin.from('membership_orders').update({ telegram_notified_at: new Date().toISOString() }).eq('id', p.order_id).is('telegram_notified_at', null);
  const gateway = /lunas di/i.test(String(p.note || ''));
  let photo: string | undefined;
  if (p.image_path) {
    const { data: signed } = await admin.storage.from('membership-proofs').createSignedUrl(p.image_path, 3600);
    photo = signed?.signedUrl;
  }
  await notifyTelegramAdmins(admin, proofText(p, gateway ? '💳 *QRIS LUNAS — MENUNGGU PERSETUJUAN*' : '🧾 *BUKTI TRANSFER BARU*'), proofKeyboard(p.id), photo);
  return true;
}

/**
 * Sapu pesanan QRIS yang baru lunas (Pakasir/DOKU) dan kirim notifikasi sekali.
 * Aman dipanggil dari mana saja (webhook, cek status, poller) — klaim atomik mencegah dobel.
 */
export async function sweepPaidNotifications(admin: Admin) {
  try {
    if (!telegramConfigured()) return;
    if (!(await adminChats(admin)).length) return;
    const since = new Date(Date.now() - 3 * 3600_000).toISOString();
    const now = new Date().toISOString();
    const { data: proofs } = await admin.from('membership_payment_proofs').select('id')
      .is('telegram_notified_at', null).gte('created_at', since).limit(10);
    for (const p of proofs ?? []) await notifyProof(admin, p.id);

    const { data: orders } = await admin.from('orders')
      .update({ telegram_notified_at: now })
      .in('status', ['paid', 'awaiting_approval']).not('pakasir_order_id', 'is', null)
      .is('telegram_notified_at', null).gte('paid_at', since).select('*');
    for (const o of orders ?? []) {
      if (o.kind === 'coin_topup') {
        await notifyTelegramAdmins(admin, ['🪙 *TOP UP KOIN LUNAS*', `💰 ${rp(o.amount)}`, `📱 WA: \`${clean(o.user_phone)}\``, `🕒 ${wib(o.paid_at)}`].join('\n'));
        continue;
      }
      await notifyTelegramAdmins(admin, ['💳 *QRIS LUNAS*', '━━━━━━━━━━━━━━━━━━', `🎤 ${clean(o.item_title)}`, `💰 ${rp(o.amount)}`,
        `📱 WA: \`${clean(o.user_phone) || '-'}\``, `🕒 ${wib(o.paid_at)}`, `🆔 \`${o.id}\``].join('\n'),
        [[{ text: '📋 Salin Info Akses', callback_data: `om:${o.id}` }]]);
    }
    const { data: mos } = await admin.from('membership_orders')
      .update({ telegram_notified_at: now })
      .in('status', ['paid', 'awaiting_approval']).not('pakasir_order_id', 'is', null)
      .is('telegram_notified_at', null).gte('paid_at', since).select('*');
    for (const o of mos ?? []) {
      await notifyTelegramAdmins(admin, ['💳 *QRIS LUNAS — MEMBERSHIP*', '━━━━━━━━━━━━━━━━━━', `💰 ${rp(o.amount)}`,
        `📱 WA: \`${clean(o.phone) || '-'}\``, `🕒 ${wib(o.paid_at)}`, `🆔 \`${o.id}\``].join('\n'),
        [[{ text: '📋 Salin Info Akses', callback_data: `mm:${o.id}` }]]);
    }
  } catch (e) {
    console.error('sweepPaidNotifications:', String(e));
  }
}

/** Jadwalkan sapuan notifikasi di latar belakang (setelah status pembayaran sempat diperbarui). */
export function queuePaidSweep(delayMs = 4000) {
  const task = (async () => {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      await new Promise((r) => setTimeout(r, delayMs));
      await sweepPaidNotifications(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
    } catch (e) { console.error('queuePaidSweep:', String(e)); }
  })();
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(task); } catch { /* ignore */ }
}
