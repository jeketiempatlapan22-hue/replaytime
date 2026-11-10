# Roadmap — Perintah_Website_A_v2.txt

## Retensi token dan identitas chat
- [ ] Simpan token hingga tujuh hari setelah kedaluwarsa tanpa memperpanjang akses.
- [ ] Pulihkan token dua hari terakhir dari catatan yang masih tersedia, beserta identitas yang dapat diverifikasi.
- [ ] Perbaiki pencatatan dan tampilan identitas pengirim chat; uji dengan akun admin.

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
