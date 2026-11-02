# Pengalihan penuh ke Website B + Mode Sembunyi Replay

## Kenapa belum pindah ke Website B sekarang
Pengaturan domain di database sudah benar (Live dan Replay → `realtim48show.my.id`). Masalahnya ada di cara pindahnya:
1. **Data pembelian tertinggal di Website A.** Saat penonton memasukkan sandi atau menekan "Tonton Live", Website A menyimpan pembelian/membership/sandi di HP untuk alamat A saja. Lalu penonton dikirim ke B hanya dengan `/live?show=...` tanpa token, jadi di B mereka diminta sandi lagi atau tidak masuk.
2. **Tonton Replay tidak ikut pindah.** Halaman putar replay (`/replay/...` dan halaman utama dengan `?replay=`) dianggap "halaman utama", dan kolom Website Pembayaran sengaja dikosongkan, jadi replay tetap diputar di A.

## Yang akan dibuat

### 1. Pengalihan penuh (Live + Replay)
- Satu fungsi pindah website untuk semua tombol: Tonton Live, Tonton Replay, buka dengan sandi (halaman Kunci, Akses, kartu show, Membership, Profil, dashboard member, link bundel).
- Jika domain B diisi, penonton langsung dikirim ke B **beserta** token/sandi yang dibutuhkan (token show, link membership + sandinya, link bundel, atau sandi replay yang sudah diverifikasi). Di B data itu disimpan di HP lalu dihapus dari alamat (tidak terlihat lagi di address bar).
- Halaman putar replay ikut diarahkan ke Website Replay (B).
- Jika kolom domain kosong, semuanya tetap di Website A seperti sekarang.
- Admin & reseller tetap tidak dialihkan.

### 2. Admin: sembunyikan nama & ID YouTube di website ini
- Tombol baru di panel admin (Mode Perbaikan): **"Sembunyikan sumber YouTube di website ini"**.
- Saat aktif: Website A tidak pernah mengirim ID YouTube ke penonton (server menolak memberikan sumber YouTube jika permintaan datang dari domain A), dan judul asli replay tidak ditampilkan. Website B tetap memutar normal.
- Saat dimatikan: kembali seperti semula.

### 3. Mode Kartu Ringkas
- Tombol baru di admin: **"Kartu replay ringkas"**.
- Saat aktif, kartu replay hanya menampilkan: **singkatan judul**, tanggal, kriteria, line up member (nama saja, tanpa foto), dan tombol pembelian. Foto sampul dan foto member disembunyikan.
- Singkatan dibuat otomatis (mis. "Pajama Drive" → PJMD, "Cara Meminum Ramune" → CRM), dan admin bisa mengubah singkatan tiap replay secara manual di form replay.
- Saat dimatikan: kartu kembali lengkap seperti sekarang. Data asli tidak dihapus sama sekali.

## Detail teknis
- `src/lib/siteRedirect.ts`: `goToSite(kind: 'live'|'replay', path, creds)` membaca `live_origin`/`replay_origin` (cache), membangun URL dengan `t`, `mtoken`+`mp`, `btoken`, atau `rt`/`replay` lalu `window.location.assign`; jika origin kosong/sama → `navigate`. Dipakai di Kunci, Akses, ActiveShowCard, Membership, Profil, MembershipDashboard, Shows, Tv, ReplayCardComponent.
- `DomainRouter`: tambah `/replay/*` dan `/?replay=` ke `replay_origin`; sebelum redirect, sertakan kredensial tersimpan (purchase/membership/bundle) di query. Di tujuan, Live/Index sudah membaca query → simpan ke localStorage → `history.replaceState` untuk membersihkan URL.
- `site_settings`: kunci baru `hide_youtube_on_main` dan `compact_replay_cards` (default `false`).
- Edge function `get-replay-source`: jika `hide_youtube_on_main=true` dan header Origin = domain utama (bukan `replay_origin`), buang sumber YouTube dan `youtube_id` dari respons. Deploy ulang.
- Migration: kolom `replays.short_title text not null default ''`; fungsi singkatan otomatis di `src/lib/abbrev.ts` (inisial tiap kata; judul 1–2 kata → huruf konsonan pertama per suku, maks 5 huruf) + test.
- `ReplayCardComponent`: varian ringkas tanpa gambar; judul = `short_title || abbrev(title)`; pencarian tetap memakai judul asli secara internal.
- Pengujian: unit test singkatan dan pembangun URL pengalihan; uji Playwright mode ringkas aktif/nonaktif. Pengalihan antar domain hanya bisa dicoba di website online setelah publish.
