# Roadmap — Perintah_Website_A_v2.txt

## Perintah Website A v3
- [ ] Perbaiki DELETE reset massal, konsumsi token show, dan hitungan reseller; periksa reset/purge lain.
- [ ] Samakan pencocokan sandi live/replay dan bulan WIB; sertakan show_id pada semua respons per-show.
- [ ] Pertahankan monitor admin di domain asal dan deploy chat atomik terbaru.
- [ ] Uji aturan dan verifikasi halaman; uji admin membutuhkan sesi akun peminta.
- [ ] Publish Website A setelah pemeriksaan; Website B membutuhkan akses proyek terpisah.

## Token sebelum persetujuan dan sinkronisasi dua website
- [x] Terbitkan token saat gateway terkonfirmasi atau bukti terhubung diunggah; pencabutan saat ditolak dan pemulihan saat reset.
- [x] Perbaiki pesan salin sandi show/bundle/custom dan sediakan teks lengkap jika clipboard gagal.
- [x] Simpan keputusan melalui data bersama dan muat ulang otomatis panel bukti pada proyek ini.
- [x] Uji 17 aturan penyalinan/persetujuan, deploy enam fungsi, periksa halaman login admin tanpa error, dan siapkan token pesanan lama yang memenuhi syarat.
- [ ] Uji tombol salin dan akses Website B dengan admin masuk — sesi akun peminta tidak tersedia; perlu masuk melalui preview.
- [ ] Terapkan pembaruan tampilan otomatis pada proyek Website B — kode proyek lain tidak tersedia pada checkout ini; keputusan dan token sudah dibagikan melalui database yang sama.

## Persetujuan membership dan bukti manual
- [x] Tahan membership terkonfirmasi sampai disetujui admin; pertahankan akses WhatsApp.
- [x] Setujui, tolak, dan reset bukti manual, termasuk bukti tanpa pesanan terhubung.
- [x] Uji aturan, deploy enam fungsi, dan periksa halaman membership desktop/ponsel tanpa error.
- [ ] Uji pembayaran nyata dan keputusan admin dari halaman — akun peminta belum tersedia untuk sesi pengujian.

## Retensi token dan identitas chat
- [x] Simpan token hingga tujuh hari setelah kedaluwarsa tanpa memperpanjang akses; sembilan tes lulus.
- [x] Pulihkan 28 catatan token dua hari terakhir ke riwayat Token Factory tanpa mengaktifkan akses ulang.
- [x] Pulihkan show Homecoming dari cadangan sebagai selesai/tidak aktif, arsipkan 5.047 link historis, pulihkan 253 token admin/reseller/pembeli, dan pastikan seluruh 133 pembelian berbayar tercakup tanpa memperpanjang akses.
- [ ] Lengkapi identitas penerima token admin/reseller yang tidak tercatat — memerlukan catatan penerima asli; cadangan lama tidak menyimpan token rahasia sehingga 30 token lain dari cadangan tidak dapat dicocokkan secara pasti.
- [ ] Verifikasi tampilan Token Factory dengan admin masuk — sesi akun peminta tidak tersedia; halaman login tanpa error dan pemeriksaan data pemulihan sudah lulus.
- [x] Perbaiki pencatatan atomik dan tampilan identitas pengirim; pesan uji admin terkirim, dialog terbuka, metadata tercatat, pesan uji dihapus. Akun admin uji tidak memiliki profil/nomor/email profil.

## Grup pembeli show dan membership
- [x] Simpan grup membership dan pilihan grup reseller per token.
- [x] Tombol gabung grup setelah pembayaran dan di informasi akses Profil.
- [x] Sertakan grup pada pesan admin/reseller dan pengiriman pembelian.
- [x] Uji aturan grup dan periksa halaman publik tanpa error.
- [ ] Uji pembayaran dan Profil dengan akun aktif — menunggu user masuk di preview; sesi akun tidak tersedia.

- [x] Migrasi 1: tambah nilai 'moderator' ke enum app_role
- [x] Migrasi 2: kolom live_messages.sender_role + user_id, tabel live_message_senders (privat), fungsi admin_bulk_reset_devices, admin_get_chat_sender, admin_set_moderator, admin_list_moderators, mod_delete_message, mod_block_chat, mod_unblock_chat
- [x] Edge function live-chat-send (kirim pesan lewat server, catat pengirim privat, tolak browser diblokir)
- [x] LiveChat.tsx: kirim via live-chat-send, banner Admin/Moderator, aksi moderator (hapus/blokir), dialog info pengirim untuk admin
- [x] UserManagement.tsx: kartu Reset Massal Perangkat + daftar moderator
- [x] Verifikasi build + test, commit
- [x] File perintah untuk Website B (salin tampilan chat)

## DOKU menggantikan Pakasir
- [x] Verifikasi API QRIS DOKU dan persyaratan akun.
- [x] Ganti pembuatan QRIS, pemeriksaan pembayaran, webhook, dan polling untuk semua produk.
- [x] Pakasir dipulihkan dan tetap aktif sampai DOKU siap (permintaan user).
- [ ] Alihkan pembayaran ke DOKU — setelah DOKU aktif & teruji.
- [x] Deploy fungsi DOKU dan uji aturan verifikasi pembayaran.
- [ ] Hubungkan kredensial DOKU dan uji pembayaran nyata — menunggu aktivasi QRIS SNAP dan data merchant DOKU.
- [ ] Verifikasi notifikasi QRIS merchant secara langsung — menunggu panduan/konfigurasi notifikasi DOKU untuk akun ini.
- [x] Jelaskan asal data tambahan DOKU saat dashboard hanya menampilkan Client ID dan Secret Key.
