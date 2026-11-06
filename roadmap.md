# Roadmap — Perintah_Website_A_v2.txt

- [x] Migrasi 1: tambah nilai 'moderator' ke enum app_role
- [x] Migrasi 2: kolom live_messages.sender_role + user_id, tabel live_message_senders (privat), fungsi admin_bulk_reset_devices, admin_get_chat_sender, admin_set_moderator, admin_list_moderators, mod_delete_message, mod_block_chat, mod_unblock_chat
- [x] Edge function live-chat-send (kirim pesan lewat server, catat pengirim privat, tolak browser diblokir)
- [x] LiveChat.tsx: kirim via live-chat-send, banner Admin/Moderator, aksi moderator (hapus/blokir), dialog info pengirim untuk admin
- [x] UserManagement.tsx: kartu Reset Massal Perangkat + daftar moderator
- [ ] Verifikasi build + test, commit
- [x] File perintah untuk Website B (salin tampilan chat)
