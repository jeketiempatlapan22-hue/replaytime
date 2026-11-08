// Sinkronisasi pembelian (QRIS / koin / approval admin) dari server ke localStorage.
// Berlaku untuk user login maupun anonim (dicocokkan lewat nomor WhatsApp terakhir).
import { supabase } from '@/integrations/supabase/client';
import { getShowPurchase, setShowPurchase, getReplayPurchase, setReplayPurchase } from '@/lib/purchases';

let lastRun = 0;

// Pesanan QRIS yang belum terkonfirmasi di perangkat ini. Dicek ulang ke Pakasir
// (lewat server) setiap sinkronisasi agar pembayaran tidak terlewat walau dialog ditutup.
const PENDING_KEY = 'replaytime-pending-orders';
interface PendingOrder { id: string; kind: string; showId: string | null; replayId: string | null; at: number }

function readPending(): PendingOrder[] {
  try { const v = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writePending(list: PendingOrder[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-20))); } catch { /* ignore */ }
}
export function rememberPendingOrder(id: string, o: { kind: string; showId: string | null; replayId: string | null }) {
  if (!id) return;
  writePending([...readPending().filter((p) => p.id !== id), { id, ...o, at: Date.now() }]);
}

async function checkPendingOrders(): Promise<boolean> {
  const cutoff = Date.now() - 2 * 24 * 3600_000;
  const list = readPending().filter((p) => p.at > cutoff);
  const keep: PendingOrder[] = [];
  let changed = false;
  for (const p of list) {
    try {
      const { data } = await supabase.functions.invoke('check-pakasir-status', { body: { order_id: p.id } });
      const c = data as any;
      if (c?.status === 'paid' && p.kind === 'coin_topup') {
        // Server sudah mengkredit koin saat cek status; cukup beri tahu halaman.
        try { window.dispatchEvent(new Event('replaytime-coins-updated')); } catch { /* ignore */ }
        changed = true;
        continue;
      }
      if (c?.status === 'paid' && c?.access_token) {
        if (p.kind === 'replay_only' && p.replayId) setReplayPurchase(p.replayId, { token: c.access_token, paidAt: Date.now() });
        else if (p.showId) {
          setShowPurchase(p.showId, { token: c.access_token, kind: p.kind === 'replay' ? 'replay' : 'show', paidAt: Date.now() });
          if (p.replayId) setReplayPurchase(p.replayId, { token: c.access_token, paidAt: Date.now() });
        }
        changed = true;
        continue;
      }
      if (['expired', 'canceled', 'cancelled', 'failed'].includes(String(c?.status || ''))) continue;
    } catch { /* coba lagi nanti */ }
    keep.push(p);
  }
  writePending(keep);
  return changed;
}

/** Nomor WhatsApp terakhir yang dipakai membeli (dipakai untuk user anon). */
export function getSyncPhone(): string {
  const keys = ['replaytime-phone', 'replaytime-last-phone', 'replaytime-wa'];
  for (const k of keys) {
    try {
      const v = (localStorage.getItem(k) || '').trim();
      if (v) return v;
    } catch { /* ignore */ }
  }
  return '';
}

export function rememberSyncPhone(phone: string) {
  const v = String(phone || '').trim();
  if (!v) return;
  try { localStorage.setItem('replaytime-phone', v); } catch { /* ignore */ }
}

export async function syncPurchases(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRun < 10_000) return;
  lastRun = now;

  const phone = getSyncPhone();
  const pendingChanged = await checkPendingOrders();

  const { data: sessionData } = await supabase.auth.getSession();
  const hasSession = !!sessionData?.session;
  if (!hasSession && !phone) { if (pendingChanged) { try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ } } return; }

  try {
    const { data, error } = await supabase.functions.invoke('my-purchases', { body: { phone } });
    if (error) return;
    const r = data as any;
    if (!r?.ok) return;

    let changed = false;
    for (const [showId, v] of Object.entries<any>(r.shows || {})) {
      if (!v?.token) continue;
      if (getShowPurchase(showId)?.token === v.token) continue;
      setShowPurchase(showId, { token: v.token, kind: v.kind === 'replay' ? 'replay' : 'show', paidAt: Date.now() });
      changed = true;
    }
    for (const [replayId, v] of Object.entries<any>(r.replays || {})) {
      if (!v?.token) continue;
      if (getReplayPurchase(replayId)?.token === v.token) continue;
      setReplayPurchase(replayId, { token: v.token, paidAt: Date.now() });
      changed = true;
    }
    if (changed) {
      try { window.dispatchEvent(new Event('replaytime-purchases-updated')); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
