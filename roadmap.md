# Roadmap — Perintah_Website_A_v2.txt

## Retensi token dan identitas chat
- [x] Simpan token hingga tujuh hari setelah kedaluwarsa tanpa memperpanjang akses; sembilan tes lulus.
- [x] Pulihkan 28 catatan token dua hari terakhir ke riwayat Token Factory tanpa mengaktifkan akses ulang.
- [ ] Pemulihan penuh token dan data pembeli — show asal sudah terhapus dan identitas pembeli tidak tersimpan dalam catatan reseller; perlu backup yang memuat baris asli.
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
