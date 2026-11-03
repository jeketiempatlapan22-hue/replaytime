# Panduan Mengisi Environment Variable di Vercel

Panduan ini untuk memindahkan (deploy) website ReplayTime ke Vercel tanpa kehilangan koneksi ke database dan fitur yang sudah ada.

## Yang perlu diisi di Vercel (hanya 3)

Website ini adalah aplikasi frontend (React + Vite). Yang dibutuhkan Vercel hanya 3 variabel publik berikut:

| Nama Variabel | Isi | Sifat |
|---|---|---|
| `VITE_SUPABASE_URL` | Alamat backend Lovable Cloud | Publik (aman) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Kunci publik backend | Publik (aman) |
| `VITE_SUPABASE_PROJECT_ID` | ID proyek backend | Publik (aman) |

Nilai aslinya ada di file `.env` di komputer/proyek ini. Ketiganya memang dirancang untuk tampil di browser, jadi aman disalin ke Vercel.

## Langkah-langkah

1. Buka file `.env` di proyek ini, salin 3 baris `VITE_...` beserta nilainya.
2. Buka **Vercel Dashboard → pilih proyek → Settings → Environment Variables**.
3. Tambahkan satu per satu: isi **Name** dengan nama variabel, **Value** dengan nilainya, lalu centang semua environment (Production, Preview, Development).
4. Klik **Save**, lalu **Redeploy** proyek (Deployments → titik tiga → Redeploy) agar variabel terbaca saat build.

### Cara cepat lewat terminal (opsional)

Jika memakai Vercel CLI:

```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY
vercel env add VITE_SUPABASE_PROJECT_ID
```

## Yang TIDAK perlu diisi di Vercel

Semua kunci rahasia berikut **tetap tinggal di Lovable Cloud** karena dipakai oleh fungsi server (Edge Functions), bukan oleh Vercel:

- `SUPABASE_SERVICE_ROLE_KEY` — kunci rahasia backend (jangan pernah disalin ke frontend/Vercel)
- `PAKASIR_API_KEY`, `PAKASIR_PROJECT_SLUG` — pembayaran QRIS
- `FONNTE_TOKEN`, `FONNTE_WEBHOOK_SECRET` — pesan WhatsApp
- `TELEGRAM_API_KEY` — bot Telegram
- `HANABIRA_PARTNER_SECRET`, `STREAM_GRANT_SECRET` — streaming IDN/Hanabira
- `CRON_KEY` — tugas terjadwal
- `LOVABLE_API_KEY` — fitur AI

Selama backend tetap di Lovable Cloud, pembayaran QRIS, WhatsApp, Telegram, dan live streaming tetap berjalan normal meski website di-hosting di Vercel.

## Setelah deploy di Vercel

1. **Domain:** arahkan domain (misal `realtime48show.my.id`) ke Vercel lewat pengaturan DNS.
2. **Whitelist server video:** pastikan domain baru diizinkan oleh server streaming (worker/IDN/Hanabira), kalau tidak live tidak akan tampil.
3. **Pengaturan dua website:** jika memakai sistem Website A/B, perbarui alamat Website A/B di panel admin agar pengalihan token tetap benar.
