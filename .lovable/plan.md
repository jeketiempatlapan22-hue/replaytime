# Kunci replay + singkatan judul dari form show

Halaman pemutar replay **tidak diubah sama sekali**.

## Yang akan terjadi
Berlaku saat admin menyalakan **dua tombol sekaligus**: "Kartu replay ringkas" dan "Sembunyikan sumber YouTube".

1. **Di daftar replay biasa (website ini):**
   - Penonton tidak dipindahkan ke Website B.
   - Tombol Tonton/Beli di kartu diganti tulisan **"Hubungi Admin Untuk Akses Replay"** dan tombol **"Hubungi Admin"**.
   - Tombol Hubungi Admin membuka WhatsApp ke nomor admin dari panel admin, dengan pesan awal yang menyebut judul singkat replay.
   - Link replay dengan token atau sandi juga tidak dipindahkan. Penonton melihat pesan yang sama di kartu.
2. **Halaman replay rahasia (contoh /rply) tetap normal**, termasuk kartu, sandi, token, dan pemutar.
3. **Pesan template:** "Link Replay" memakai alamat utama website tanpa path rahasia, contohnya `https://realtime48show.my.id/?token=...`. Link lama yang memakai /rply tetap bisa dibuka.
4. **Singkatan judul langsung dari show:**
   - Form tambah atau edit show manual mendapat kolom **"Singkatan Judul"**. Kolom terisi otomatis dari judul, misalnya PJMD atau CRM, dan bisa diubah.
   - Import show massal membuat singkatan otomatis untuk setiap show. Singkatannya terlihat dan bisa diedit di daftar pratinjau sebelum disimpan.
   - Saat show dijadikan replay, singkatannya ikut terbawa ke kartu replay, jadi admin tidak perlu membuka pengaturan replay satu per satu.
5. Saat salah satu tombol dimatikan, semua kembali seperti sekarang.

## Detail teknis
- Kolom baru `active_shows.short_title text not null default ''`, diizinkan dibaca publik. Fungsi `convert_show_to_replay` diperbarui agar menyalin `short_title` ke `replays.short_title` dan memperbarui replay yang sudah tertaut.
- `src/pages/Admin.tsx` (form show) dan `src/components/admin/BulkShowImport.tsx`: field singkatan diisi lewat `abbreviateTitle()` dan bisa diedit.
- `src/lib/siteRedirect.ts`: tambah `replayLocked(routing, pathname)`, true hanya jika kedua tombol menyala dan path saat ini bukan path rahasia. `redirectReplayIfNeeded` dan DomainRouter (`/`, `/replay/:id`, `/akses`) tidak mengalihkan saat terkunci.
- `src/components/ReplayCardComponent.tsx`: blok "Hubungi Admin" memakai `src/lib/adminWa.ts`. `YouTubePlayer.tsx` dan tampilan pemutar tidak disentuh.
- `supabase/functions/_shared/replay-origin.ts`: Link Replay dibuat di root origin (`link_origin`, atau domain utama jika kosong) tanpa `/replay_path`. Fungsi pengirim yang memakainya di-deploy ulang.
- Uji untuk `replayLocked` dan pembuat link replay. Aturan di AGENTS.md diperbarui.
