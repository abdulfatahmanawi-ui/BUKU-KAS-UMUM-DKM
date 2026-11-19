# Pembaruan Format Laporan Kas Bulanan

Pembaruan ini hanya mengubah fungsi ekspor PDF pada frontend. Database Supabase, akun administrator, profil masjid, dan transaksi yang sudah tersimpan tidak diubah. Tidak diperlukan migrasi SQL baru.

## Format laporan
- Kertas A4 portrait.
- Judul rata tengah dalam tiga baris: LAPORAN KAS DKM, nama masjid dan dusun, serta periode bulan dan tahun.
- Tabel tujuh kolom: No., Tanggal, Kategori, Uraian, Pemasukan, Pengeluaran, dan Sisa.
- Baris pertama berisi tanggal hari pertama bulan laporan dan uraian “Sisa Saldo Bulan Lalu”. Nilai saldo awal dihitung dari seluruh pemasukan dikurangi pengeluaran sebelum bulan laporan.
- Transaksi bulan berjalan diurutkan dari tanggal paling awal ke paling akhir.
- Kolom Sisa menampilkan saldo berjalan setelah setiap transaksi.
- Baris Jumlah menampilkan total pemasukan bulan tersebut, total pengeluaran bulan tersebut, dan saldo akhir bulan.
- Tanda tangan Ketua DKM di kiri dan Pengelola Kas/Bendahara di kanan tetap disertakan. Tanggal cetak mengikuti pilihan pada kolom Tanggal cetak laporan.
- Filter Jenis dan pencarian pada halaman tidak mengurangi isi laporan; seluruh transaksi pada bulan terpilih dimasukkan.

## Cara menggunakan
1. Pilih satu bulan pada filter Periode.
2. Atur Tanggal cetak laporan jika diperlukan.
3. Klik Unduh Laporan PDF.

Jika filter Periode masih “Semua periode”, aplikasi meminta pengguna memilih satu bulan terlebih dahulu.

## Pemasangan
Unggah seluruh isi folder aplikasi ini ke deployment Netlify yang sama. Pertahankan file `config.js` dan `kop.jpeg` yang sudah ada. Jangan mengubah konfigurasi Supabase dan jangan menjalankan SQL baru.

## Posisi tanda tangan laporan bulanan
- Baris `Mengetahui,` sejajar dengan `Pengelola Kas,`.
- Baris `Ketua DKM` sejajar dengan `Bendahara`.
- Tanggal cetak berada di atas `Pengelola Kas,`.
