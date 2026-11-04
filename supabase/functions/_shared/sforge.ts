// SForge auto-sync: ambil link master (Server 2) & master-final (Server 3)
// dari https://app.sforge.my.id/show/eligible lalu cocokkan ke active_shows.
const API = "https://app.sforge.my.id/show/eligible";

export interface SforgeShow { job_name: string; master: string; master_final: string; vod_ready: boolean }

const slug = (s: string) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

export async function fetchSforgeShows(timeoutMs = 4000): Promise<SforgeShow[]> {
  const token = (globalThis as any).Deno?.env.get("SFORGE_SHOW_TOKEN");
  if (!token) return [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return (Array.isArray(j?.shows) ? j.shows : []).map((s: any) => ({
      job_name: String(s.job_name || ""),
      master: String(s.master?.custom_url || s.master?.platform_url || ""),
      master_final: String(s.master_final?.custom_url || s.master_final?.platform_url || ""),
      vod_ready: !!s.master_final?.vod_ready,
    })).filter((s: SforgeShow) => s.job_name && s.master);
  } catch { return []; } finally { clearTimeout(t); }
}

/** Cocokkan show lokal (judul + tanggal YYYY-MM-DD) dengan job SForge. */
export function matchSforge(show: { title: string; show_date: string }, list: SforgeShow[]): SforgeShow | null {
  const date = String(show.show_date || "").slice(0, 10);
  if (!date) return null;
  const sameDate = list.filter((s) => s.job_name.includes(date));
  if (!sameDate.length) return null;
  const words = slug(show.title).split(" ").filter((w) => w.length > 1);
  let best: SforgeShow | null = null, bestScore = 0;
  for (const s of sameDate) {
    const jw = slug(s.job_name.split(date)[0]).split(" ");
    const score = words.filter((w) => jw.includes(w)).length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  if (best) return best;
  return sameDate.length === 1 ? sameDate[0] : null;
}

const isSforge = (u: string) => !u || /sforge\.my\.id/i.test(u);

/** Isi server2_url/server3_url bila kosong atau masih link SForge. Tidak menimpa link manual non-SForge. */
export async function syncShowsWithSforge(admin: any, shows: any[], list?: SforgeShow[]) {
  const all = list ?? await fetchSforgeShows();
  const updated: Array<{ id: string; title: string; job_name: string }> = [];
  for (const sh of shows) {
    const m = matchSforge(sh, all);
    if (!m) continue;
    const patch: Record<string, string> = {};
    if (isSforge(sh.server2_url || "") && sh.server2_url !== m.master) patch.server2_url = m.master;
    if (m.master_final && isSforge(sh.server3_url || "") && sh.server3_url !== m.master_final) patch.server3_url = m.master_final;
    if (!Object.keys(patch).length) continue;
    await admin.from("active_shows").update(patch).eq("id", sh.id);
    Object.assign(sh, patch);
    updated.push({ id: sh.id, title: sh.title, job_name: m.job_name });
  }
  return { updated, total_sforge: all.length };
}
