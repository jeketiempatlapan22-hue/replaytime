# Perbaikan Mode Perbaikan, Akses Membership, dan Kolom Membership di Profil

## 1. Mode perbaikan tidak terhubung (cek & kunci)
Saat ini mode perbaikan sudah mencatat website yang menyalakannya, jadi hanya website itu yang tertutup. Yang akan ditambahkan:
- Jika admin mematikan mode perbaikan di satu website, website lain tidak ikut terpengaruh.
- Aturan akses live dan replay tetap saling terhubung antar website A dan B untuk semua cara masuk: link token satuan, bundle, membership, sandi satuan, dan sandi bulanan. Aturan ini tidak diubah, hanya dipastikan lewat pengecekan otomatis.
- Teknis: saat ini hanya ada satu saklar perbaikan bersama (website terakhir yang menyalakan menimpa yang lain). Akan dibuat saklar terpisah per website, sehingga A dan B bisa on/off sendiri-sendiri.

## 1b. Semua menu bisa dibuka di Website A dan B (menu Show tidak terbuka)
- Pengaturan saat ini: halaman Show tidak diarahkan ke website lain (domain utama kosong), jadi penyebabnya belum pasti. Langkah pertama: buka menu Show di pratinjau dan di kedua domain, catat error yang muncul, lalu perbaiki penyebab sebenarnya.
- Setelah itu, cek satu per satu semua menu (Beranda, Show, Replay, Membership, Koin, Game, Profil, Panduan, Live) di A dan B agar terbuka tanpa layar kosong atau muter terus.

## 2. Member langsung dapat tombol Tonton (tidak disuruh beli lagi)
Penyebab yang ditemukan:
- Kartu show hanya membaca membership yang tersimpan di HP. Jika user login di HP lain atau belum pernah membuka link membership, kartu menganggapnya belum punya akses dan menampilkan tombol Beli.
- Membership yang dibuat admin/reseller dari nomor HP user tidak ikut terbaca di akun user, hanya membership yang dibeli lewat website.
- Saat mode ringkas/kunci aktif, member juga ikut melihat tombol Beli + Hubungi Admin.

Perbaikan:
- Kartu show dan kartu replay membaca membership dari akun (login) dan dari HP sekaligus.
- Membership dari admin/reseller dengan nomor HP yang sama dengan akun user ikut tampil dan memberi akses.
- Member aktif selalu melihat "Tonton Live (Member)" dan "Tonton Replay" (sesuai periode membership), termasuk saat mode kunci aktif — tombol membawa ke Website B bila diatur.

## 3. Kolom Membership di menu Profil/Akun
Kartu "Membership Saya" diperjelas untuk setiap membership aktif:
- Nama paket, tanggal mulai, berlaku hingga, dan sisa hari.
- Sandi membership dengan tombol Salin.
- Link token membership dengan tombol Salin (teks tetap bisa dipilih manual jika salin gagal).
- Tombol "Tonton Live" dan "Tonton Replay" langsung.

## Detail teknis
- Perbarui `get_my_memberships()` (migrasi) agar juga mengembalikan baris `membership_tokens` yang `phone`-nya cocok dengan `profiles.phone` user (pakai `norm_phone`), tanpa duplikasi dengan order.
- `ActiveShowCard`: gunakan `useActiveMembership()` sebagai sumber utama, fallback ke `readMembershipCredentials()`; simpan kredensial ke HP saat ditemukan dari akun.
- Mode kunci di `ActiveShowCard` dan `ReplayCardComponent`: jika ada membership aktif yang mencakup show/replay, tampilkan tombol tonton (redirect via `siteRedirect`) alih-alih Beli/Hubungi Admin.
- Profil: tampilkan sandi + link (helper clipboard bersama), tanggal mulai/berakhir; link memakai `link_origin`.
- Tambah tes untuk aturan maintenance per-origin dan aturan "member aktif = boleh tonton, tidak ditawari beli".
