# Mode "Kunci Replay" saat kartu ringkas + YouTube disembunyikan

## Yang akan terjadi
Berlaku saat admin menyalakan **dua tombol sekaligus**: "Kartu replay ringkas" dan "Sembunyikan sumber YouTube".

1. **Di halaman daftar replay biasa (website ini):**
   - Penonton tidak lagi dipindahkan ke Website B saat menekan Tonton atau Beli replay.
   - Tombol di kartu diganti tulisan **"Hubungi Admin Untuk Akses Replay"** dan tombol **"Hubungi Admin"**.
   - Tombol Hubungi Admin membuka WhatsApp ke nomor admin yang sudah diisi di panel admin, dengan pesan awal yang menyebut judul singkat replay.
   - Membuka link replay langsung (token atau sandi) juga menampilkan pesan yang sama, tanpa dipindahkan ke Website B.
2. **Halaman replay rahasia (contoh /rply) tetap normal:** kartu, sandi, token, dan pemutar tetap berjalan seperti biasa.
3. **Pesan template:** link replay tidak lagi memakai path rahasia. Link memakai alamat utama website saja, contohnya `https://realtime48show.my.id/?token=...`. Link lama yang memakai /rply tetap bisa dibuka.
4. Saat salah satu tombol dimatikan, semua kembali seperti sekarang.

## Detail teknis
- `src/lib/siteRedirect.ts`: tambah `replayLocked(r, path)` yang bernilai true jika `compact_replay_cards && hide_youtube_on_main` dan halaman saat ini bukan path rahasia. `redirectReplayIfNeeded` tidak mengalihkan jika terkunci.
- `src/App.tsx` (DomainRouter): lewati pengalihan replay_origin untuk `/`, `/replay/:id`, dan `/akses` jika terkunci; path rahasia tetap memakai logika yang sekarang.
- `src/components/ReplayCardComponent.tsx` + `src/pages/Index.tsx`: blok "Hubungi Admin" memakai `src/lib/adminWa.ts` (nomor dari `owner_wa_number` / `admin_wa_phone` / `whatsapp_number`); handoff token di URL tidak menampilkan pemutar.
- `supabase/functions/_shared/replay-origin.ts`: buat link "Link Replay" di root origin (`link_origin`, jika kosong domain utama) tanpa `/replay_path`; redeploy fungsi pengirim pesan yang memakainya.
- Tambah uji untuk `replayLocked` (terkunci hanya jika kedua tombol menyala, dan tidak pernah terkunci di path rahasia).
- Catat aturan baru di AGENTS.md (mengganti aturan replay_path yang lama).
