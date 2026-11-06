// Sandi tahunan buatan admin: membuka semua live & replay selama masa berlakunya (1 tahun).
export async function yearlyPasswordOk(supabase: any, password: string): Promise<boolean> {
  const pw = String(password || "").trim();
  if (!pw) return false;
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("yearly_passwords").select("password,paused,starts_at,expires_at")
    .lte("starts_at", nowIso).gt("expires_at", nowIso).eq("paused", false);
  const up = pw.toUpperCase();
  return (data || []).some((r: any) => String(r.password).trim().toUpperCase() === up);
}
