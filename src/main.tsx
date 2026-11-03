import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "./lib/pwa";

// Redirect ke domain utama (mempertahankan path + query + hash supaya token tetap berfungsi)
const PRIMARY_HOST = 'realtime48show.my.id';
const OLD_HOSTS = ['realtime48stream.my.id', 'realtimestream.my.id'];
// Jangan alihkan www.<domain utama>: hosting sudah mengalihkan domain utama ke www,
// sehingga mengalihkan balik ke tanpa-www membuat halaman memuat ulang tanpa henti.
const REDIRECT_HOSTS = new Set([
  'replaytime.lovable.app',
  ...OLD_HOSTS,
  ...OLD_HOSTS.map((h) => `www.${h}`),
]);
if (typeof window !== 'undefined' && REDIRECT_HOSTS.has(window.location.hostname)) {
  const { pathname, search, hash } = window.location;
  window.location.replace(`https://${PRIMARY_HOST}${pathname}${search}${hash}`);
}
// Tulis ulang link tersimpan di perangkat yang masih memakai domain lama
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k);
    if (v && OLD_HOSTS.some((h) => v.includes(h))) {
      let nv = v;
      for (const h of OLD_HOSTS) nv = nv.split(h).join(PRIMARY_HOST);
      localStorage.setItem(k, nv);
    }
  }
} catch { /* ignore */ }

// Suppress DOM reconciliation errors globally (prevents Chrome blank screen)
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || '';
  if (
    msg.includes('insertBefore') ||
    msg.includes('removeChild') ||
    msg.includes('appendChild') ||
    msg.includes('replaceChild') ||
    msg.includes('NotFoundError')
  ) {
    console.warn('Suppressed DOM error:', msg);
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  if (
    msg.includes('insertBefore') ||
    msg.includes('removeChild') ||
    msg.includes('NotFoundError')
  ) {
    console.warn('Suppressed DOM rejection:', msg);
    event.preventDefault();
  }
});

// Cache busting saat build baru dirilis — TAPI jangan pernah me-reload halaman
// saat user sedang menonton (live/replay). Reload mendadak inilah yang membuat
// beberapa user merasa website "refresh sendiri" di tengah tontonan.
const BUILD_KEY = 'app_build_id';
const RELOAD_FLAG = 'app_build_reloaded';

function isWatching(): boolean {
  try {
    if (location.pathname.startsWith('/live')) return true;
    const vids = Array.from(document.querySelectorAll('video'));
    if (vids.some(v => !v.paused && !v.ended && v.readyState > 2)) return true;
    // Player YouTube/embed aktif di DOM
    if (document.querySelector('iframe[src*="youtube"], iframe[src*="youtube-nocookie"]')) return true;
  } catch { /* ignore */ }
  return false;
}

function reloadWhenIdle(done: () => void) {
  // Reload hanya ketika user tidak sedang menonton, atau saat tab disembunyikan.
  const tryReload = () => {
    if (!isWatching() || document.visibilityState === 'hidden') {
      cleanup();
      done();
    }
  };
  const timer = window.setInterval(tryReload, 30_000);
  const onVis = () => { if (document.visibilityState === 'hidden') tryReload(); };
  const cleanup = () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
  };
  document.addEventListener('visibilitychange', onVis);
  // Cek pertama setelah app sempat render (jangan langsung reload saat mount).
  window.setTimeout(tryReload, 4000);
}

if (typeof window !== 'undefined') {
  try {
    const current = __APP_BUILD_ID__;
    const stored = localStorage.getItem(BUILD_KEY);
    if (stored && stored !== current && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      const done = () => {
        localStorage.setItem(BUILD_KEY, current);
        reloadWhenIdle(() => window.location.reload());
      };
      done();
    } else {
      localStorage.setItem(BUILD_KEY, current);
      sessionStorage.removeItem(RELOAD_FLAG);
    }
  } catch { /* ignore */ }
}


registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
