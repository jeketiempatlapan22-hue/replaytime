# Server 2 (m3u8 langsung) + YouTube layar penuh di halaman Live

## Yang akan dibuat

1. **Tombol "Server 2" di samping tombol IDN** di halaman Live.
   - Memutar link m3u8 yang dimasukkan admin, langsung tanpa proxy/worker dan tanpa token IDN.
   - Hanya muncul jika show punya link Server 2. Jika gagal, otomatis pindah ke server lain seperti aturan sekarang.
   - Link hanya diberikan ke penonton yang sudah punya akses (token/sandi/membership), tidak terlihat publik.

2. **Admin bisa mengisi link Server 2** di tiga tempat:
   - Form tambah/edit show satuan.
   - Import massal (baris `server2: https://...m3u8` atau `s2: ...`), plus kolom yang bisa diedit sebelum disimpan.
   - Kontrol live untuk show yang sudah ada di jadwal.

3. **YouTube di halaman Live memakai frame menutupi seluruh layar** saat HP diputar landscape (dan saat fullscreen), tanpa menutupi tombol YouTube.

4. **Replay tidak diubah sama sekali.**

5. **Website B**: karena memakai kode dan database yang sama, aturan ini ikut berlaku. Paket panduan Website B diperbarui dengan bagian Server 2 dan YouTube layar penuh.

## Detail teknis
- Migration: `active_shows.server2_url text not null default ''`. Tidak ditambahkan ke grant publik kolom; dikirim hanya lewat `unlock-live` (dan `free-token`) setelah akses valid, sama seperti sources privat.
- `manage-live` menerima/menyimpan `server2_url`; `ShowLiveControl.tsx`, form show di admin, `BulkShowImport.tsx` + `bulkShowParser.ts` (regex `server2|s2`) mengisinya.
- `Live.tsx`: `allSources` menambah `{ label: 'Server 2', type: 'm3u8', url }` tepat setelah IDN; jalur hls.js biasa (tanpa header IDN), native HLS di iOS; ikut logika failover `failedSourceKeys`.
- YouTube Live: wrapper `fixed inset-0` + `100dvh` saat `orientation: landscape` atau fullscreen, iframe tetap memakai kontrol native (sesuai aturan memori: tanpa overlay penghalang klik). Komponen replay tidak disentuh.
- Update dokumen Paket Website B di /mnt/documents.
- Deploy ulang `unlock-live`, `manage-live`, `free-token`; tes parser bulk untuk `server2`.
