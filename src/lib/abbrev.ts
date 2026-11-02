// Singkatan judul replay untuk Mode Kartu Ringkas.
// Konsonan awal suku kata: 1–2 kata → 4 huruf ("Pajama Drive" → PJMD), 3+ kata → 3 huruf ("Cara Meminum Ramune" → CRM).
const VOWEL = /[aiueo]/i;
const STOP = new Set(['dan', 'di', 'ke', 'the', 'of', 'a', 'an', 'to']);

function syllableConsonants(word: string): string {
  const w = word.replace(/[^a-z]/gi, '');
  let out = '';
  let prevVowel = true;
  for (const ch of w) {
    const v = VOWEL.test(ch);
    if (!v && prevVowel) out += ch;
    prevVowel = v;
  }
  return out || w.slice(0, 1);
}

export function abbreviateTitle(title: string): string {
  const words = String(title || '').split(/\s[-–|]\s/)[0].replace(/[“”"']/g, '').split(/[\s\-–:/]+/).filter((w) => /[a-z0-9]/i.test(w) && !STOP.has(w.toLowerCase()));
  if (!words.length) return '';
  // Konsonan awal tiap suku kata seluruh judul, huruf kembar berurutan digabung.
  let letters = '';
  for (const w of words) for (const ch of syllableConsonants(w).toUpperCase()) if (letters.slice(-1) !== ch) letters += ch;
  const len = words.length >= 3 ? 3 : 4;
  return letters.slice(0, len);
}

export function displayShortTitle(r: { title: string; short_title?: string | null }): string {
  return (r.short_title || '').trim() || abbreviateTitle(r.title);
}
