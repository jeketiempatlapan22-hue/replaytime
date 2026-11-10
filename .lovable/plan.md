# Cek Nomor WhatsApp Aktif (tanpa OTP)

## Yang akan dilihat user
- Di kolom "Nomor WhatsApp" pada **Beli Show/Replay/Bundle**, **Membership**, **Top Up Koin**, dan **Daftar Akun**, muncul peringatan:
  "Pastikan nomor WhatsApp aktif dan benar. Link token TIDAK akan dikirim jika nomor WhatsApp tidak jelas atau tidak aktif."
- Saat user menekan tombol beli/daftar, sistem mengecek nomornya dulu (sekitar 1–2 detik, ada tulisan "Mengecek nomor WhatsApp...").
  - Nomor terdaftar di WhatsApp: proses lanjut seperti biasa dan muncul centang hijau "WhatsApp aktif".
  - Nomor tidak terdaftar di WhatsApp: proses berhenti dan muncul pesan merah "Nomor ini tidak terdaftar di WhatsApp. Periksa lagi nomormu."
  - Format salah (terlalu pendek atau bukan nomor Indonesia): langsung ditolak.
- Kalau layanan pengecekan sedang gangguan, pembelian **tetap boleh lanjut** (tidak memblokir penjualan), dan peringatan tetap tampil.

## Pengamanan di server
Pembuatan pesanan (QRIS Pakasir/DOKU, membership, top up koin) mengecek ulang nomornya di server. Jadi nomor yang tidak aktif tetap ditolak walaupun pengecekan di layar dilewati.

## Technical details
- Fungsi baru `check-wa-number` memanggil Fonnte `POST https://api.fonnte.com/validate` (`target`, `countryCode=62`) dengan `FONNTE_TOKEN` yang sudah ada. Hasilnya `registered` / `not_registered` / `unknown`. Berlaku untuk publik dengan validasi input zod; hasil disimpan 24 jam di tabel cache `wa_number_checks` (khusus service-role) supaya pengecekan tidak berulang.
- Helper bersama `_shared/wa-check.ts` dipakai oleh `create-pakasir-order`, `create-doku-order`, `create-membership-order`, `create-coin-topup` → membalas 400 `wa_not_registered` hanya jika hasilnya `not_registered`; `unknown` tetap diizinkan (fail-open). Pembeli lewat Telegram (`tg...`) dilewati.
- Komponen frontend `WhatsAppPhoneField` (input + peringatan + status) dipakai di BuyShowDialog, Membership, Koin, dan Auth (daftar). Hook `useWaCheck` memanggil fungsi tersebut sebelum submit.
- Test: normalisasi nomor dan aturan "hanya not_registered yang diblokir".
