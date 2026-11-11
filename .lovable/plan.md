# Perbaikan Salin Link Token + Rilis Token Otomatis

## Penyebab masalah (sudah dicek)
- Pesanan "Pertaruhan Cinta" di screenshot sebenarnya **sudah punya token** dan statusnya lunas.
- Tombol "Salin Link Token + Info Replay" gagal karena fungsi pembuat pesan salin di server **tidak pernah ada** (terpanggil tapi belum dibuat), sehingga server error dan layar menampilkan pesan keliru "Token belum ada".

## Yang akan dibuat
1. **Pesan salin berfungsi lagi** — memuat nomor HP pembeli, judul show, link token, sandi (show: sandi live → cadangan sandi replay; bundle: sandi token bundle; replay: sandi replay; membership: sandi custom + tanggal berakhir), link grup, dan info replay. Aturan sandi sama dengan pengambilan link di halaman live dan reseller.
2. **Token langsung dirilis tanpa menunggu Setujui** — begitu pembayaran terkonfirmasi Pakasir/DOKU, atau user mengirim bukti transfer, token langsung dibuat agar admin bisa langsung menyalin pesan.
   - Tombol di halaman user tetap "Pending" sampai admin menekan Setujui (Mode Persetujuan tetap berlaku untuk tampilan user dan kiriman WA otomatis).
   - Jika admin menekan **Tolak**, token yang sudah dirilis dicabut. **Reset** mengaktifkan kembali.
3. **Berlaku di Website A dan B** — link token tetap memakai domain utama dan otomatis membuka akses di Website B (aturan redirect yang sudah ada).
4. **Status setuju sinkron A ↔ B** — kedua website memakai database yang sama, jadi status Setujui/Tolak tersimpan di satu tempat. Kartu bukti transaksi di admin panel akan diperbarui otomatis (realtime) sehingga persetujuan di satu website langsung terlihat di website lain tanpa refresh. Instruksi singkat untuk Website B disiapkan.

## Detail teknis
- `admin-approve-proof`: implementasikan `buildCopyMessage` (pakai helper sandi & `enrichAccessMessage` yang sudah ada); pesan error sisi admin dibedakan antara "token belum ada" dan error server.
- `approval-gate.ts` `holdForApproval` / `holdMembershipForApproval`: terbitkan token (active_show_tokens / bundle / membership_tokens) dalam keadaan tercatat tapi tanpa kirim WA; kartu user tetap menahan via status `awaiting_approval`. Upload bukti manual memicu penerbitan serupa melalui aksi baru `issue`.
- Reject → `revoked=true` pada token terkait; reset → `revoked=false`.
- `MembershipProofsAdmin`: langganan realtime pada `membership_payment_proofs` dan `orders`.
- Tambah test untuk: token ada saat `awaiting_approval`, reject mencabut token.
- Deploy fungsi terkait; buat `/mnt/documents/Perintah_Website_B_Rilis_Token_Sinkron.txt`.
