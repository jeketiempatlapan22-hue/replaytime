// Parser jadwal show bulk (format WhatsApp/Telegram) → data show terstruktur.
// Dibuat toleran terhadap variasi emoji, singkatan bulan, dan format tanggal/jam.

export interface ParsedShow {
  title: string;
  show_date: string;
  show_time: string;
  lineup: string[];
  admin_alias: string;
  live_password: string;
  price_show: number;
  price_replay: number;
  price_show_coins: number;
  price_replay_coins: number;
  category: string;
  idn_show_id: string;
  server2_url?: string;
  description: string;
}

export interface ParseResult {
  shows: ParsedShow[];
  warnings: string[];
}

const MONTHS: Record<string, string> = {
  // Indonesia
  januari: '01', februari: '02', pebruari: '02', maret: '03', april: '04', mei: '05', juni: '06',
  juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', nopember: '11', desember: '12',
  jan: '01', feb: '02', peb: '02', mar: '03', apr: '04', jun: '06', jul: '07',
  agu: '08', agt: '08', ags: '08', agst: '08', agust: '08',
  sep: '09', sept: '09', okt: '10', nov: '11', des: '12',
  // English
  january: '01', february: '02', march: '03', may: '05', june: '06', july: '07',
  august: '08', october: '10', december: '12', oct: '10', dec: '12', aug: '08',
};

const WEEKDAYS = /^(senin|selasa|rabu|kamis|jum'?at|jumat|sabtu|minggu|ahad|mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*/i;

// Strip emoji / pictographs / variation selectors / ZWJ.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu;
export function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

const DATE_EMOJI = /[\u{1F4C5}\u{1F4C6}\u{1F5D3}]/u; // 📅 📆 🗓
const TIME_EMOJI = /[\u{1F550}-\u{1F567}\u{23F0}\u{231A}\u{1F551}]/u; // 🕐-🕧 ⏰ ⌚
const LINEUP_EMOJI = /[\u{1F465}\u{1F464}\u{1F46F}]/u; // 👥 👤 👯
const TITLE_EMOJI = /[\u{1F3A4}\u{1F3AC}\u{1F3AD}\u{1F3B5}\u{1F31F}]/u; // 🎤 🎬 🎭 🎵 🌟

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parse tanggal dari sebuah baris. Mengembalikan '' jika tidak valid. */
export function parseDate(line: string, fallbackYear = new Date().getFullYear()): string {
  const s = stripEmoji(line).replace(WEEKDAYS, '').trim();

  // ISO: 2026-08-05
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return isValidYmd(y, mo, d) ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  }

  // 5 Agt 2026 / 5 Agustus 2026 / 5 Agt (tanpa tahun)
  m = s.match(/(\d{1,2})\s*[-.\s]\s*([A-Za-zÀ-ÿ]{3,12})\.?\s*[-.,\s]?\s*(\d{4})?/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase().replace(/\./g, '')];
    if (mo) {
      const y = m[3] ? +m[3] : fallbackYear;
      const d = +m[1];
      if (isValidYmd(y, +mo, d)) return `${y}-${mo}-${String(d).padStart(2, '0')}`;
    }
  }

  // 05/08/2026 atau 5-8-2026 (dd/mm/yyyy)
  m = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (isValidYmd(y, mo, d)) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

export function hasDate(line: string): boolean {
  return parseDate(line) !== '';
}

/** Parse jam. Mengembalikan null jika tidak ada jam valid di baris. */
export function parseTime(line: string): string | null {
  const s = stripEmoji(line);
  const m = s.match(/\b(\d{1,2})[.:](\d{2})\b/);
  if (!m) return null;
  let h = +m[1];
  const mi = +m[2];
  if (mi > 59) return null;
  if (/\bpm\b/i.test(s) && h < 12) h += 12;
  if (/\bam\b/i.test(s) && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00`;
}

export function parseIdnCode(line: string): string {
  const m = line.match(/[?&]code=([A-Za-z0-9_-]+)/i);
  if (m) return m[1];
  const m2 = line.match(/\b(?:idn|hanabira|code)\s*[:=]\s*([A-Za-z0-9_-]{3,})/i);
  return m2 ? m2[1] : '';
}

export function parseServer2Url(line: string): string {
  const m = line.match(/\b(?:server\s*2|s2)\s*[:=]\s*(https?:\/\/\S+)/i);
  return m ? m[1].trim() : '';
}

export function slugAlias(title: string, date: string, time: string): string {
  const base = stripEmoji(title).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 6);
  const d = date.replace(/-/g, '').slice(4);
  const t = time.replace(/[:.]/g, '').slice(0, 4);
  return `${base || 'show'}${d}${t}`.slice(0, 20);
}

const STATUS_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(sts|setengah\s*tahun)\b/i, label: 'STS' },
  { re: /\b(ultah|ulang\s*tahun|birthday|bday)\b/i, label: 'Ulang Tahun' },
  { re: /\b(graduation|kelulusan|grad)\b/i, label: 'Graduation' },
  { re: /\b(last\s*show|show\s*terakhir|farewell)\b/i, label: 'Last Show' },
];

function extractStatuses(raw: string): { name: string; statuses: string[] } {
  let name = raw;
  const statuses: string[] = [];
  for (const { re, label } of STATUS_PATTERNS) {
    if (re.test(name)) {
      if (!statuses.includes(label)) statuses.push(label);
      name = name.replace(re, '');
    }
  }
  name = name.replace(/[()[\]{}]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return { name, statuses };
}

function isNoiseLine(line: string): boolean {
  const s = stripEmoji(line).trim();
  if (!s) return true;
  if (/^[-=_*•~]{2,}$/.test(s)) return true;
  return /^(berikut|pertunjukan|member yang|jadwal|catatan|note|info)\b/i.test(s);
}

function looksLikeLineup(line: string): boolean {
  if (LINEUP_EMOJI.test(line)) return true;
  if (/^\s*(member|lineup|setlist member)\s*[:\-]/i.test(stripEmoji(line))) return true;
  const s = stripEmoji(line);
  // Daftar nama dipisah koma, minimal 3 bagian pendek.
  const parts = s.split(/[,،]/).map(p => p.trim()).filter(Boolean);
  return parts.length >= 3 && parts.every(p => p.length <= 24 && !/\d{4}/.test(p));
}

function isDetailLine(line: string): boolean {
  return (
    hasDate(line) ||
    DATE_EMOJI.test(line) ||
    TIME_EMOJI.test(line) ||
    parseTime(line) !== null ||
    looksLikeLineup(line) ||
    /code=|https?:\/\//i.test(line)
  );
}

function cleanTitle(raw: string): string {
  const rawTitle = raw.replace(/^[`"'•\-*\s>]+/, '').replace(/[`"'\s]+$/, '');
  const probe = stripEmoji(rawTitle).toLowerCase().replace(/\s+/g, '');
  // Judul yang memang mengandung emoji sebagai bagian nama resmi.
  const keepEmoji = /itadaki.*love/.test(probe);
  const withoutLead = rawTitle.replace(new RegExp(`^(?:${TITLE_EMOJI.source})\\s*`, 'u'), '').trim();
  return (keepEmoji ? withoutLead : stripEmoji(withoutLead)).trim();
}

export function parseBulkText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\u00a0/g, ' ').trim());
  const shows: ParsedShow[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    if (!raw || isNoiseLine(raw)) { i++; continue; }
    if (isDetailLine(raw) && !TITLE_EMOJI.test(raw)) { i++; continue; }

    // Cari baris tanggal dalam 8 baris berikutnya (lewati baris kosong).
    let dateIdx = -1;
    let date = '';
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      if (!lines[j]) continue;
      const d = parseDate(lines[j]);
      if (d) { dateIdx = j; date = d; break; }
      // Jika ketemu judul lain sebelum tanggal → blok ini tanpa tanggal.
      if (TITLE_EMOJI.test(lines[j])) break;
    }
    const title = cleanTitle(raw);
    if (!date) {
      if (title && TITLE_EMOJI.test(raw)) warnings.push(`Tanggal tidak terbaca untuk "${title}"`);
      i++;
      continue;
    }
    if (!title) { warnings.push(`Judul kosong untuk tanggal ${date}`); i = dateIdx + 1; continue; }

    let time: string | null = null;
    let lineup: string[] = [];
    const detectedStatuses: string[] = [];
    let idn = '';
    let server2 = '';
    let endIdx = dateIdx;

    for (let j = dateIdx + 1; j < lines.length; j++) {
      const ln = lines[j];
      if (!ln) continue;
      // Awal show berikutnya: judul (emoji mic / backtick) atau baris non-detail baru
      if (TITLE_EMOJI.test(ln) || /^`/.test(ln)) break;
      const s2 = parseServer2Url(ln);
      if (s2) { server2 = s2; endIdx = j; continue; }
      if (!isDetailLine(ln)) {
        if (isNoiseLine(ln)) { endIdx = j; continue; }
        break;
      }
      if (hasDate(ln) && !TIME_EMOJI.test(ln)) break; // tanggal berikutnya tanpa judul

      const code = parseIdnCode(ln);
      if (code) { idn = code; endIdx = j; continue; }

      const t = parseTime(ln);
      if (t && (TIME_EMOJI.test(ln) || /\b(wib|wita|wit|am|pm)\b/i.test(ln) || !looksLikeLineup(ln))) {
        time = t; endIdx = j; continue;
      }

      if (looksLikeLineup(ln)) {
        const cleaned = stripEmoji(ln)
          .replace(/^\s*(member|lineup|setlist member)\s*[:\-]\s*/i, '')
          .replace(/[.。]\s*$/, '')
          .replace(/^[:\-\s]+/, '');
        const parts = cleaned.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        const names: string[] = [];
        for (const p of parts) {
          const { name, statuses } = extractStatuses(p);
          if (name) names.push(name);
          for (const s of statuses) {
            const tagged = `${name || p}: ${s}`;
            if (!detectedStatuses.includes(tagged)) detectedStatuses.push(tagged);
          }
        }
        if (names.length > 0) lineup = names;
        endIdx = j;
        continue;
      }
      endIdx = j;
    }

    if (!time) { time = '19:00:00'; warnings.push(`Jam tidak terbaca untuk "${title}" (${date}) — dipakai 19:00`); }
    if (lineup.length === 0) warnings.push(`Lineup tidak terbaca untuk "${title}" (${date})`);

    const key = `${title.toLowerCase()}|${date}|${time}`;
    if (seen.has(key)) {
      warnings.push(`Duplikat dilewati: "${title}" (${date})`);
    } else {
      seen.add(key);
      shows.push({
        title,
        show_date: date,
        show_time: time,
        lineup,
        admin_alias: slugAlias(title, date, time),
        live_password: '',
        price_show: 0, price_replay: 0,
        price_show_coins: 0, price_replay_coins: 0,
        category: 'reguler',
        idn_show_id: idn,
        server2_url: server2,
        description: detectedStatuses.join(' • '),
      });
    }
    i = endIdx + 1;
  }

  return { shows, warnings };
}
