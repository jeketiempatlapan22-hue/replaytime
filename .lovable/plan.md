# Login normal, cek WhatsApp dilewati saat Fonnte terputus, replay langsung terbuka

## Yang berubah untuk pengguna
1. **Login dan daftar seperti sebelumnya** — tidak ada pengecekan nomor WhatsApp aktif. Halaman login/daftar tetap seperti semula.
2. **Saat Fonnte terputus atau gangguan** — pengecekan nomor dilewati diam-diam. Pembeli langsung lanjut bayar tanpa pesan "gangguan" dan tanpa tombol "Hubungi Admin untuk Beli".
3. **Peringatan tetap tampil** di form beli show, bundle, replay, membership, dan koin:
   - "Cantumkan hanya nomor WhatsApp aktif. Link token tidak akan dikirim jika nomor tidak jelas."
   - Untuk show, bundle, dan membership saat Mode Persetujuan Admin aktif: "Setelah bayar, tunggu sampai tombol berubah jadi Tonton Show setelah admin menyetujui pembelianmu."
4. **Nomor yang jelas tidak terdaftar di WhatsApp** (hanya bila Fonnte tersambung) tetap ditahan dengan tombol Hubungi Admin.
5. **Replay seperti sebelumnya** — setelah pembayaran replay terkonfirmasi, kartu langsung jadi "Tonton Replay" tanpa menunggu admin, walau Mode Persetujuan Admin aktif.

## Detail teknis
- `_shared/wa-check.ts` + `src/lib/waCheck.ts`: status `unknown` dianggap lolos; `waShowsAdminButton` hanya untuk `not_registered`.
- `WaPhoneNotice.tsx`: hapus teks gangguan; tambah prop `approvalNote` untuk pesan tunggu persetujuan; dipakai di BuyShowDialog (kind show/bundle) dan Membership.
- `_shared/approval-gate.ts`: `GATED_KINDS` menjadi `show`, `bundle` saja (replay & replay_only dikeluarkan); deploy ulang check-pakasir-status, pakasir-webhook, poll-pending-orders, check-doku-status, doku-webhook.
- Update test `approvalGate.test.ts` dan `waCheck.test.ts` (replay tidak ditahan; unknown tidak memblokir/tidak menampilkan tombol admin).
- Auth.tsx tidak diubah (memang tidak memakai cek WhatsApp); diverifikasi tetap tanpa cek.
