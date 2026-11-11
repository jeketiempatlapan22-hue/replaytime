// Perintah & tombol RAHASIA khusus admin di bot Telegram.
// Tidak didaftarkan di setMyCommands / HELP_TEXT. Setiap perintah & tombol diperiksa ulang
// lewat isTelegramAdmin (chat terdaftar + akun masih admin). Bukan admin => return false,
// sehingga bot membalas seperti perintah tidak dikenal.
import { sendTelegramRich, editTelegramMessage, editTelegramCaption, type InlineKeyboard } from '../_shared/telegram.ts';
import { isTelegramAdmin, proofKeyboard, proofText, wib } from '../_shared/telegram-admin.ts';
import { runProofAction } from '../_shared/proof-actions.ts';
import { buildCopyMessage } from '../_shared/proof-message.ts';
import { createAdminLink } from '../_shared/admin-link.ts';
import { rewriteReplay } from '../_shared/replay-origin.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_PREFIXES = ['pa:', 'pr:', 'px:', 'pm:', 'om:', 'mm:', 'ab:', 'adm:'];
const ERR: Record<string, string> = {
  already_approved: 'Pesanan sudah disetujui sebelumnya.', token_not_ready: 'Token belum siap.',
  proof_not_found: 'Bukti tidak ditemukan.', proof_has_no_order: 'Bukti belum terhubung ke pesanan — proses dari panel admin.',
  finalize_failed: 'Gagal menerbitkan token.', order_not_found: 'Pesanan tidak ditemukan.',
};

async function audit(admin: Admin, userId: string, chatId: number, action: string, details: Record<string, unknown>) {
  await admin.from('admin_action_logs').insert({
    actor_user_id: userId, actor_email: `telegram:${chatId}`, action: `telegram_${action}`,
    filter: {}, order_ids: [], affected_count: 1, details,
  }).then(() => {}, () => {});
}

async function sendCopy(chatId: number, msg: string) {
  const body = rewriteReplay(msg).replace(/```/g, "'''");
  await sendTelegramRich(chatId, `📋 *Info Akses* (tekan & tahan untuk menyalin)\n\`\`\`\n${body}\n\`\`\``);
}

function normPhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

async function adminMenu(chatId: number) {
  await sendTelegramRich(chatId, [
    '🛡️ *MENU ADMIN*', '━━━━━━━━━━━━━━━━━━',
    '`/pending` — 10 bukti/pesanan belum dikonfirmasi',
    '`/buat show` · `/buat replay` · `/buat member 31|62` · `/buat bundle`',
    '`/cari 08xxxx` — riwayat pesanan nomor tsb',
    '`/adminlogout` — putuskan chat ini dari admin',
  ].join('\n'), [
    [{ text: '⏳ Pending', callback_data: 'adm:pending' }, { text: '🔗 Buat Link', callback_data: 'adm:buat' }],
  ]);
}

async function listPending(admin: Admin, chatId: number) {
  const { data } = await admin.from('membership_payment_proofs').select('*')
    .eq('review_status', 'pending').eq('handled', false).order('created_at', { ascending: false }).limit(10);
  if (!data?.length) { await sendTelegramRich(chatId, '✅ Tidak ada bukti/pesanan yang menunggu konfirmasi.'); return; }
  for (const p of data) await sendTelegramRich(chatId, proofText(p, '⏳ *MENUNGGU KONFIRMASI*'), proofKeyboard(p.id));
}

async function buatMenu(admin: Admin, chatId: number, sub: string, arg: string) {
  if (sub === 'show') {
    const { data } = await admin.from('active_shows').select('id,title,show_date').eq('is_active', true)
      .order('show_date', { ascending: true }).limit(10);
    if (!data?.length) { await sendTelegramRich(chatId, '📭 Tidak ada show aktif.'); return; }
    await sendTelegramRich(chatId, '🎤 *Pilih show untuk dibuatkan link token:*',
      data.map((s: any) => [{ text: `${s.show_date} • ${String(s.title).slice(0, 40)}`, callback_data: `ab:s:${s.id}` }]));
    return;
  }
  if (sub === 'replay') {
    const { data } = await admin.from('replays').select('id,title,date').order('date', { ascending: false }).limit(10);
    if (!data?.length) { await sendTelegramRich(chatId, '📭 Tidak ada replay.'); return; }
    await sendTelegramRich(chatId, '🎬 *Pilih replay untuk dibuatkan link token:*',
      data.map((r: any) => [{ text: `${r.date} • ${String(r.title).slice(0, 40)}`, callback_data: `ab:r:${r.id}` }]));
    return;
  }
  if (sub === 'member' || sub === 'membership') {
    if (arg === '31' || arg === '62') return await makeLink(admin, chatId, 'membership', '', Number(arg));
    await sendTelegramRich(chatId, '👑 *Pilih durasi membership:*', [[
      { text: '1 Bulan (31 hari)', callback_data: 'ab:m:31' }, { text: '2 Bulan (62 hari)', callback_data: 'ab:m:62' },
    ]]);
    return;
  }
  if (sub === 'bundle') return await makeLink(admin, chatId, 'bundle', '', 0);
  await sendTelegramRich(chatId, '🔗 *Buat link token:*', [
    [{ text: '🎤 Show', callback_data: 'ab:menu:show' }, { text: '🎬 Replay', callback_data: 'ab:menu:replay' }],
    [{ text: '👑 Membership', callback_data: 'ab:menu:member' }, { text: '📦 Bundle', callback_data: 'ab:b' }],
  ]);
}

let currentUser = '';
async function makeLink(admin: Admin, chatId: number, kind: string, targetId: string, days: number) {
  const r = await createAdminLink(admin, { kind, target_id: targetId, label: `telegram`, days }, 'admin-telegram');
  if (r.status !== 200 || !r.body?.message) {
    await sendTelegramRich(chatId, `❌ Gagal membuat link: ${r.body?.error || r.status}`);
    return;
  }
  await audit(admin, currentUser, chatId, 'create_link', { kind, target_id: targetId || null, days: days || null });
  await sendCopy(chatId, String(r.body.message));
}

async function search(admin: Admin, chatId: number, raw: string) {
  const p = normPhone(raw);
  if (p.length < 9) { await sendTelegramRich(chatId, 'Format: `/cari 08xxxxxxxxxx`'); return; }
  const variants = [p, '0' + p.slice(2), '+' + p];
  const [{ data: orders }, { data: mos }] = await Promise.all([
    admin.from('orders').select('id,item_title,amount,status,created_at').in('user_phone', variants).order('created_at', { ascending: false }).limit(10),
    admin.from('membership_orders').select('id,amount,status,created_at').in('phone', variants).order('created_at', { ascending: false }).limit(10),
  ]);
  const rows = [
    ...(orders ?? []).map((o: any) => ({ ...o, t: 'om', title: o.item_title })),
    ...(mos ?? []).map((o: any) => ({ ...o, t: 'mm', title: 'Membership' })),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10);
  if (!rows.length) { await sendTelegramRich(chatId, `📭 Tidak ada pesanan untuk \`${p}\`.`); return; }
  const kb: InlineKeyboard = rows.map((o, i) => [{ text: `📋 ${i + 1}. ${String(o.title).slice(0, 30)}`, callback_data: `${o.t}:${o.id}` }]);
  await sendTelegramRich(chatId, [`🔎 *Pesanan* \`${p}\``, '', ...rows.map((o, i) =>
    `${i + 1}. ${String(o.title).replace(/[*_`]/g, '')} — Rp ${Number(o.amount || 0).toLocaleString('id-ID')} — *${o.status}* — ${wib(o.created_at)}`)].join('\n'), kb);
}

/** Teks: kembalikan true bila sudah ditangani sebagai perintah admin. */
export async function handleAdminText(admin: Admin, chatId: number, text: string, cmd: string): Promise<boolean> {
  if (cmd === '/adminlink') {
    const code = (text.split(/\s+/)[1] || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(code)) return false;
    const { data: row } = await admin.from('telegram_admin_link_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('code', code).is('used_at', null).gt('expires_at', new Date().toISOString())
      .select('user_id').maybeSingle();
    if (!row?.user_id) return false;
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', row.user_id).eq('role', 'admin').maybeSingle();
    if (!role) return false;
    await admin.from('telegram_admins').upsert({ chat_id: chatId, user_id: row.user_id, label: '' }, { onConflict: 'chat_id' });
    await audit(admin, row.user_id, chatId, 'link', {});
    await sendTelegramRich(chatId, '✅ *Telegram admin terhubung.*\nKetik `/adm` untuk menu admin.');
    return true;
  }
  if (!['/adm', '/pending', '/buat', '/cari', '/adminlogout'].includes(cmd)) return false;
  const uid = await isTelegramAdmin(admin, chatId);
  if (!uid) return false;
  currentUser = uid;
  const parts = text.split(/\s+/).slice(1);
  if (cmd === '/adm') await adminMenu(chatId);
  else if (cmd === '/pending') await listPending(admin, chatId);
  else if (cmd === '/buat') await buatMenu(admin, chatId, (parts[0] || '').toLowerCase(), parts[1] || '');
  else if (cmd === '/cari') await search(admin, chatId, parts.join(''));
  else if (cmd === '/adminlogout') {
    await admin.from('telegram_admins').delete().eq('chat_id', chatId);
    await audit(admin, uid, chatId, 'logout', {});
    await sendTelegramRich(chatId, '👋 Chat ini sudah diputus dari admin.');
  }
  return true;
}

/** Tombol: kembalikan true bila callback termasuk tombol admin (ditangani atau diabaikan diam-diam). */
// deno-lint-ignore no-explicit-any
export async function handleAdminCallback(admin: Admin, cq: any): Promise<boolean> {
  const data = String(cq.data || '');
  if (!ADMIN_PREFIXES.some((p) => data.startsWith(p))) return false;
  const chatId = Number(cq.message?.chat?.id || 0);
  const uid = await isTelegramAdmin(admin, chatId);
  if (!uid) return true; // tombol palsu / bukan admin: abaikan tanpa info
  currentUser = uid;
  const [pfx, a, b] = data.split(':');

  if (pfx === 'adm') {
    if (a === 'pending') await listPending(admin, chatId);
    else if (a === 'buat') await buatMenu(admin, chatId, '', '');
    return true;
  }
  if (pfx === 'ab') {
    if (a === 'menu') await buatMenu(admin, chatId, b || '', '');
    else if (a === 's' && UUID.test(b)) await makeLink(admin, chatId, 'show', b, 0);
    else if (a === 'r' && UUID.test(b)) await makeLink(admin, chatId, 'replay', b, 0);
    else if (a === 'm') await makeLink(admin, chatId, 'membership', '', b === '62' ? 62 : 31);
    else if (a === 'b') await makeLink(admin, chatId, 'bundle', '', 0);
    return true;
  }
  if (!UUID.test(a || '')) return true;

  if (pfx === 'om' || pfx === 'mm') {
    const msg = await buildCopyMessage(admin, pfx === 'mm' ? { order_id: a } : { show_order_id: a }).catch(() => null);
    if (!msg) await sendTelegramRich(chatId, '⏳ Token belum siap untuk pesanan ini.');
    else { await sendCopy(chatId, msg); await audit(admin, uid, chatId, 'copy', { order_id: a }); }
    return true;
  }

  const action = pfx === 'pa' ? 'approve' : pfx === 'pr' ? 'reject' : pfx === 'px' ? 'reset' : 'message';
  const r = await runProofAction(admin, { proof_id: a, action });
  await audit(admin, uid, chatId, action, { proof_id: a, status: r.status });
  if (r.status !== 200) {
    await sendTelegramRich(chatId, `❌ ${ERR[String(r.body.error)] || String(r.body.error)}`);
    return true;
  }
  if (action === 'message') { await sendCopy(chatId, String(r.body.message || '')); return true; }

  const label = action === 'approve' ? '✅ Disetujui' : action === 'reject' ? '❌ Ditolak' : '🔄 Direset';
  const stamp = `\n\n${label} oleh admin • ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB`;
  const mid = Number(cq.message?.message_id || 0);
  // Setelah setujui: hanya sisakan tombol salin. Setelah tolak: tombol reset & salin.
  const kb: InlineKeyboard = action === 'approve'
    ? [[{ text: '📋 Salin Info Akses', callback_data: `pm:${a}` }]]
    : action === 'reject' ? [[{ text: '🔄 Reset', callback_data: `px:${a}` }, { text: '📋 Salin Info Akses', callback_data: `pm:${a}` }]]
    : proofKeyboard(a);
  if (mid) {
    if (cq.message?.photo) await editTelegramCaption(chatId, mid, String(cq.message.caption || '').slice(0, 900) + stamp, kb);
    else await editTelegramMessage(chatId, mid, String(cq.message.text || '') + stamp, kb);
  }
  if (action === 'approve') {
    const msg = await buildCopyMessage(admin, (await admin.from('membership_payment_proofs').select('*').eq('id', a).maybeSingle()).data).catch(() => null);
    if (msg) await sendCopy(chatId, msg);
  }
  return true;
}
