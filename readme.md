# Aplikasi Kas DKM Masjid Jami Al-Ikhlas — Supabase

Aplikasi web pencatatan kas masjid dengan database online Supabase. Aplikasi dapat diakses publik untuk melihat laporan, sedangkan pengelolaan transaksi dibatasi untuk administrator.

## Format laporan PDF

Laporan PDF menggunakan kertas A4 landscape dengan susunan:

- Kop tiga baris: logo di kiri, identitas DEWAN KEMAKMURAN MASJID (DKM), nama masjid berukuran lebih besar, dan alamat lengkap.
- Ringkasan total pemasukan, total pengeluaran, dan saldo sesuai filter periode yang dipilih.
- Tabel transaksi dengan header hijau tua, baris selang-seling, garis tipis, dan nominal rata kanan.
- Titimangsa desa mengikuti profil masjid dan tanggal cetak otomatis, serta ruang tanda tangan Pengelola Kas/Bendahara dan Mengetahui/Ketua DKM.

Nama penandatangan sengaja dibiarkan kosong agar dapat diisi atau ditandatangani oleh pejabat yang berwenang.

## Fitur

- Dashboard total pemasukan, pengeluaran, dan saldo.
- Input pemasukan dan pengeluaran.
- Kolom nama penyetor untuk pemasukan dan nama penerima untuk pengeluaran.
- Cetak kwitansi PDF A5 untuk setiap transaksi (khusus administrator), dengan nomor kwitansi otomatis, nominal angka, terbilang, kategori, keterangan, kop resmi, serta ruang tanda tangan Ketua DKM dan Bendahara.
- Edit dan hapus transaksi oleh administrator.
- Filter periode, jenis transaksi, dan pencarian.
- Ekspor laporan kas bulanan ke PDF dengan saldo awal, saldo berjalan, dan jumlah pemasukan/pengeluaran.
- Tampilan responsif untuk ponsel dan komputer.
- Supabase Authentication dan Row Level Security (RLS).

## Struktur paket

- `index.html` — halaman aplikasi.
- `style.css` — tampilan dan responsivitas.
- `app.js` — logika aplikasi dan koneksi database.
- `config.js` — konfigurasi URL dan anon key Supabase.
- `supabase-schema.sql` — pembuatan tabel, indeks, trigger, dan kebijakan RLS.
- `supabase-migration-kwitansi.sql` — membuat tabel privat nama penyetor/penerima untuk kwitansi.

## A. Menyiapkan database Supabase

1. Buka https://supabase.com dan buat project baru.
2. Catat **Project URL** dan **anon/public key** dari menu **Project Settings → API**.
3. Buka **SQL Editor → New query**.
4. Salin seluruh isi `supabase-schema.sql`, lalu jalankan.
5. Pastikan tabel `transactions` dan `admin_users` sudah terbentuk di menu **Table Editor**.

## B. Membuat akun administrator

1. Buka menu **Authentication → Users** di Supabase.
2. Tambahkan user administrator dengan email dan password yang akan digunakan pengurus.
3. Salin email tersebut.
4. Di SQL Editor, jalankan query berikut dengan mengganti email contoh:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where email = 'admin@contoh.com'
on conflict (user_id) do nothing;
```

5. Login melalui tombol **Login Pengurus** di aplikasi.

Pembuatan akun dilakukan dari dashboard Supabase. Aplikasi ini tidak menyediakan pendaftaran akun publik.

## C. Menghubungkan aplikasi ke Supabase

Buka `config.js`, lalu isi:

```javascript
window.APP_CONFIG = {
  SUPABASE_URL: "https://PROJECT-ID.supabase.co",
  SUPABASE_ANON_KEY: "ISI_ANON_PUBLIC_KEY"
};
```

Gunakan **anon/public key**, bukan `service_role` key. Simpan file setelah diedit.

## D. Menjalankan aplikasi

### Uji coba lokal
- Letakkan semua file dalam satu folder.
- Jalankan dengan local web server, misalnya ekstensi **Live Server** di Visual Studio Code.
- Buka alamat lokal yang diberikan Live Server.

### Publikasi online
Aplikasi berupa frontend statis sehingga dapat dipublikasikan melalui:
- Netlify
- Vercel
- GitHub Pages

Unggah seluruh file aplikasi, termasuk `config.js` yang sudah diisi. Setelah deployment, buka URL website untuk memastikan dashboard dapat membaca data Supabase.

## E. Cara menggunakan

### Pengunjung
- Membuka URL aplikasi.
- Melihat ringkasan saldo, pemasukan, pengeluaran, dan riwayat transaksi.
- Memilih periode atau jenis transaksi.
- Mencari transaksi berdasarkan kategori atau keterangan.
- Memilih satu bulan pada filter Periode, lalu mengunduh laporan PDF bulanan.

### Administrator
- Login dengan akun yang sudah dimasukkan ke tabel `admin_users`.
- Mengisi tanggal, jenis transaksi, kategori, nominal, dan keterangan.
- Menyimpan transaksi.
- Menggunakan tombol Edit atau Hapus pada baris transaksi.
- Logout setelah selesai.

## F. Keamanan dan catatan penting

- RLS memastikan pengunjung hanya dapat membaca transaksi.
- Operasi tambah, ubah, dan hapus memerlukan akun yang terdaftar pada `admin_users`.
- `anon/public key` memang digunakan di frontend; keamanan tetap bergantung pada kebijakan RLS.
- Jangan pernah membagikan `service_role key` atau password administrator.
- Laporan yang ditampilkan adalah data yang tersimpan di Supabase. Pastikan pengurus memeriksa tanggal, kategori, nominal, dan keterangan sebelum menyimpan.
- Ekspor PDF memerlukan koneksi internet untuk memuat library jsPDF dari CDN.
- Data contoh tidak disertakan agar saldo awal tidak tercampur dengan transaksi sebenarnya. Jika masjid memiliki saldo awal, masukkan sebagai transaksi pemasukan dengan kategori **Lainnya** dan keterangan **Saldo awal**.

## G. Pemeriksaan setelah deployment

1. Buka website tanpa login: data transaksi harus dapat dibaca.
2. Coba tambah transaksi tanpa login: operasi harus ditolak.
3. Login dengan akun yang belum masuk `admin_users`: fitur pengelolaan tidak boleh terbuka.
4. Login dengan akun administrator: tambah, edit, dan hapus transaksi harus berfungsi.
5. Uji filter periode dan unduh PDF.

Jika data tidak tampil, periksa Project URL, anon key, status project Supabase, koneksi internet, serta policy RLS.


## Pembaruan untuk database Supabase yang sudah ada

Project Masjid Al-Ikhlas yang sedang digunakan memiliki tabel `transactions` dengan kolom:
`id`, `date`, `description`, `category`, `kind`, `amount`, `created_at`.

Aplikasi versi kompatibel membaca dan menyimpan data menggunakan struktur tersebut:
- `kind = 'in'` untuk pemasukan.
- `kind = 'out'` untuk pengeluaran.

**Jangan jalankan ulang skema lama yang memakai `transaction_date` dan `type`.**
Untuk project yang tabel `transactions`-nya sudah ada, jalankan file
`supabase-migration-existing-schema.sql` di SQL Editor. Migrasi ini tidak menghapus
atau membuat ulang tabel transaksi. Baris lama `kind = 'in'` tetap dipertahankan.

Setelah itu:
1. Buat akun pengurus di Authentication → Users.
2. Jalankan query pemberian admin di bagian akhir file migrasi dengan email pengurus.
3. Deploy ulang seluruh file frontend dari ZIP terbaru.


## Pembaruan: Profil Masjid, Foto/Logo, dan Kop PDF

Paket ini menambahkan:
- Pengaturan nama dan alamat masjid dari panel administrator.
- Pengaturan desa, kecamatan, kabupaten, nomor WhatsApp, dan email.
- Upload/ganti/hapus foto atau logo masjid (PNG/JPG/WebP, maksimal 2 MB).
- Logo tampil di header aplikasi.
- Identitas dan logo otomatis digunakan sebagai kop laporan PDF.
- Profil dapat dilihat publik, tetapi hanya akun dalam `admin_users` yang dapat mengubahnya.

### Langkah pembaruan database
1. Buka Supabase Dashboard → SQL Editor → New Query.
2. Buka file `supabase-profile-migration.sql` dari paket ini.
3. Salin seluruh isinya, tempel ke SQL Editor, lalu klik Run.
4. Pastikan hasilnya `Success. No rows returned`.

Migrasi ini membuat tabel `mosque_profile` dan bucket Storage `mosque-assets`.
Migrasi tidak menghapus atau mengubah transaksi lama.

### Langkah memperbarui website Netlify
1. Ekstrak ZIP pembaruan ini.
2. Buka folder `kas-dkm-masjid-al-ikhlas-supabase` yang berisi langsung `index.html`, `app.js`, `style.css`, dan `config.js`.
3. Di Netlify, buka site `kas-dkm-alikhlas-pokek`.
4. Buka menu **Deploys**.
5. Gunakan area **Deploy manually / Drag and drop your site output folder** dan unggah folder aplikasi hasil ekstraksi.
6. Setelah deployment selesai, buka kembali URL publik website dan refresh dengan Ctrl+F5.

### Mengubah profil
1. Buka website dan klik Login Pengurus.
2. Login dengan akun administrator.
3. Panel **Pengaturan Profil Masjid** akan muncul.
4. Ubah data yang diperlukan dan pilih foto/logo bila ingin menggantinya.
5. Klik **Simpan Profil Masjid**.
6. Unduh laporan PDF untuk memeriksa kop yang sudah diperbarui.

Catatan: Jangan memasukkan password, nomor rekening pribadi, atau informasi sensitif ke deskripsi publik. Logo yang diunggah bersifat publik karena dipakai pada halaman dan laporan PDF.


## Pembaruan: Kwitansi Pemasukan dan Pengeluaran

Paket ini menambahkan fitur kwitansi per transaksi. Formulir administrator meminta **Nama penyetor** untuk pemasukan dan otomatis berubah menjadi **Nama penerima** untuk pengeluaran. Nama pihak kwitansi disimpan pada tabel terpisah `transaction_receipt_details` yang hanya dapat dibaca dan diubah oleh akun administrator yang terdaftar pada `admin_users`. Nama penyetor/penerima tidak ditampilkan atau tersedia untuk pengunjung publik.

### Migrasi database yang sudah digunakan
1. Buka Supabase Dashboard → SQL Editor → New Query.
2. Buka file `supabase-migration-kwitansi.sql` dari ZIP ini.
3. Salin seluruh isi file, tempel ke SQL Editor, lalu klik Run.
4. Pastikan hasilnya `Success. No rows returned`.
5. Migrasi membuat tabel privat `transaction_receipt_details`; tabel transaksi utama dan seluruh transaksi lama tidak diubah.

### Cara mencetak kwitansi
1. Buka aplikasi dan login sebagai administrator.
2. Isi transaksi baru, termasuk nama penyetor/penerima.
3. Simpan transaksi.
4. Pada bagian Riwayat Transaksi, klik tombol **Kwitansi** di baris transaksi yang diinginkan.
5. File PDF kwitansi akan terunduh dalam ukuran kertas A5 portrait.

Untuk transaksi lama yang dibuat sebelum fitur ini, klik **Edit** dan isi nama penyetor/penerima terlebih dahulu sebelum mencetak kwitansi.

Kwitansi pemasukan menggunakan kalimat **Telah diterima dari**, sedangkan kwitansi pengeluaran menggunakan **Telah diserahkan kepada**. Nomor kwitansi dibuat otomatis berdasarkan jenis, tanggal, dan ID transaksi.


## Pembaruan format kwitansi
- Kwitansi menggunakan halaman landscape dengan ukuran khusus mengikuti contoh.
- Memakai bingkai ganda hijau, kop DKM dengan logo di kiri, dan nomor kwitansi di kanan.
- Memuat nama penyetor/penerima, terbilang, keterangan pembayaran, kategori, dan nominal.
- Area pengesahan menampilkan tanggal transaksi serta tanda tangan Bendahara DKM.
- File `kwitansi-logo.png` disertakan sebagai logo cadangan jika logo profil tidak dapat dimuat.
- Tidak memerlukan migrasi SQL tambahan.

## Tanggal cetak laporan

Pada bagian **Riwayat Transaksi**, pilih tanggal pada kolom **Tanggal cetak laporan** sebelum menekan **Unduh Laporan PDF**. Tanggal yang dipilih akan muncul pada titimangsa di atas tanda tangan Pengelola Kas/Bendahara. Nilai awal otomatis mengikuti tanggal hari ini menurut zona waktu Jakarta. Fitur ini hanya mengubah tanggal yang tercetak pada PDF dan tidak mengubah tanggal transaksi maupun data Supabase.

## Widget jadwal salat berbasis koordinat masjid

Jadwal salat dihitung langsung di browser menggunakan rumus astronomi matahari, tanpa mengambil data dari Kementerian Agama, SIHAT, atau API jadwal eksternal.

- Lokasi: Masjid Al-Ikhlas, Kaunganten, Kecamatan Cikaum, Kabupaten Subang, Jawa Barat.
- Koordinat: latitude `-6.4838794`, longitude `107.7410055`.
- Zona waktu: `Asia/Jakarta` (WIB).
- Parameter perhitungan: Subuh 20°, Isya 18°, Asar metode Syafi'i (faktor bayangan 1), Duha 4,5°, tinggi matahari terbit/terbenam -0,833°, dan Imsak 10 menit sebelum Subuh.
- Jadwal dan hitung mundur waktu salat diperbarui otomatis pada dashboard.
- Semua perhitungan dilakukan di perangkat pengunjung; tidak memerlukan API key atau koneksi ke layanan jadwal pihak ketiga. Hasil dapat berbeda beberapa menit dari jadwal lembaga lain karena parameter perhitungan.
