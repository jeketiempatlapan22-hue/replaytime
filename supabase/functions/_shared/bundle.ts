import { samePassword } from './password-rules.ts';
// Helper bersama untuk fitur "Bundel Show":
// satu pembelian => satu token bundel + sub-token per show (agar seluruh
// pengecekan akses per-show yang sudah ada tetap berlaku apa adanya).

export interface BundleInfo {
  id: string;
  name: string;
  is_active: boolean;
  price_idr: number;
  price_coins: number;
  show_ids: string[];
  password: string;
}

function rnd(len = 24) {
  return crypto.randomUUID().replace(/-/g, '').slice(0, len);
}

/** Bundel tunggal + daftar show yang tercakup + sandi yang berlaku saat ini. */
export async function getBundle(admin: any): Promise<BundleInfo | null> {
  const { data: b } = await admin
    .from('show_bundles')
    .select('id,name,is_active,price_idr,price_coins,discount_idr,discount_coins')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!b) return null;

  const { data: items } = await admin
    .from('show_bundle_items')
    .select('show_id, excluded, active_shows!inner(id,is_active,replay_id,price_show,price_show_coins,pakasir_amount)')
    .eq('bundle_id', b.id)
    .eq('excluded', false);

  const members = (items || [])
    .filter((i: any) => i.active_shows?.is_active && !i.active_shows?.replay_id);
  const showIds = members.map((i: any) => String(i.show_id));

  // Harga dihitung ulang dari show yang benar-benar tercakup saat ini supaya
  // QRIS dinamis selalu memakai nominal bundel yang berlaku (bukan nilai basi).
  let sumIdr = 0;
  let sumCoins = 0;
  for (const i of members) {
    const s = i.active_shows || {};
    sumIdr += Number(s.price_show || 0) || Number(s.pakasir_amount || 0) || 0;
    sumCoins += Number(s.price_show_coins || 0);
  }
  const priceIdr = showIds.length ? Math.max(0, sumIdr - Number(b.discount_idr || 0)) : 0;
  const priceCoins = showIds.length ? Math.max(0, sumCoins - Number(b.discount_coins || 0)) : 0;

  const { data: pw } = await admin
    .from('show_bundle_passwords')
    .select('password')
    .eq('bundle_id', b.id)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: b.id,
    name: b.name,
    is_active: !!b.is_active,
    price_idr: priceIdr,
    price_coins: priceCoins,
    show_ids: showIds,
    password: String(pw?.password || ''),
  };
}

export interface IssuedBundle {
  token: string;
  password: string;
  show_ids: string[];
  /** show_id -> sub-token yang dipakai kartu show & player */
  show_tokens: Record<string, string>;
  already?: boolean;
}

/** Peta show_id -> sub-token untuk sebuah token bundel. */
export async function bundleShowTokens(admin: any, bundleToken: string): Promise<Record<string, string>> {
  const { data } = await admin
    .from('active_show_tokens')
    .select('show_id,token,revoked')
    .eq('label', `bundle:${bundleToken}`);
  const map: Record<string, string> = {};
  for (const r of data || []) {
    if (!r.revoked) map[String(r.show_id)] = String(r.token);
  }
  return map;
}

/** Cari token bundel milik pembeli (idempotent: 1 token untuk 1 user). */
export async function findBundleToken(
  admin: any,
  opts: { bundleId: string; userId?: string | null; phone?: string | null; orderId?: string | null },
) {
  const base = admin
    .from('show_bundle_tokens')
    .select('*')
    .eq('bundle_id', opts.bundleId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (opts.orderId) {
    const { data } = await base.eq('order_id', opts.orderId);
    if (data?.length) return data[0];
  }
  if (opts.userId) {
    const { data } = await admin
      .from('show_bundle_tokens').select('*')
      .eq('bundle_id', opts.bundleId).eq('revoked', false).eq('user_id', opts.userId)
      .order('created_at', { ascending: false }).limit(1);
    if (data?.length) return data[0];
  }
  if (opts.phone) {
    const { data } = await admin
      .from('show_bundle_tokens').select('*')
      .eq('bundle_id', opts.bundleId).eq('revoked', false).eq('phone', opts.phone)
      .order('created_at', { ascending: false }).limit(1);
    if (data?.length) return data[0];
  }
  return null;
}

/**
 * Terbitkan token bundel. Idempotent per pembeli (order/user/nomor WA).
 * Sub-token per show ditulis ke active_show_tokens agar kartu show, player live,
 * dan replay hasil konversi langsung mengenali akses pembeli.
 */
export async function issueBundleToken(
  admin: any,
  opts: { userId?: string | null; phone?: string | null; orderId?: string | null; label?: string },
): Promise<IssuedBundle | null> {
  const bundle = await getBundle(admin);
  if (!bundle) return null;

  const found = await findBundleToken(admin, {
    bundleId: bundle.id, userId: opts.userId, phone: opts.phone, orderId: opts.orderId,
  });
  // Token lama hanya dipakai ulang bila pesanan sama, atau isinya sudah mencakup
  // semua show bundel saat ini. Bundel berisi show baru => token baru.
  const covers = (ids: string[]) => {
    const own = new Set((ids || []).map(String));
    return bundle.show_ids.every((id) => own.has(id));
  };
  const existing = found && ((opts.orderId && found.order_id === opts.orderId) || covers(found.show_ids))
    ? found : null;
  if (existing) {
    return {
      token: existing.token,
      password: existing.password || bundle.password,
      show_ids: (existing.show_ids || []).map(String),
      show_tokens: await bundleShowTokens(admin, existing.token),
      already: true,
    };
  }

  const token = rnd();
  const showTokens: Record<string, string> = {};
  for (const showId of bundle.show_ids) {
    const sub = rnd();
    const { error } = await admin.from('active_show_tokens').insert({
      show_id: showId,
      token: sub,
      label: `bundle:${token}`,
      kind: 'personal',
      max_devices: 1,
      revoked: false,
    });
    if (!error) showTokens[showId] = sub;
  }

  await admin.from('show_bundle_tokens').insert({
    bundle_id: bundle.id,
    token,
    password: bundle.password,
    label: opts.label || '',
    user_id: opts.userId || null,
    phone: opts.phone || '',
    order_id: opts.orderId || null,
    show_ids: bundle.show_ids,
    max_devices: 1,
    revoked: false,
  });

  return { token, password: bundle.password, show_ids: bundle.show_ids, show_tokens: showTokens };
}

/** Sandi bundel (yang berlaku sekarang maupun lama) valid untuk replay ini? */
export async function bundlePasswordValidForReplay(
  admin: any,
  replayId: string,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const { data: passwords } = await admin
    .from('show_bundle_passwords')
    .select('bundle_id,password');
  const bundleIds = (passwords || []).filter((r: any) => samePassword(r.password, password)).map((r: any) => r.bundle_id);

  const { data: shows } = await admin
    .from('active_shows').select('id').eq('replay_id', replayId);
  const ids = (shows || []).map((s: any) => String(s.id));
  if (!ids.length) return false;

  // Snapshot pembeli: sandi pada token bundel yang memuat show ini tetap berlaku
  // walau show kemudian dikeluarkan dari bundel.
  const { data: tk } = await admin
    .from('show_bundle_tokens')
    .select('id,password')
    .eq('revoked', false)
    .overlaps('show_ids', ids);
  if ((tk || []).some((r: any) => samePassword(r.password, password))) return true;
  if (!bundleIds.length) return false;

  const { data: item } = await admin
    .from('show_bundle_items')
    .select('id')
    .in('bundle_id', bundleIds)
    .eq('excluded', false)
    .in('show_id', ids)
    .limit(1)
    .maybeSingle();
  return !!item;
}

/** Buat link bundel untuk reseller/admin (aturan sandi sama seperti pembelian di website). */
export async function createBundleLink(admin: any, opts: { label: string; origin: string }) {
  const bundle = await getBundle(admin);
  if (!bundle) return { error: 'bundle_not_found' as const };
  if (!bundle.is_active) return { error: 'bundle_inactive' as const };
  if (!bundle.show_ids.length) return { error: 'bundle_empty' as const };
  const issued = await issueBundleToken(admin, { label: opts.label });
  if (!issued) return { error: 'create_failed' as const };
  const siteOnly = opts.origin.replace(/^https?:\/\//, '');
  const link = `${opts.origin}/shows?bt=${issued.token}`;
  const { data: shows } = await admin.from('active_shows')
    .select('id,title,show_date,show_time').in('id', issued.show_ids)
    .order('show_date').order('show_time');
  const list = (shows || []).map((s: any) => `• ${s.title} (${s.show_date} ${String(s.show_time).slice(0, 5)})`);
  const message = [
    '🎁 *BUNDEL SHOW*', '', `📦 *${bundle.name}*`, `🎤 ${list.length} show:`, ...list, '',
    '🔗 *Link Live:*', link, '',
    '🎬 *Link Replay:*', siteOnly, '',
    `🔐 Sandi Replay: *${issued.password}*`, '',
    '👤 Hanya untuk *1 perangkat pertama* per show.', '', '— *ReplayTime* 💖',
  ].join('\n');
  return { ok: true as const, token: issued.token, password: issued.password, link, message, title: bundle.name, show_ids: issued.show_ids };
}

/** Sandi bundel valid untuk menonton LIVE show ini? (snapshot pembeli atau bundel aktif) */
export async function bundlePasswordValidForShow(
  admin: any,
  showId: string,
  password: string,
): Promise<boolean> {
  const pw = String(password || '').trim();
  if (!pw || !showId) return false;
  const { data: tk } = await admin
    .from('show_bundle_tokens')
    .select('id,password')
    .eq('revoked', false)
    .contains('show_ids', [showId]);
  if ((tk || []).some((r: any) => samePassword(r.password, pw))) return true;
  const { data: pws } = await admin
    .from('show_bundle_passwords').select('bundle_id,password');
  const bundleIds = (pws || []).filter((r: any) => samePassword(r.password, pw)).map((r: any) => r.bundle_id);
  if (!bundleIds.length) return false;
  const { data: item } = await admin
    .from('show_bundle_items').select('id')
    .in('bundle_id', bundleIds).eq('excluded', false).eq('show_id', showId)
    .limit(1).maybeSingle();
  return !!item;
}
