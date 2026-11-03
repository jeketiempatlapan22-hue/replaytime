# Backup Database + Website

## Yang bisa saya buatkan langsung
1. **Kode website lengkap**: semua halaman, fungsi backend, dan riwayat perubahan database. Folder sistem, paket unduhan, dan hasil build tidak ikut.
2. **Data tabel dalam CSV**: satu file per tabel (replay, show, token, membership, pembelian, pengaturan, game, chat, dan tabel lainnya). Kolom sandi rahasia dan kredensial tidak dimasukkan.
3. **Panduan pemulihan singkat** dalam bahasa Indonesia.

Semua isi digabung ke **satu file arsip**: `Backup_RealTime48_2026-11-03`.

## Format arsip
RAR adalah format berbayar, jadi tidak bisa dibuat dengan aman di sini. Saya akan membuat **ZIP**. File ZIP bisa dibuka di semua HP/PC, termasuk lewat WinRAR. Kalau Anda tetap butuh RAR, file ZIP ini bisa disimpan ulang sebagai RAR di WinRAR.

## Backup database penuh (resmi, termasuk akun user dan sandi)
Saya tidak boleh membuat salinan penuh database (dump). Gunakan fitur ekspor bawaan:
- Buka **More → Database → Manage → Settings → Export project data → Export data → Database → Start export**.
- Unduh dari link di email atau dari **More → Storage**.
- File di storage (gambar dan lainnya) tidak ikut. Unduh terpisah dari **More → Storage**.

## Langkah teknis
- Ekspor setiap tabel public ke CSV lewat query hanya-baca. Kolom password/kredensial dikecualikan.
- Salin kode sumber ke folder bersih di /tmp, tanpa .git, node_modules, dan dist. Periksa daftar isinya.
- Buat ZIP di /tmp, periksa isinya, lalu salin ke Files.
