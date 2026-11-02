// Singkatan judul replay untuk Mode Kartu Ringkas.
// Judul 3+ kata → huruf pertama tiap kata ("Cara Meminum Ramune" → CRM).
// Judul 1–2 kata → huruf konsonan pertama tiap suku kata ("Pajama Drive" → PJMD).
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
  const words = String(title || '').replace(/[“”"']/g, '').split(/[\s\-–:/]+/).filter((w) => /[a-z0-9]/i.test(w));
  if (!words.length) return '';
  if (words.length >= 3) {
    const main = words.filter((w) => !STOP.has(w.toLowerCase()));
    return (main.length ? main : words).map((w) => w.replace(/[^a-z0-9]/gi, '').charAt(0)).join('').toUpperCase().slice(0, 6);
  }
  return words.map(syllableConsonants).join('').toUpperCase().slice(0, 6);
}

export function displayShortTitle(r: { title: string; short_title?: string | null }): string {
  return (r.short_title || '').trim() || abbreviateTitle(r.title);
}
