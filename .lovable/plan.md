# Server 3 sebagai player replay utama + mundurkan live di Server 3

Jawaban singkat: **bisa**, dengan satu syarat — fitur mundur hanya bekerja sejauh potongan video yang disimpan SForge di link master-final. Jika SForge menyimpan seluruh potongan sejak awal show, penonton bisa mundur sampai awal.

## 1. Replay: 2 tombol player (Server 3 + YouTube)
- Saat show dijadikan replay, link Server 3 (master-final SForge) disimpan sebagai sumber m3u8 utama kartu replay (sudah otomatis sejak update sebelumnya).
- Halaman replay menampilkan 2 tombol: **Server 3** (dipilih pertama) dan **YouTube** (jika admin mengisi ID YouTube).
- Jika Server 3 gagal dimuat, otomatis pindah ke YouTube.
- Aturan lain di halaman replay (sandi, token, sembunyikan YouTube di Website A, mode ringkas) tidak diubah.

## 2. Live: Server 3 bisa dimundurkan bebas
- Khusus saat penonton memilih tombol Server 3, player tidak membuang potongan lama dan tidak memaksa lompat ke posisi live terbaru.
- Muncul bar waktu penuh (seek bar) + tombol "Kembali ke LIVE" untuk lompat ke siaran terkini.
- Player Utama, IDN, dan Server 2 tetap memakai aturan sekarang (buffer ringan, mengejar live).

## 3. Website B
- File perintah copy-paste untuk Website B diperbarui agar aturan yang sama ikut diterapkan.

## Detail teknis
- `HlsPlayer`: prop baru `dvr` → `backBufferLength: Infinity`, `liveSyncDurationCount` normal tanpa watchdog lompat/catch-up, `liveMaxLatencyDurationCount: Infinity`; tampilkan range `seekable` dan tombol ke `liveSyncPosition`.
- `Live.tsx`: kirim `dvr` hanya bila `activeSource.label === 'Server 3'`.
- Halaman replay: susun sumber `[m3u8 (server3/m3u8_url), youtube]`, default m3u8, failover ke YouTube; data tetap via `get-replay-source` (gating YouTube tetap berlaku).
- Verifikasi: tes unit untuk urutan sumber replay + pengecekan bahwa playlist master-final SForge bertipe EVENT/VOD (menentukan sejauh mana bisa mundur).
- AGENTS.md: aturan baru untuk mode DVR Server 3.
