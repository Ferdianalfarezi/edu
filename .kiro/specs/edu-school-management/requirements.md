# Requirements Document

## Introduction

Sistem manajemen sekolah multi-tenant yang terdiri dari dua platform utama:
- **Admin Panel (Web - Vue/React)**: untuk role admin, bendahara, kepala_sekolah, dan guru. Digunakan di desktop/laptop untuk akses dashboard, laporan, dan manajemen data.
- **Aplikasi Mobile (Flutter - Android + iOS)**: untuk role guru dan orang_tua dalam satu aplikasi dengan tampilan UI berbeda berdasarkan role. Guru login dengan email + password, orang tua login dengan nomor telepon saja (tanpa password).

Guru memiliki akses ke kedua platform (Admin_Panel dan Aplikasi_Mobile) sehingga dapat menggunakan platform yang paling sesuai dengan kebutuhan (misal: menggunakan Admin_Panel jika perangkat mobile tidak tersedia atau untuk kenyamanan layar lebih besar).

Sistem mencakup modul: Absensi, Notifikasi, Tagihan/Billing, Admin & Management, Jadwal Pelajaran, Kenaikan Kelas, dan Rapor Online. Sistem dirancang untuk digunakan oleh beberapa sekolah, masing-masing dengan konfigurasi independen. Setiap sekolah memiliki multi-role access (admin, kepala sekolah, guru, bendahara, orang tua). Pembayaran dilakukan melalui upload bukti transfer oleh orang tua dan diverifikasi oleh bendahara, atau dicatat manual oleh bendahara untuk pembayaran tunai.

## Glossary

- **Sistem_Absensi**: Modul yang menangani pencatatan kehadiran siswa harian per kelas
- **Sistem_Notifikasi**: Modul yang mengirim dan menyimpan notifikasi push ke orang tua
- **Sistem_Tagihan**: Modul yang mengelola tagihan SPP, upload bukti transfer, verifikasi pembayaran, dan riwayat pembayaran per siswa
- **Sistem_Admin**: Modul yang mengelola data master (siswa, kelas, tahun ajaran, user) dan autentikasi
- **Sistem_Konfigurasi**: Modul yang menyimpan dan mengelola pengaturan per sekolah (threshold, nominal, dll)
- **Sistem_Jadwal**: Modul yang mengelola jadwal pelajaran per kelas per tahun ajaran
- **Admin_Panel**: Aplikasi web (Vue/React) untuk role admin, kepala sekolah, bendahara, dan guru
- **Aplikasi_Mobile**: Aplikasi mobile (Flutter, Android + iOS) untuk guru dan orang tua siswa. Tampilan UI ditentukan berdasarkan role user yang login
- **SPP**: Sumbangan Pembinaan Pendidikan - biaya bulanan sekolah per siswa
- **Status_Kehadiran**: Enum kehadiran siswa: hadir, izin, sakit, alpa
- **Status_Pembayaran**: Enum status tagihan: belum_bayar, menunggu_verifikasi, cicilan, lunas, ditolak, dibatalkan. Status cicilan mengizinkan Orang_Tua untuk mengupload Bukti_Transfer tambahan guna melunasi sisa tagihan. Status dibatalkan digunakan ketika Bendahara membatalkan tagihan (misal: beasiswa)
- **Bendahara**: Treasurer/petugas keuangan sekolah
- **Kepala_Sekolah**: Principal/kepala sekolah yang menerima laporan
- **Guru**: Teacher yang menginput absensi per kelas
- **Guru_Pengganti**: Substitute teacher yang menggantikan guru utama saat berhalangan
- **Orang_Tua**: Parent yang menerima notifikasi dan melihat tagihan
- **Super_Admin**: Pemilik platform yang mengelola seluruh Tenant (sekolah)
- **Tahun_Ajaran**: Academic year period (contoh: 2024/2025)
- **Rekap_Absensi**: Rangkuman data kehadiran per periode (bulanan/semester)
- **Tenant**: Satu sekolah sebagai unit terpisah dalam sistem multi-tenant
- **Konfigurasi_Sekolah**: Pengaturan yang dapat disesuaikan per sekolah (threshold alpa, nominal SPP, dll)
- **OTP (reserved for future use)**: One-Time Password - fitur verifikasi yang direncanakan untuk implementasi di masa depan
- **Mata_Pelajaran**: Subject/mata pelajaran yang diajarkan (contoh: Matematika, Bahasa Indonesia)
- **Jadwal_Pelajaran**: Class schedule - jadwal mata pelajaran per kelas per hari
- **Bukti_Transfer**: Foto/screenshot bukti transfer pembayaran yang diupload oleh orang tua
- **Alumni**: Siswa yang telah lulus dari tingkat tertinggi sekolah
- **Rapor**: Laporan hasil belajar siswa per periode (UTS atau Semester) yang berisi nilai per mata pelajaran
- **Wali_Kelas**: Guru yang ditunjuk sebagai penanggung jawab satu kelas, bertugas memfinalisasi rapor
- **Sistem_Rapor**: Modul yang mengelola input nilai, finalisasi rapor, dan tampilan rapor ke orang tua. Merupakan bagian dari Sistem_Admin secara teknis namun berdiri sendiri secara fungsional
- **Capaian_Pembelajaran**: Deskripsi naratif tentang pencapaian siswa dalam suatu mata pelajaran (bagian dari Kurikulum Merdeka)
- **P5**: Projek Penguatan Profil Pelajar Pancasila — komponen penilaian deskriptif dalam Kurikulum Merdeka yang bersifat opsional
- **Periode_Rapor**: Waktu penilaian: UTS Semester 1, Semester 1, UTS Semester 2, atau Semester 2

## Requirements

### Requirement 1: Input Absensi Harian

**User Story:** Sebagai guru, saya ingin menginput kehadiran siswa per kelas setiap hari, sehingga data absensi tercatat secara digital dan real-time.

#### Acceptance Criteria

1. WHEN Guru membuka halaman absensi kelas, THE Sistem_Absensi SHALL menampilkan daftar seluruh siswa aktif di kelas tersebut untuk tanggal hari ini
2. WHEN Guru memilih Status_Kehadiran untuk satu siswa, THE Sistem_Absensi SHALL menyimpan record absensi dengan data: siswa_id, kelas_id, tanggal, Status_Kehadiran, dan guru_id
3. THE Sistem_Absensi SHALL membatasi pilihan Status_Kehadiran hanya pada nilai: hadir, izin, sakit, atau alpa
4. WHEN Guru menyimpan absensi kelas, THE Sistem_Absensi SHALL memvalidasi bahwa seluruh siswa dalam kelas memiliki Status_Kehadiran sebelum menyimpan
5. IF Guru mencoba menyimpan absensi dengan siswa yang belum diberi Status_Kehadiran, THEN THE Sistem_Absensi SHALL menampilkan pesan error yang menyebutkan nama siswa yang belum diisi
6. WHEN absensi berhasil disimpan, THE Sistem_Absensi SHALL mengirim event ke Sistem_Notifikasi untuk setiap siswa (termasuk yang hadir)
7. THE Sistem_Absensi SHALL membatasi input absensi hanya untuk Guru yang terjadwal mengajar di kelas tersebut pada hari itu, atau Guru_Pengganti yang ditugaskan
8. THE Sistem_Absensi SHALL menyimpan SATU record absensi per siswa per hari (bukan per jam pelajaran)
9. WHEN Guru pertama yang terjadwal pada hari tersebut membuka halaman absensi untuk kelas, THE Sistem_Absensi SHALL membuat record absensi harian untuk kelas tersebut
10. IF record absensi harian untuk kelas pada tanggal tersebut sudah ada, THEN THE Sistem_Absensi SHALL menampilkan data absensi yang sudah diinput dalam mode read-only untuk Guru lain yang terjadwal (kecuali hak edit sesuai Requirement 2)
11. THE Sistem_Absensi SHALL mengizinkan Guru manapun yang terjadwal untuk kelas tersebut pada hari itu untuk menginput absensi jika belum ada Guru lain yang menginput
12. IF Guru membuka halaman absensi dan tidak ada kelas yang terjadwal untuk hari tersebut, THEN THE Sistem_Absensi SHALL menampilkan pesan "Tidak ada kelas terjadwal untuk hari ini" dan tidak menampilkan opsi input absensi

### Requirement 2: Edit Absensi

**User Story:** Sebagai guru atau kepala sekolah, saya ingin mengedit data absensi yang sudah diinput, sehingga kesalahan input dapat diperbaiki kapan saja.

#### Acceptance Criteria

1. THE Sistem_Absensi SHALL mengizinkan hanya Guru yang terjadwal (atau pernah terjadwal) mengajar di kelas tersebut berdasarkan Jadwal_Pelajaran, dan Kepala_Sekolah, untuk mengubah Status_Kehadiran siswa
2. THE Sistem_Absensi SHALL TIDAK mengizinkan Admin untuk mengedit data absensi
3. WHEN Guru mengubah Status_Kehadiran siswa, THE Sistem_Absensi SHALL memvalidasi bahwa Guru tersebut terjadwal (atau pernah terjadwal) untuk kelas tersebut berdasarkan Jadwal_Pelajaran sebelum mengizinkan perubahan
4. THE Sistem_Absensi SHALL mengizinkan Kepala_Sekolah untuk mengedit absensi kelas manapun di sekolahnya (override power)
5. WHEN Guru atau Kepala_Sekolah mengubah Status_Kehadiran siswa, THE Sistem_Absensi SHALL menyimpan perubahan beserta timestamp update, user_id yang mengubah, role pengubah, dan Status_Kehadiran sebelumnya (audit log)
6. THE Sistem_Absensi SHALL mencatat setiap perubahan absensi dalam log yang mencakup: user_id, role, tanggal_edit, waktu_edit, nilai_sebelum, dan nilai_sesudah

### Requirement 3: Lihat Absensi oleh Guru

**User Story:** Sebagai guru, saya ingin melihat data absensi seluruh kelas di sekolah saya, sehingga saya mengetahui kondisi kehadiran siswa secara umum.

#### Acceptance Criteria

1. WHEN Guru membuka halaman absensi, THE Sistem_Absensi SHALL menampilkan daftar seluruh kelas di sekolah Guru tersebut
2. WHEN Guru memilih kelas tertentu, THE Sistem_Absensi SHALL menampilkan data absensi kelas tersebut untuk tanggal yang dipilih
3. THE Sistem_Absensi SHALL membatasi hak edit absensi hanya untuk kelas yang ditugaskan ke Guru berdasarkan Jadwal_Pelajaran, sementara kelas lain hanya ditampilkan dalam mode read-only

### Requirement 4: Rekap Absensi Bulanan dan Semester

**User Story:** Sebagai kepala sekolah, saya ingin melihat rekap absensi per bulan dan per semester, sehingga saya dapat memantau tingkat kehadiran siswa.

#### Acceptance Criteria

1. WHEN Kepala_Sekolah memilih periode bulanan dan kelas, THE Sistem_Absensi SHALL menampilkan Rekap_Absensi yang berisi jumlah hadir, izin, sakit, dan alpa per siswa untuk bulan tersebut
2. WHEN Kepala_Sekolah memilih periode semester dan kelas, THE Sistem_Absensi SHALL menampilkan Rekap_Absensi yang berisi jumlah hadir, izin, sakit, dan alpa per siswa untuk semester tersebut
3. THE Sistem_Absensi SHALL menghitung persentase kehadiran per siswa sebagai: (jumlah_hadir / total_hari_efektif) × 100
4. WHEN Kepala_Sekolah meminta export laporan, THE Sistem_Absensi SHALL menghasilkan file laporan dalam format yang dapat diunduh
5. THE Sistem_Absensi SHALL menyediakan fitur input total hari efektif per bulan yang dapat diisi oleh Admin atau Kepala_Sekolah
6. THE Sistem_Absensi SHALL menggunakan total hari efektif yang telah diinput untuk menghitung persentase kehadiran per siswa
7. IF total hari efektif belum diinput untuk bulan tertentu, THEN THE Sistem_Absensi SHALL menampilkan pesan bahwa data hari efektif belum tersedia dan tidak menghitung persentase

### Requirement 5: Dashboard Absensi untuk Kepala Sekolah

**User Story:** Sebagai kepala sekolah, saya ingin melihat dashboard ringkasan absensi seluruh sekolah, sehingga saya dapat mengidentifikasi masalah kehadiran secara cepat.

#### Acceptance Criteria

1. WHEN Kepala_Sekolah membuka dashboard absensi, THE Sistem_Absensi SHALL menampilkan ringkasan kehadiran hari ini untuk seluruh kelas
2. THE Sistem_Absensi SHALL menampilkan jumlah total siswa hadir, izin, sakit, dan alpa per kelas pada dashboard
3. WHEN terdapat siswa dengan akumulasi alpa melebihi threshold yang dikonfigurasi di Konfigurasi_Sekolah, THE Sistem_Absensi SHALL menandai siswa tersebut dalam daftar perhatian khusus

### Requirement 6: Notifikasi Real-time ke Orang Tua

**User Story:** Sebagai orang tua, saya ingin menerima notifikasi push secara real-time ketika absensi anak saya dicatat, sehingga saya segera mengetahui status kehadiran anak.

#### Acceptance Criteria

1. WHEN Sistem_Absensi mencatat Status_Kehadiran siswa selain hadir (izin, sakit, alpa) secara online, THE Sistem_Notifikasi SHALL mengirim push notification ke device Orang_Tua siswa tersebut dalam waktu kurang dari 30 detik
2. WHEN Sistem_Absensi mencatat Status_Kehadiran secara offline dan data berhasil disinkronisasi ke server, THE Sistem_Notifikasi SHALL mengirim push notification ke device Orang_Tua siswa tersebut setelah sinkronisasi berhasil
3. THE Sistem_Notifikasi SHALL menyertakan keterangan "Dicatat pada [waktu_input_guru]" dalam isi notifikasi untuk menunjukkan waktu pencatatan asli oleh Guru
4. WHEN Sistem_Absensi mencatat Status_Kehadiran hadir DAN Orang_Tua telah mengaktifkan preferensi notifikasi hadir, THE Sistem_Notifikasi SHALL mengirim push notification ke device Orang_Tua siswa tersebut
5. THE Sistem_Notifikasi SHALL mengatur preferensi notifikasi hadir dengan default OFF untuk setiap Orang_Tua baru
6. THE Sistem_Notifikasi SHALL menyertakan informasi dalam notifikasi: nama siswa, Status_Kehadiran, tanggal, dan nama kelas
7. IF push notification gagal terkirim, THEN THE Sistem_Notifikasi SHALL mencatat kegagalan dalam log dan melakukan retry maksimal 3 kali dengan interval 60 detik
8. WHEN Orang_Tua memiliki lebih dari satu anak di sekolah yang sama, THE Sistem_Notifikasi SHALL mengirim notifikasi terpisah untuk setiap anak

### Requirement 7: Riwayat Notifikasi

**User Story:** Sebagai orang tua, saya ingin melihat riwayat seluruh notifikasi yang pernah diterima, sehingga saya dapat mengecek kembali informasi sebelumnya.

#### Acceptance Criteria

1. WHEN Orang_Tua membuka halaman riwayat notifikasi, THE Sistem_Notifikasi SHALL menampilkan daftar seluruh notifikasi yang pernah dikirim ke Orang_Tua tersebut, diurutkan dari terbaru
2. THE Sistem_Notifikasi SHALL menampilkan status pengiriman notifikasi (terkirim/gagal) pada setiap item riwayat
3. THE Sistem_Notifikasi SHALL menyimpan riwayat notifikasi minimal selama 1 Tahun_Ajaran aktif

### Requirement 8: Lihat Absensi oleh Orang Tua

**User Story:** Sebagai orang tua, saya ingin melihat rekap absensi anak saya langsung di aplikasi, sehingga saya tidak hanya bergantung pada notifikasi.

#### Acceptance Criteria

1. WHEN Orang_Tua membuka halaman absensi anak, THE Sistem_Absensi SHALL menampilkan kalender kehadiran anak untuk bulan berjalan dengan warna berbeda per Status_Kehadiran
2. THE Sistem_Absensi SHALL menampilkan ringkasan total hadir, izin, sakit, dan alpa untuk bulan berjalan
3. WHEN Orang_Tua memilih bulan lain, THE Sistem_Absensi SHALL menampilkan data absensi untuk bulan yang dipilih
4. WHEN Orang_Tua memiliki lebih dari satu anak, THE Sistem_Absensi SHALL memisahkan tampilan absensi per anak

### Requirement 9: Tagihan SPP Bulanan

**User Story:** Sebagai bendahara, saya ingin membuat tagihan SPP per siswa per bulan, sehingga pembayaran sekolah terkelola dengan baik.

#### Acceptance Criteria

1. WHEN Bendahara membuat tagihan untuk bulan tertentu, THE Sistem_Tagihan SHALL menghasilkan record tagihan untuk setiap siswa aktif di sekolah dengan nominal SPP sesuai konfigurasi kelas di Konfigurasi_Sekolah
2. THE Sistem_Tagihan SHALL menyimpan setiap tagihan dengan data: siswa_id, bulan, tahun, nominal, Status_Pembayaran, dan tanggal_jatuh_tempo
3. WHEN tagihan dibuat, THE Sistem_Tagihan SHALL mengatur Status_Pembayaran awal sebagai belum_bayar
4. THE Sistem_Tagihan SHALL mendukung pencatatan beberapa transaksi pembayaran (cicilan) untuk satu tagihan dengan maksimal 2 kali pembayaran per tagihan
5. WHEN Admin menambahkan siswa baru ke kelas yang sudah memiliki tagihan di Tahun_Ajaran aktif, THE Sistem_Tagihan SHALL otomatis membuat tagihan untuk siswa baru mulai dari bulan berjalan sampai akhir Tahun_Ajaran
6. THE Sistem_Tagihan SHALL menentukan nominal tagihan otomatis untuk siswa baru sesuai konfigurasi kelas di Konfigurasi_Sekolah
7. THE Sistem_Tagihan SHALL TIDAK membuat tagihan untuk bulan-bulan sebelum siswa baru ditambahkan ke kelas

### Requirement 10: Generate Tagihan Satu Tahun Ajaran

**User Story:** Sebagai bendahara, saya ingin membuat tagihan SPP untuk seluruh bulan dalam satu tahun ajaran sekaligus, sehingga saya tidak perlu membuat tagihan manual setiap bulan.

#### Acceptance Criteria

1. WHEN Bendahara memilih opsi generate tagihan per Tahun_Ajaran, THE Sistem_Tagihan SHALL menghasilkan tagihan untuk seluruh bulan dalam Tahun_Ajaran yang dipilih bagi setiap siswa aktif
2. THE Sistem_Tagihan SHALL menghitung jumlah bulan berdasarkan tanggal mulai dan tanggal selesai Tahun_Ajaran
3. IF tagihan untuk bulan tertentu sudah ada untuk siswa tertentu, THEN THE Sistem_Tagihan SHALL melewatkan bulan tersebut dan tidak membuat duplikat
4. WHEN proses generate selesai, THE Sistem_Tagihan SHALL menampilkan ringkasan: jumlah tagihan yang dibuat, jumlah yang dilewatkan (duplikat), dan total nominal keseluruhan

### Requirement 11: Upload Bukti Transfer oleh Orang Tua

**User Story:** Sebagai orang tua, saya ingin mengupload bukti transfer pembayaran SPP melalui aplikasi, sehingga saya tidak perlu datang ke sekolah untuk konfirmasi pembayaran.

#### Acceptance Criteria

1. WHEN Orang_Tua memilih tagihan dengan Status_Pembayaran belum_bayar, ditolak, ATAU cicilan, THE Sistem_Tagihan SHALL menampilkan tombol upload Bukti_Transfer
2. WHEN Orang_Tua mengupload Bukti_Transfer, THE Sistem_Tagihan SHALL mewajibkan Orang_Tua menginput nominal_bayar (jumlah yang dibayar) sebelum upload dapat diproses
3. WHILE Status_Pembayaran adalah cicilan, THE Sistem_Tagihan SHALL menampilkan sisa tagihan yang belum dibayar kepada Orang_Tua sehingga Orang_Tua mengetahui berapa yang harus dibayar
4. WHEN Orang_Tua mengupload Bukti_Transfer dengan nominal_bayar, THE Sistem_Tagihan SHALL menyimpan file gambar beserta nominal_bayar dan mengubah Status_Pembayaran menjadi menunggu_verifikasi
5. THE Sistem_Tagihan SHALL membatasi format file upload hanya pada: JPG, JPEG, PNG dengan ukuran maksimal 5MB
6. WHEN upload berhasil, THE Sistem_Tagihan SHALL menampilkan konfirmasi bahwa bukti transfer telah dikirim dan menunggu verifikasi Bendahara
7. THE Sistem_Tagihan SHALL menyimpan metadata upload: tanggal_upload, file_path, nominal_bayar, dan orang_tua_id yang mengupload
8. WHEN Status_Pembayaran adalah menunggu_verifikasi, THE Sistem_Tagihan SHALL mencegah Orang_Tua mengupload ulang sampai Bendahara memberikan keputusan
9. THE Sistem_Tagihan SHALL memvalidasi bahwa nominal_bayar minimal Rp 10.000
10. THE Sistem_Tagihan SHALL memvalidasi bahwa nominal_bayar tidak melebihi sisa tagihan yang belum dibayar
11. IF nominal_bayar kurang dari Rp 10.000, THEN THE Sistem_Tagihan SHALL menolak upload dan menampilkan pesan "Nominal pembayaran minimal Rp 10.000"
12. IF nominal_bayar melebihi sisa tagihan, THEN THE Sistem_Tagihan SHALL menolak upload dan menampilkan pesan "Nominal melebihi sisa tagihan"
13. THE Sistem_Tagihan SHALL membatasi maksimal 2 kali pembayaran cicilan per tagihan (pembayaran pertama dapat berupa jumlah berapa pun minimal Rp 10.000, pembayaran kedua wajib melunasi seluruh sisa tagihan)
14. WHILE tagihan sudah memiliki 1 pembayaran cicilan yang disetujui, THE Sistem_Tagihan SHALL mewajibkan nominal_bayar pada pembayaran kedua sama dengan sisa tagihan yang belum dibayar
15. WHEN Orang_Tua mengupload Bukti_Transfer, THE Sistem_Tagihan SHALL mengkompresi gambar dan mengkonversi ke format WebP sebelum menyimpan
16. THE Sistem_Tagihan SHALL menghapus file Bukti_Transfer yang Status_Pembayaran-nya sudah lunas setelah 3 tahun sejak tanggal verifikasi
17. THE Sistem_Tagihan SHALL tetap menyimpan metadata transaksi (tanggal, nominal, referensi) meskipun file gambar sudah dihapus

### Requirement 12: Verifikasi Pembayaran oleh Bendahara

**User Story:** Sebagai bendahara, saya ingin memverifikasi bukti transfer yang diupload orang tua, sehingga pembayaran hanya dicatat setelah dikonfirmasi valid.

#### Acceptance Criteria

1. WHEN Bendahara membuka halaman verifikasi, THE Sistem_Tagihan SHALL menampilkan daftar seluruh tagihan dengan Status_Pembayaran menunggu_verifikasi beserta preview Bukti_Transfer dan nominal_bayar yang diinput Orang_Tua
2. WHEN Bendahara menyetujui Bukti_Transfer DAN nominal_bayar sama dengan atau melebihi sisa tagihan, THE Sistem_Tagihan SHALL otomatis mengubah Status_Pembayaran menjadi lunas dan mencatat tanggal_verifikasi serta bendahara_id yang memverifikasi
3. WHEN Bendahara menyetujui Bukti_Transfer DAN nominal_bayar kurang dari sisa tagihan, THE Sistem_Tagihan SHALL otomatis mengubah Status_Pembayaran menjadi cicilan dan mencatat tanggal_verifikasi serta bendahara_id yang memverifikasi
4. WHEN Bendahara menolak Bukti_Transfer, THE Sistem_Tagihan SHALL mengubah Status_Pembayaran menjadi ditolak dan mewajibkan Bendahara mengisi alasan penolakan
5. WHEN Bukti_Transfer ditolak, THE Sistem_Tagihan SHALL mengirim notifikasi ke Orang_Tua dengan alasan penolakan
6. WHEN Bukti_Transfer ditolak, THE Sistem_Tagihan SHALL mengizinkan Orang_Tua untuk mengupload ulang Bukti_Transfer baru
7. WHEN Bendahara menyetujui Bukti_Transfer (lunas), THE Sistem_Notifikasi SHALL mengirim push notification ke Orang_Tua dengan informasi: nama siswa, bulan tagihan, nominal yang disetujui, dan Status_Pembayaran baru
8. WHEN Bendahara menyetujui pembayaran cicilan, THE Sistem_Notifikasi SHALL mengirim push notification ke Orang_Tua dengan informasi: nominal yang disetujui dan sisa tagihan yang belum dibayar

### Requirement 13: Pencatatan Pembayaran Manual oleh Bendahara

**User Story:** Sebagai bendahara, saya ingin mencatat pembayaran tunai/manual langsung, sehingga pembayaran yang dilakukan di sekolah tetap tercatat.

#### Acceptance Criteria

1. WHEN Bendahara mencatat pembayaran manual lunas, THE Sistem_Tagihan SHALL mengubah Status_Pembayaran tagihan menjadi lunas dan mencatat tanggal_bayar, jumlah_bayar, dan bendahara_id
2. WHEN Bendahara mencatat pembayaran manual cicilan, THE Sistem_Tagihan SHALL membuat record cicilan dengan jumlah yang dibayar dan mengubah Status_Pembayaran menjadi cicilan
3. WHILE Status_Pembayaran adalah cicilan, THE Sistem_Tagihan SHALL menampilkan sisa tagihan yang belum dibayar
4. WHEN total seluruh cicilan manual mencapai nominal tagihan, THE Sistem_Tagihan SHALL mengubah Status_Pembayaran menjadi lunas secara otomatis
5. THE Sistem_Tagihan SHALL menyimpan setiap transaksi pembayaran manual dengan data: tagihan_id, jumlah_bayar, tanggal_bayar, metode_pembayaran (tunai/transfer_manual), dan catatan opsional
6. THE Sistem_Tagihan SHALL TIDAK membatasi jumlah cicilan untuk pembayaran manual oleh Bendahara (lebih fleksibel dibanding upload via orang tua)
7. THE Sistem_Tagihan SHALL memvalidasi bahwa jumlah pembayaran manual tidak melebihi sisa tagihan yang belum dibayar

### Requirement 14: Riwayat Pembayaran dan Bukti Bayar

**User Story:** Sebagai orang tua, saya ingin melihat riwayat pembayaran SPP anak saya beserta bukti pembayaran, sehingga saya mengetahui tagihan mana yang sudah dan belum dibayar.

#### Acceptance Criteria

1. WHEN Orang_Tua membuka halaman pembayaran, THE Sistem_Tagihan SHALL menampilkan daftar seluruh tagihan anak tersebut beserta Status_Pembayaran masing-masing
2. THE Sistem_Tagihan SHALL menampilkan detail setiap tagihan: bulan, nominal, Status_Pembayaran, tanggal_bayar (jika sudah bayar), dan sisa tagihan (jika cicilan)
3. WHEN Orang_Tua memiliki lebih dari satu anak, THE Sistem_Tagihan SHALL memisahkan tampilan tagihan per anak
4. WHEN pembayaran dicatat (lunas atau cicilan), THE Sistem_Tagihan SHALL menghasilkan bukti pembayaran digital dengan nomor referensi unik
5. THE Sistem_Tagihan SHALL menyertakan informasi pada bukti pembayaran: nama siswa, kelas, bulan tagihan, nominal bayar, tanggal bayar, metode pembayaran, dan nomor referensi
6. WHEN Orang_Tua meminta unduh bukti pembayaran, THE Sistem_Tagihan SHALL menghasilkan file PDF yang dapat diunduh

### Requirement 15: Dashboard Tunggakan untuk Bendahara

**User Story:** Sebagai bendahara, saya ingin melihat dashboard yang menampilkan seluruh tunggakan siswa dan dapat mengexport laporan, sehingga saya dapat melakukan follow-up pembayaran dan pelaporan keuangan.

#### Acceptance Criteria

1. WHEN Bendahara membuka dashboard tunggakan, THE Sistem_Tagihan SHALL menampilkan daftar seluruh tagihan dengan Status_Pembayaran belum_bayar atau cicilan
2. THE Sistem_Tagihan SHALL menampilkan total nominal tunggakan seluruh sekolah pada dashboard
3. THE Sistem_Tagihan SHALL mengurutkan daftar tunggakan berdasarkan tanggal_jatuh_tempo dari yang paling lama
4. WHEN Bendahara memfilter berdasarkan kelas, THE Sistem_Tagihan SHALL menampilkan tunggakan hanya untuk kelas yang dipilih
5. THE Sistem_Tagihan SHALL tetap menampilkan tunggakan siswa yang berstatus pindah_sekolah atau keluar untuk keperluan follow-up
6. WHEN Bendahara meminta export laporan tunggakan, THE Sistem_Tagihan SHALL menghasilkan file dalam format Excel/CSV yang dapat diunduh
7. WHEN Bendahara meminta export laporan pembayaran per periode, THE Sistem_Tagihan SHALL menghasilkan file laporan yang mencakup: seluruh transaksi pembayaran dalam periode yang dipilih, total nominal terbayar, dan total tunggakan
8. THE Sistem_Tagihan SHALL menyertakan data berikut dalam file export: nama siswa, kelas, bulan, nominal, status, dan tanggal bayar

### Requirement 16: Manajemen Data Siswa

**User Story:** Sebagai admin, saya ingin mengelola data siswa lengkap dengan informasi kelas dan orang tua, sehingga data master sekolah selalu akurat.

#### Acceptance Criteria

1. WHEN Admin menambahkan siswa baru, THE Sistem_Admin SHALL menyimpan data: nama lengkap, NISN, kelas_id, jenis kelamin, tanggal lahir, alamat, dan data Orang_Tua (nama, nomor telepon)
2. WHEN Admin mengubah data siswa, THE Sistem_Admin SHALL menyimpan perubahan dan mencatat timestamp perubahan
3. WHEN Admin memindahkan siswa ke kelas lain, THE Sistem_Admin SHALL memperbarui kelas_id siswa dan mencatat riwayat perpindahan
4. IF Admin mencoba menambahkan siswa dengan NISN yang sudah terdaftar di Tenant yang sama, THEN THE Sistem_Admin SHALL menolak penambahan dan menampilkan pesan bahwa NISN sudah digunakan
5. THE Sistem_Admin SHALL mendukung relasi satu Orang_Tua memiliki banyak anak di sekolah yang sama
6. WHEN Admin menandai siswa sebagai pindah_sekolah atau keluar, THE Sistem_Admin SHALL melakukan soft-delete pada data siswa sehingga data tetap tersimpan untuk riwayat namun tersembunyi dari tampilan aktif
7. WHILE siswa berstatus pindah_sekolah atau keluar, THE Sistem_Admin SHALL tetap menyimpan data tagihan yang belum lunas dan menampilkannya di dashboard tunggakan Bendahara
8. THE Sistem_Admin SHALL menyimpan tanggal dan alasan keluarnya siswa (pindah_sekolah/keluar) beserta admin_id yang memproses
9. WHEN semua anak yang terkait dengan nomor telepon Orang_Tua berstatus pindah_sekolah atau keluar di suatu Tenant, THE Sistem_Admin SHALL mencabut akses Orang_Tua ke data Tenant tersebut
10. WHILE Orang_Tua masih memiliki anak aktif di Tenant lain, THE Sistem_Admin SHALL tetap mempertahankan akses Orang_Tua ke Tenant-Tenant tersebut
11. WHEN Admin mengupdate nomor telepon Orang_Tua, THE Sistem_Admin SHALL menginvalidasi token lama dan mewajibkan Orang_Tua login ulang dengan nomor baru
12. THE Sistem_Admin SHALL menyediakan fitur pencarian siswa berdasarkan nama atau NISN
13. THE Sistem_Admin SHALL menyediakan filter siswa berdasarkan: kelas, status (aktif/pindah_sekolah/keluar), dan tahun ajaran

### Requirement 17: Manajemen Kelas dan Tahun Ajaran

**User Story:** Sebagai admin, saya ingin mengelola data kelas dan tahun ajaran, sehingga struktur akademik sekolah terorganisir.

#### Acceptance Criteria

1. WHEN Admin membuat kelas baru, THE Sistem_Admin SHALL menyimpan data: nama kelas, tingkat, wali kelas (guru_id), Tahun_Ajaran, dan kapasitas maksimal
2. WHEN Admin membuat Tahun_Ajaran baru, THE Sistem_Admin SHALL menyimpan data: nama periode (contoh: "2024/2025"), tanggal mulai, dan tanggal selesai
3. WHEN Admin membuat Tahun_Ajaran baru, THE Sistem_Admin SHALL menyimpan dengan status "disiapkan" (belum aktif)
4. WHEN Tahun_Ajaran baru dibuat, THE Sistem_Admin SHALL otomatis menduplikasi seluruh struktur kelas dari Tahun_Ajaran aktif saat ini (nama kelas dan tingkat sama, wali kelas dan siswa kosong)
5. IF Admin mencoba menghapus kelas yang masih memiliki siswa aktif, THEN THE Sistem_Admin SHALL menolak penghapusan dan menampilkan jumlah siswa yang masih terdaftar
6. THE Sistem_Admin SHALL mengizinkan Admin melakukan proses kenaikan kelas (Req 30) dari Tahun_Ajaran aktif ke Tahun_Ajaran "disiapkan" sebelum mengaktifkannya
7. WHEN Admin mengaktifkan Tahun_Ajaran "disiapkan", THE Sistem_Admin SHALL menonaktifkan Tahun_Ajaran sebelumnya dan menjadikan Tahun_Ajaran baru sebagai aktif
8. THE Sistem_Admin SHALL memastikan hanya satu Tahun_Ajaran yang berstatus aktif pada satu waktu per Tenant
9. THE Sistem_Admin SHALL menyimpan seluruh data historis per Tahun_Ajaran: daftar kelas, daftar siswa per kelas, absensi, nilai rapor, dan tagihan
10. WHEN Admin atau Kepala_Sekolah memilih Tahun_Ajaran sebelumnya, THE Sistem_Admin SHALL menampilkan seluruh kelas, siswa per kelas, data absensi, nilai rapor, dan tagihan untuk Tahun_Ajaran tersebut dalam mode read-only
11. THE Sistem_Admin SHALL mengizinkan Admin mengedit, menambah, atau menghapus kelas hasil duplikasi sebelum mulai proses kenaikan kelas
12. THE Sistem_Admin SHALL mewajibkan Admin membuat kelas secara manual hanya pada tahun pertama saat sekolah onboard ke sistem
13. THE Sistem_Admin SHALL mengizinkan Admin menugaskan satu Guru sebagai Wali_Kelas untuk setiap kelas
14. THE Sistem_Admin SHALL memvalidasi bahwa satu Guru hanya dapat menjadi Wali_Kelas untuk satu kelas pada waktu yang sama
15. IF Admin mencoba menugaskan Guru yang sudah menjadi Wali_Kelas di kelas lain, THEN THE Sistem_Admin SHALL menolak penugasan dan menampilkan pesan bahwa Guru tersebut sudah menjadi wali kelas di kelas lain

### Requirement 18: Manajemen User dan Role

**User Story:** Sebagai admin, saya ingin mengelola user dengan role yang berbeda, sehingga setiap pengguna memiliki akses sesuai perannya.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL mendukung enam role: super_admin, admin, kepala_sekolah, guru, bendahara, dan orang_tua
2. WHEN Admin membuat user baru untuk role admin, guru, bendahara, atau kepala_sekolah, THE Sistem_Admin SHALL menyimpan data: nama, email, nomor telepon, role, dan password terenkripsi
3. THE Sistem_Admin SHALL membatasi akses fitur berdasarkan role pengguna sesuai matriks berikut:
   - super_admin: manajemen tenant (tambah/hapus sekolah), lihat seluruh data lintas tenant
   - admin: seluruh fitur dalam Tenant sendiri termasuk Konfigurasi_Sekolah dan manajemen user, export rapor, konfigurasi komponen penilaian, akses melalui Admin_Panel
   - kepala_sekolah: dashboard absensi, rekap absensi, laporan tagihan, audit trail (read-only), lihat rapor seluruh siswa (read-only), akses melalui Admin_Panel
   - guru: input dan edit absensi untuk kelas yang ditugaskan berdasarkan Jadwal_Pelajaran, lihat absensi semua kelas (read-only), lihat jadwal mengajar sendiri, input nilai rapor untuk mata pelajaran yang ditugaskan (hanya via Admin_Panel), akses melalui Aplikasi_Mobile dan Admin_Panel
   - bendahara: seluruh fitur tagihan/billing, verifikasi pembayaran, audit trail, akses melalui Admin_Panel
   - orang_tua: lihat absensi anak, lihat tagihan anak, upload Bukti_Transfer, riwayat notifikasi, preferensi notifikasi, lihat rapor anak, akses melalui Aplikasi_Mobile
4. IF user tanpa role yang sesuai mencoba mengakses fitur yang tidak diizinkan, THEN THE Sistem_Admin SHALL menolak akses dan mengembalikan HTTP 403 Forbidden
5. THE Sistem_Admin SHALL membatasi Admin untuk hanya mengelola user dalam Tenant yang sama
6. WHEN Admin mengupload file CSV/Excel berisi data guru, THE Sistem_Admin SHALL memproses file dan membuat akun guru secara massal
7. THE Sistem_Admin SHALL memvalidasi format file upload guru: kolom wajib meliputi nama, email, dan mata_pelajaran
8. WHEN bulk create guru berhasil, THE Sistem_Admin SHALL menghasilkan password acak untuk setiap guru baru dan mengirimkan kredensial (email + password) ke alamat email masing-masing guru
9. WHEN Guru login untuk pertama kali, THE Sistem_Admin SHALL mewajibkan Guru mengubah password default sebelum dapat mengakses fitur lainnya
10. IF file mengandung email yang sudah terdaftar, THEN THE Sistem_Admin SHALL menampilkan daftar konflik dan melewatkan entry yang duplikat

### Requirement 19: Autentikasi dan Keamanan Login

**User Story:** Sebagai pengguna, saya ingin login secara aman ke sistem sesuai role saya, sehingga data sekolah terlindungi dari akses tidak sah.

#### Acceptance Criteria

1. WHEN user dengan role admin, guru, bendahara, atau kepala_sekolah memasukkan email dan password yang valid melalui Admin_Panel, THE Sistem_Admin SHALL mengautentikasi user dan mengembalikan access token dengan masa berlaku maksimal 24 jam
2. WHEN Orang_Tua memasukkan nomor telepon terdaftar melalui Aplikasi_Mobile, THE Sistem_Admin SHALL memverifikasi bahwa nomor telepon tersebut terdaftar dalam sistem dan langsung mengautentikasi Orang_Tua tanpa memerlukan password atau kode verifikasi
3. WHEN autentikasi Orang_Tua berhasil, THE Sistem_Admin SHALL mengembalikan access token dengan masa berlaku 1 tahun
4. WHEN user Admin_Panel memasukkan password yang salah, THE Sistem_Admin SHALL menolak login dan menampilkan pesan "Email atau password salah" tanpa membedakan mana yang salah
5. IF user Admin_Panel gagal login sebanyak 5 kali berturut-turut, THEN THE Sistem_Admin SHALL mengunci akun selama 15 menit
6. THE Sistem_Admin SHALL menyimpan password menggunakan algoritma hashing yang aman (bcrypt atau argon2)
7. WHEN access token kedaluwarsa, THE Sistem_Admin SHALL menolak request dan mengembalikan HTTP 401 Unauthorized
8. THE Sistem_Admin SHALL menyediakan mekanisme refresh token untuk memperpanjang sesi tanpa login ulang
9. IF nomor telepon Orang_Tua tidak terdaftar dalam sistem, THEN THE Sistem_Admin SHALL menampilkan pesan "Nomor tidak terdaftar, hubungi admin sekolah"
10. WHEN Guru memasukkan email dan password yang valid melalui Aplikasi_Mobile, THE Sistem_Admin SHALL mengautentikasi Guru dan mengembalikan access token dengan masa berlaku 90 hari
11. WHEN autentikasi melalui Aplikasi_Mobile berhasil, THE Aplikasi_Mobile SHALL mendeteksi role dari response autentikasi dan menampilkan UI yang sesuai (UI Guru atau UI Orang_Tua)

### Requirement 20: Reset Password

**User Story:** Sebagai pengguna (admin panel atau aplikasi mobile), saya ingin mereset atau mengubah password saya, sehingga keamanan akun saya tetap terjaga.

#### Acceptance Criteria

1. WHEN user meminta reset password dengan email terdaftar, THE Sistem_Admin SHALL mengirim email berisi link reset password dengan token yang berlaku selama 30 menit
2. WHEN user mengklik link reset password yang valid, THE Sistem_Admin SHALL menampilkan form input password baru
3. IF token reset password sudah kedaluwarsa, THEN THE Sistem_Admin SHALL menolak request dan meminta user mengulangi proses reset
4. WHEN user berhasil mengatur password baru, THE Sistem_Admin SHALL menginvalidasi seluruh token aktif sebelumnya untuk akun tersebut
5. THE Sistem_Admin SHALL mengirim email konfirmasi perubahan password ke email user
6. WHEN Guru meminta reset password melalui Aplikasi_Mobile, THE Sistem_Admin SHALL mengirim email berisi link reset password dengan token yang berlaku selama 30 menit
7. THE Sistem_Admin SHALL menyediakan fitur reset password pada halaman login Admin_Panel dan pada halaman login Aplikasi_Mobile
8. WHEN user yang sudah login ingin mengubah password, THE Sistem_Admin SHALL mewajibkan user memasukkan password lama sebelum mengizinkan perubahan ke password baru
9. WHEN user berhasil mengubah password, THE Sistem_Admin SHALL menginvalidasi seluruh token aktif lainnya (logout dari device lain)

### Requirement 21: Onboarding Orang Tua

**User Story:** Sebagai admin, saya ingin mendaftarkan data orang tua secara massal berdasarkan nomor telepon, sehingga orang tua dapat langsung login dengan nomor telepon tanpa registrasi manual.

#### Acceptance Criteria

1. WHEN Admin mengupload file CSV/Excel berisi data siswa dan nomor telepon orang tua, THE Sistem_Admin SHALL memproses file dan menyimpan relasi siswa-orang_tua berdasarkan nomor telepon
2. THE Sistem_Admin SHALL memvalidasi format file upload: kolom wajib meliputi nama_siswa, NISN, kelas, nama_orang_tua, dan nomor_telepon
3. IF file mengandung nomor telepon yang sudah terdaftar untuk orang tua lain, THEN THE Sistem_Admin SHALL menampilkan daftar konflik dan meminta Admin memilih tindakan (skip/overwrite)
4. WHEN Orang_Tua membuka Aplikasi_Mobile dan memasukkan nomor telepon, THE Sistem_Admin SHALL mencocokkan nomor tersebut dengan data siswa yang terdaftar secara otomatis
5. WHEN nomor telepon cocok dengan lebih dari satu siswa, THE Sistem_Admin SHALL menampilkan seluruh anak yang terkait dengan nomor tersebut secara otomatis
6. IF nomor telepon tidak ditemukan dalam sistem, THEN THE Sistem_Admin SHALL menampilkan pesan "Nomor tidak terdaftar, hubungi admin sekolah"
7. WHEN Admin memperbarui nomor telepon orang tua, THE Sistem_Admin SHALL mengupdate relasi dan mengizinkan orang tua login dengan nomor baru
8. THE Sistem_Admin SHALL mengizinkan satu nomor telepon terdaftar di beberapa Tenant (sekolah) secara independen
9. WHEN Orang_Tua login, THE Aplikasi_Mobile SHALL menampilkan seluruh anak dari seluruh sekolah yang terkait dengan nomor telepon tersebut dalam satu tampilan
10. THE Aplikasi_Mobile SHALL mengelompokkan data anak berdasarkan sekolah (Tenant) untuk kejelasan navigasi
11. THE Sistem_Admin SHALL membatasi tampilan lintas-Tenant hanya untuk role orang_tua; seluruh role lain tetap mengakses data single-Tenant
12. WHEN Orang_Tua memiliki anak di beberapa sekolah, THE Aplikasi_Mobile SHALL menampilkan data absensi, tagihan, dan notifikasi untuk anak dari seluruh sekolah tanpa perlu berpindah akun

### Requirement 22: Konfigurasi Dinamis Per Sekolah

**User Story:** Sebagai admin sekolah, saya ingin mengatur konfigurasi yang spesifik untuk sekolah saya, sehingga sistem sesuai dengan kebijakan masing-masing sekolah.

#### Acceptance Criteria

1. THE Sistem_Konfigurasi SHALL menyimpan konfigurasi terpisah per Tenant (sekolah)
2. THE Sistem_Konfigurasi SHALL mendukung pengaturan berikut per sekolah: threshold alpa untuk perhatian khusus (default: 3 hari/bulan), nominal SPP per tingkat kelas, tanggal jatuh tempo tagihan default, dan nama sekolah beserta logo
3. WHEN Admin mengubah konfigurasi sekolah, THE Sistem_Konfigurasi SHALL menyimpan perubahan dan menerapkannya secara langsung tanpa restart sistem
4. THE Sistem_Konfigurasi SHALL menggunakan nilai default untuk konfigurasi yang belum diatur oleh Admin sekolah

### Requirement 23: Multi-Tenant Isolation

**User Story:** Sebagai penyedia layanan, saya ingin setiap sekolah terisolasi datanya, sehingga tidak ada kebocoran data antar sekolah.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL memastikan setiap query data difilter berdasarkan tenant_id (school_id) dari user yang sedang login
2. IF user mencoba mengakses data milik Tenant lain, THEN THE Sistem_Admin SHALL menolak akses dan mengembalikan HTTP 403 Forbidden
3. THE Sistem_Admin SHALL menyimpan tenant_id pada setiap tabel utama (siswa, kelas, tagihan, absensi, user, jadwal)
4. WHEN Admin membuat data baru, THE Sistem_Admin SHALL secara otomatis menyertakan tenant_id sesuai sekolah Admin tersebut
5. WHERE Orang_Tua memiliki nomor telepon yang terdaftar di beberapa Tenant, THE Sistem_Admin SHALL mengizinkan Orang_Tua melihat data anak dari seluruh Tenant terkait melalui satu sesi login

### Requirement 24: Manajemen Tenant oleh Super Admin

**User Story:** Sebagai super admin (pemilik platform), saya ingin menambah dan menghapus sekolah yang menggunakan sistem, sehingga saya dapat mengelola pelanggan.

#### Acceptance Criteria

1. WHEN Super_Admin menambahkan Tenant baru, THE Sistem_Admin SHALL membuat record sekolah dengan data: nama sekolah, alamat, nomor telepon, dan email kontak
2. WHEN Super_Admin menambahkan Tenant baru, THE Sistem_Admin SHALL membuat satu user Admin default untuk sekolah tersebut dengan kredensial yang dikirim via email
3. WHEN Super_Admin menonaktifkan Tenant, THE Sistem_Admin SHALL memblokir seluruh login untuk user dalam Tenant tersebut
4. THE Sistem_Admin SHALL membatasi akses manajemen Tenant hanya untuk role super_admin
5. WHEN Super_Admin membuka dashboard, THE Sistem_Admin SHALL menampilkan daftar seluruh Tenant beserta status aktif/nonaktif dan jumlah user

### Requirement 25: Preferensi Notifikasi Orang Tua

**User Story:** Sebagai orang tua, saya ingin mengatur preferensi notifikasi yang saya terima, sehingga saya hanya menerima notifikasi yang relevan.

#### Acceptance Criteria

1. WHEN Orang_Tua membuka halaman pengaturan notifikasi, THE Sistem_Notifikasi SHALL menampilkan opsi toggle untuk: notifikasi kehadiran (hadir), notifikasi ketidakhadiran (izin/sakit/alpa)
2. THE Sistem_Notifikasi SHALL mengatur default preferensi: notifikasi ketidakhadiran ON, notifikasi kehadiran OFF
3. WHEN Orang_Tua mengubah preferensi notifikasi, THE Sistem_Notifikasi SHALL menyimpan perubahan dan menerapkannya mulai dari notifikasi berikutnya
4. THE Sistem_Notifikasi SHALL menyimpan preferensi notifikasi terpisah per anak jika Orang_Tua memiliki lebih dari satu anak

### Requirement 26: Offline Mode untuk Guru (Aplikasi_Mobile)

**User Story:** Sebagai guru, saya ingin tetap dapat menginput absensi melalui Aplikasi_Mobile meskipun tidak ada koneksi internet, sehingga proses absensi tidak terganggu oleh masalah jaringan.

Catatan: Offline mode hanya berlaku untuk Aplikasi_Mobile. WHEN Guru menggunakan Admin_Panel, koneksi internet diperlukan untuk seluruh operasi.

#### Acceptance Criteria

1. WHILE perangkat Guru tidak memiliki koneksi internet pada Aplikasi_Mobile, THE Sistem_Absensi SHALL menyimpan data absensi secara lokal di perangkat
2. WHEN koneksi internet tersedia kembali, THE Sistem_Absensi SHALL melakukan sinkronisasi otomatis data absensi lokal ke server
3. IF terdapat konflik data antara data lokal dan data server (record yang sama diedit dari dua sumber), THEN THE Sistem_Absensi SHALL menyelesaikan konflik dengan strategi last-write-wins berdasarkan timestamp
4. THE Sistem_Absensi SHALL menampilkan indikator visual yang menunjukkan status koneksi (online/offline) pada halaman absensi Guru
5. WHILE terdapat data absensi yang belum tersinkronisasi, THE Sistem_Absensi SHALL menampilkan daftar antrian data yang menunggu sinkronisasi kepada Guru
6. WHEN sinkronisasi berhasil untuk semua data dalam antrian, THE Sistem_Absensi SHALL menampilkan konfirmasi bahwa seluruh data telah tersimpan di server

### Requirement 27: Jadwal Pelajaran

**User Story:** Sebagai admin, saya ingin membuat jadwal pelajaran per kelas per semester, sehingga guru otomatis ditugaskan ke kelas berdasarkan jadwal dan absensi terkontrol.

#### Acceptance Criteria

1. WHEN Admin membuat Jadwal_Pelajaran, THE Sistem_Jadwal SHALL menyimpan data: kelas_id, hari, jam_mulai, jam_selesai, mata_pelajaran_id, guru_id, tahun_ajaran_id, semester (1 atau 2), tanggal_mulai_berlaku, dan tanggal_selesai_berlaku
2. THE Sistem_Jadwal SHALL memberlakukan Jadwal_Pelajaran selama satu semester berdasarkan tanggal_mulai_berlaku dan tanggal_selesai_berlaku
3. THE Sistem_Jadwal SHALL mengizinkan satu Guru mengajar di beberapa kelas pada waktu yang sama (tanpa validasi konflik jadwal)
4. THE Sistem_Jadwal SHALL menentukan penugasan Guru ke kelas secara otomatis berdasarkan Jadwal_Pelajaran yang aktif pada semester berjalan
5. WHEN Guru membuka halaman absensi, THE Sistem_Absensi SHALL menampilkan hanya kelas yang terjadwal untuk Guru tersebut pada hari itu berdasarkan jadwal semester aktif sebagai kelas yang dapat diinput
6. THE Sistem_Jadwal SHALL mendukung satu Guru mengajar lebih dari satu Mata_Pelajaran
7. WHEN Admin mengubah atau menghapus Jadwal_Pelajaran, THE Sistem_Jadwal SHALL menyimpan perubahan dan mencatat timestamp serta admin_id yang mengubah
8. THE Sistem_Jadwal SHALL mengizinkan Admin mengedit Jadwal_Pelajaran kapanpun selama periode berlaku semester tersebut
9. WHEN semester berganti, THE Sistem_Jadwal SHALL mewajibkan Admin membuat Jadwal_Pelajaran baru untuk semester berikutnya
10. THE Sistem_Jadwal SHALL menyimpan Jadwal_Pelajaran semester sebelumnya sebagai referensi historis (Guru mana mengajar kelas mana pada semester tertentu)

### Requirement 28: Guru Pengganti

**User Story:** Sebagai admin atau guru, saya ingin menugaskan guru pengganti ketika guru utama berhalangan, sehingga proses absensi tetap berjalan.

#### Acceptance Criteria

1. WHEN Admin atau Guru utama menugaskan Guru_Pengganti untuk kelas tertentu pada tanggal tertentu, THE Sistem_Jadwal SHALL menyimpan record penugasan: guru_pengganti_id, kelas_id, tanggal, mata_pelajaran_id, ditugaskan_oleh, dan timestamp
2. WHILE Guru_Pengganti ditugaskan untuk kelas pada tanggal tersebut, THE Sistem_Absensi SHALL memberikan hak akses input absensi kepada Guru_Pengganti untuk kelas dan tanggal yang ditentukan
3. THE Sistem_Absensi SHALL membatasi Guru_Pengganti hanya untuk input absensi baru, dan tidak mengizinkan edit absensi historis untuk kelas tersebut
4. WHEN penugasan Guru_Pengganti berakhir (tanggal berlalu), THE Sistem_Absensi SHALL mencabut hak akses input absensi Guru_Pengganti untuk kelas tersebut secara otomatis

### Requirement 29: Audit Trail untuk Billing

**User Story:** Sebagai kepala sekolah, saya ingin melihat jejak audit seluruh aktivitas billing, sehingga transparansi keuangan sekolah terjaga.

#### Acceptance Criteria

1. WHEN terjadi aksi pada Sistem_Tagihan (buat tagihan, catat pembayaran, setujui/tolak upload, edit nominal, hapus tagihan, batalkan tagihan), THE Sistem_Tagihan SHALL menyimpan record audit yang mencakup: user_id, timestamp, jenis_aksi, nilai_sebelum, dan nilai_sesudah
2. THE Sistem_Tagihan SHALL menjamin bahwa record audit bersifat immutable (tidak dapat dihapus atau dimodifikasi setelah dibuat)
3. WHEN Bendahara atau Admin membuka halaman audit trail, THE Sistem_Tagihan SHALL menampilkan daftar seluruh aktivitas billing diurutkan dari terbaru
4. WHEN Kepala_Sekolah membuka halaman audit trail, THE Sistem_Tagihan SHALL menampilkan data audit dalam mode read-only
5. THE Sistem_Tagihan SHALL menyimpan audit trail untuk setiap perubahan Status_Pembayaran beserta alasan perubahan (jika ada)

### Requirement 30: Kenaikan Kelas Massal

**User Story:** Sebagai admin, saya ingin mempromosikan seluruh siswa dalam satu kelas ke tingkat berikutnya di akhir tahun ajaran, sehingga proses kenaikan kelas efisien.

#### Acceptance Criteria

1. WHEN Admin memilih kelas asal dan kelas tujuan untuk kenaikan kelas, THE Sistem_Admin SHALL menampilkan daftar seluruh siswa aktif di kelas asal
2. WHEN Admin mengkonfirmasi kenaikan kelas, THE Sistem_Admin SHALL memindahkan seluruh siswa yang dipilih ke kelas tujuan pada Tahun_Ajaran baru
3. THE Sistem_Admin SHALL menyediakan opsi untuk mengecualikan siswa tertentu dari kenaikan kelas (siswa yang tidak naik kelas)
4. WHILE siswa dikecualikan dari kenaikan kelas, THE Sistem_Admin SHALL mempertahankan siswa di kelas semula atau mengizinkan Admin menugaskan ke kelas lain secara manual
5. THE Sistem_Admin SHALL menyimpan riwayat kelas siswa: siswa berada di kelas X selama Tahun_Ajaran Y
6. WHEN proses kenaikan kelas selesai, THE Sistem_Admin SHALL menampilkan ringkasan: jumlah siswa naik kelas, jumlah siswa yang dikecualikan, dan kelas tujuan
7. WHEN Admin membuka menu kenaikan kelas, THE Sistem_Admin SHALL menampilkan suggest kelas tujuan berdasarkan tingkat +1 dari kelas asal
8. WHEN kelas asal adalah tingkat tertinggi (misal kelas 6 SD), THE Sistem_Admin SHALL menandai siswa sebagai "lulus" dan menawarkan opsi untuk mengubah status siswa menjadi Alumni
9. IF Tahun_Ajaran baru belum aktif atau belum ada kelas tujuan, THEN THE Sistem_Admin SHALL menampilkan pesan error dan meminta Admin mengaktifkan Tahun_Ajaran baru terlebih dahulu
10. WHEN siswa naik kelas ke Tahun_Ajaran baru, THE Sistem_Tagihan SHALL tetap menyimpan tagihan yang belum lunas dari Tahun_Ajaran sebelumnya dan menampilkannya di dashboard tunggakan Bendahara

### Requirement 31: Manajemen Mata Pelajaran

**User Story:** Sebagai admin, saya ingin mengelola daftar mata pelajaran sekolah, sehingga jadwal pelajaran dapat dibuat dengan referensi mata pelajaran yang benar.

#### Acceptance Criteria

1. WHEN Admin membuat Mata_Pelajaran baru, THE Sistem_Admin SHALL menyimpan data: nama mata pelajaran dan kode (opsional)
2. THE Sistem_Admin SHALL menyimpan Mata_Pelajaran per Tenant sehingga setiap sekolah memiliki daftar mata pelajaran sendiri
3. WHEN Admin menghapus Mata_Pelajaran, THE Sistem_Admin SHALL memvalidasi bahwa mata pelajaran tidak sedang digunakan dalam Jadwal_Pelajaran aktif
4. IF Mata_Pelajaran masih digunakan dalam Jadwal_Pelajaran aktif, THEN THE Sistem_Admin SHALL menolak penghapusan dan menampilkan daftar jadwal yang masih menggunakan mata pelajaran tersebut
5. THE Sistem_Admin SHALL mendukung penugasan satu Guru ke satu atau lebih Mata_Pelajaran

### Requirement 32: Deaktivasi Guru

**User Story:** Sebagai admin, saya ingin menonaktifkan akun guru yang sudah tidak mengajar, sehingga data tetap bersih dan slot jadwal yang kosong dapat segera diisi.

#### Acceptance Criteria

1. WHEN Admin menonaktifkan user Guru, THE Sistem_Admin SHALL menghapus Guru tersebut dari seluruh Jadwal_Pelajaran aktif
2. WHEN Guru dihapus dari Jadwal_Pelajaran, THE Sistem_Admin SHALL menampilkan daftar slot jadwal yang menjadi kosong dan memerlukan penggantian guru
3. THE Sistem_Admin SHALL menandai slot Jadwal_Pelajaran yang kehilangan Guru sebagai "vacant" pada halaman manajemen jadwal
4. WHEN Admin membuka halaman manajemen jadwal, THE Sistem_Admin SHALL menyoroti (highlight) seluruh slot jadwal berstatus "vacant" yang memerlukan penugasan guru baru
5. THE Sistem_Admin SHALL menampilkan peringatan kepada Admin: "X slot jadwal kosong, silakan assign guru pengganti" setelah deaktivasi Guru berhasil
6. WHEN Guru yang dinonaktifkan adalah Wali_Kelas, THE Sistem_Admin SHALL menghapus status Wali_Kelas dari kelas tersebut dan meminta Admin menugaskan Wali_Kelas baru
7. IF kelas tidak memiliki Wali_Kelas, THEN THE Sistem_Admin SHALL menampilkan peringatan pada halaman manajemen kelas bahwa kelas tersebut belum memiliki wali kelas
8. THE Sistem_Admin SHALL mengizinkan Wali_Kelas yang baru ditugaskan untuk langsung melanjutkan proses finalisasi rapor yang tertunda

### Requirement 33: Lihat Jadwal Mengajar oleh Guru

**User Story:** Sebagai guru, saya ingin melihat jadwal mengajar saya, sehingga saya mengetahui kelas mana yang harus saya ajar setiap hari.

#### Acceptance Criteria

1. WHEN Guru membuka halaman jadwal, THE Sistem_Jadwal SHALL menampilkan jadwal mengajar Guru tersebut untuk hari ini sebagai default
2. THE Sistem_Jadwal SHALL menyediakan filter hari sehingga Guru dapat melihat jadwal untuk hari lain dalam seminggu
3. THE Sistem_Jadwal SHALL menampilkan informasi per slot jadwal: nama kelas, mata pelajaran, jam mulai, dan jam selesai
4. THE Sistem_Jadwal SHALL menandai slot jadwal yang memiliki Guru_Pengganti yang ditugaskan (menunjukkan bahwa Guru utama tidak perlu hadir)

### Requirement 34: Manajemen Tagihan oleh Bendahara

**User Story:** Sebagai bendahara, saya ingin menghapus, mengedit, atau membatalkan tagihan, sehingga kesalahan administrasi dapat diperbaiki.

#### Acceptance Criteria

1. WHEN Bendahara menghapus tagihan, THE Sistem_Tagihan SHALL memvalidasi bahwa tagihan tersebut masih berstatus belum_bayar (orang tua belum melakukan action apapun)
2. IF tagihan sudah berstatus menunggu_verifikasi, cicilan, atau lunas, THEN THE Sistem_Tagihan SHALL menolak penghapusan dan menampilkan pesan bahwa tagihan tidak dapat dihapus karena sudah ada aktivitas pembayaran
3. WHEN Bendahara mengedit nominal tagihan, THE Sistem_Tagihan SHALL memvalidasi bahwa tagihan tersebut masih berstatus belum_bayar (belum ada pembayaran atau cicilan apapun)
4. IF Bendahara mencoba mengedit nominal tagihan yang sudah berstatus menunggu_verifikasi, cicilan, atau lunas, THEN THE Sistem_Tagihan SHALL menolak perubahan dan menampilkan pesan bahwa nominal tidak dapat diubah karena sudah ada aktivitas pembayaran
5. WHEN Bendahara membatalkan tagihan untuk siswa tertentu (misal: beasiswa), THE Sistem_Tagihan SHALL mengubah Status_Pembayaran menjadi "dibatalkan" dan mencatat alasan pembatalan
6. THE Sistem_Tagihan SHALL hanya mengizinkan pembatalan tagihan yang berstatus belum_bayar (belum ada pembayaran apapun dari orang tua)
7. THE Sistem_Tagihan SHALL mencatat seluruh aksi hapus, edit, dan batalkan tagihan dalam audit trail

### Requirement 35: Pagination pada Daftar Data

**User Story:** Sebagai pengguna sistem, saya ingin daftar data ditampilkan dengan pagination, sehingga performa aplikasi tetap optimal saat data bertambah banyak.

#### Acceptance Criteria

1. THE Sistem SHALL menerapkan pagination pada seluruh daftar data dengan default 20 item per halaman
2. THE Sistem SHALL menerapkan pagination pada: daftar siswa, riwayat notifikasi, riwayat pembayaran, dashboard tunggakan, audit trail, dan daftar verifikasi pembayaran
3. THE Sistem SHALL menyediakan navigasi halaman (next/previous) dan informasi total halaman pada setiap daftar yang menerapkan pagination

### Requirement 36: Konfigurasi Komponen Penilaian

**User Story:** Sebagai admin, saya ingin mengatur komponen penilaian rapor sesuai kurikulum sekolah, sehingga format rapor dapat disesuaikan dengan kebutuhan masing-masing sekolah.

#### Acceptance Criteria

1. THE Sistem_Admin SHALL menyediakan template default Kurikulum Merdeka dengan komponen: Nilai Akhir (angka 0-100) per mata pelajaran dan Capaian Pembelajaran (deskripsi naratif) per mata pelajaran
2. THE Sistem_Admin SHALL mengizinkan Admin mengkustomisasi komponen penilaian per sekolah: menambah, mengubah, atau menghapus komponen (misal: menambah Tugas Harian, UTS, UAS sebagai sub-komponen)
3. THE Sistem_Admin SHALL menyimpan konfigurasi komponen penilaian per Tenant
4. THE Sistem_Admin SHALL mengizinkan Admin menentukan skala penilaian per komponen: angka (0-100), huruf (A/B/C/D/E), atau deskripsi naratif
5. THE Sistem_Admin SHALL mengizinkan Admin menentukan komponen mana yang wajib diisi dan mana yang opsional
6. THE Sistem_Admin SHALL menyediakan field opsional untuk P5 (Projek Penguatan Profil Pelajar Pancasila) berupa deskripsi naratif per dimensi yang dapat diisi atau dikosongkan oleh Wali Kelas

### Requirement 37: Input Nilai oleh Guru

**User Story:** Sebagai guru, saya ingin menginput nilai siswa untuk mata pelajaran yang saya ajar, sehingga data rapor terisi sesuai hasil belajar siswa.

#### Acceptance Criteria

1. WHEN Guru membuka halaman input nilai, THE Sistem_Rapor SHALL menampilkan hanya mata pelajaran yang ditugaskan ke Guru tersebut berdasarkan Jadwal_Pelajaran
2. WHEN Guru memilih mata pelajaran dan kelas, THE Sistem_Rapor SHALL menampilkan daftar seluruh siswa aktif di kelas tersebut beserta komponen penilaian yang harus diisi
3. WHEN Guru memilih periode UTS, THE Sistem_Rapor SHALL mewajibkan pengisian nilai angka saja (komponen deskripsi bersifat opsional)
4. WHEN Guru memilih periode Semester, THE Sistem_Rapor SHALL mewajibkan pengisian nilai angka DAN deskripsi/capaian pembelajaran per mata pelajaran
5. THE Sistem_Rapor SHALL memvalidasi bahwa nilai angka berada dalam rentang skala yang dikonfigurasi (default: 0-100)
6. THE Sistem_Rapor SHALL mengizinkan Guru menyimpan nilai secara parsial (draft) sebelum seluruh siswa terisi lengkap
7. WHEN Guru menyimpan nilai draft, THE Sistem_Rapor SHALL menandai status sebagai "draft" dan belum dikirim ke wali kelas
8. WHEN Guru menyelesaikan input seluruh siswa, THE Sistem_Rapor SHALL mengizinkan Guru mengirim (submit) nilai ke Wali Kelas untuk review
9. THE Sistem_Rapor SHALL membatasi Guru hanya dapat menginput dan mengedit nilai untuk mata pelajaran yang ditugaskan berdasarkan Jadwal_Pelajaran
10. THE Sistem_Rapor SHALL menyediakan fitur input nilai rapor hanya melalui Admin_Panel (web); fitur ini tidak tersedia di Aplikasi_Mobile

### Requirement 38: Finalisasi Rapor oleh Wali Kelas

**User Story:** Sebagai wali kelas, saya ingin mereview dan memfinalisasi seluruh nilai di kelas saya, sehingga rapor yang dilihat orang tua sudah lengkap dan akurat.

#### Acceptance Criteria

1. WHEN Wali Kelas membuka halaman finalisasi rapor, THE Sistem_Rapor SHALL menampilkan status input nilai per mata pelajaran: berapa guru yang sudah submit, berapa yang belum
2. IF ada mata pelajaran yang belum di-submit oleh guru, THEN THE Sistem_Rapor SHALL menampilkan peringatan dan mencegah finalisasi sampai seluruh nilai ter-submit
3. WHEN seluruh nilai mata pelajaran sudah di-submit oleh guru, THE Sistem_Rapor SHALL mengizinkan Wali Kelas mereview seluruh nilai per siswa
4. THE Sistem_Rapor SHALL mengizinkan Wali Kelas mengisi field P5 (opsional) berupa deskripsi naratif per dimensi Profil Pelajar Pancasila
5. THE Sistem_Rapor SHALL mengizinkan Wali Kelas menambahkan catatan wali kelas (komentar umum tentang siswa) pada rapor
6. WHEN Wali Kelas memfinalisasi rapor, THE Sistem_Rapor SHALL menghitung peringkat/ranking siswa berdasarkan rata-rata nilai seluruh mata pelajaran
7. WHEN Wali Kelas memfinalisasi rapor, THE Sistem_Rapor SHALL mengubah status rapor menjadi "final" dan membuat rapor visible (dapat dilihat) oleh Orang_Tua di Aplikasi_Mobile
8. THE Sistem_Rapor SHALL mencegah guru mengedit nilai setelah rapor difinalkan oleh Wali Kelas
9. THE Sistem_Rapor SHALL mengizinkan Wali Kelas membatalkan finalisasi (revert ke draft) jika perlu koreksi — setelah revert, rapor tidak lagi visible ke orang tua sampai difinalkan ulang
10. WHEN Wali Kelas memfinalisasi rapor, THE Sistem_Notifikasi SHALL mengirim push notification ke seluruh Orang_Tua siswa di kelas tersebut dengan informasi: "Rapor [Periode_Rapor] telah tersedia untuk dilihat"
11. WHEN Kepala_Sekolah membuka halaman rapor di Admin_Panel, THE Sistem_Rapor SHALL menampilkan seluruh rapor untuk semua kelas dan semua periode (termasuk yang berstatus draft dan final) dalam mode read-only, dengan indikator status pada setiap rapor
12. THE Sistem_Rapor SHALL mengizinkan Kepala_Sekolah memfilter rapor berdasarkan kelas, periode, dan tahun ajaran

### Requirement 39: Lihat Rapor oleh Orang Tua

**User Story:** Sebagai orang tua, saya ingin melihat rapor anak saya di aplikasi, sehingga saya mengetahui perkembangan akademik anak.

#### Acceptance Criteria

1. WHEN Orang_Tua membuka halaman rapor anak, THE Aplikasi_Mobile SHALL menampilkan daftar periode rapor yang tersedia (UTS Semester 1, Semester 1, UTS Semester 2, Semester 2)
2. THE Aplikasi_Mobile SHALL hanya menampilkan rapor yang sudah berstatus "final" (sudah difinalkan oleh Wali Kelas)
3. WHEN Orang_Tua memilih periode rapor, THE Aplikasi_Mobile SHALL menampilkan: daftar nilai per mata pelajaran, deskripsi/capaian pembelajaran (jika ada), P5 (jika diisi), catatan wali kelas, dan peringkat siswa di kelas
4. WHEN Orang_Tua memiliki lebih dari satu anak, THE Aplikasi_Mobile SHALL memisahkan tampilan rapor per anak
5. THE Aplikasi_Mobile SHALL menampilkan ringkasan rapor: rata-rata nilai, peringkat, dan jumlah mata pelajaran

### Requirement 40: Export Rapor oleh Admin

**User Story:** Sebagai admin, saya ingin mengexport data rapor ke format Excel, sehingga data dapat digunakan untuk pelaporan ke dinas atau keperluan administrasi lainnya.

#### Acceptance Criteria

1. WHEN Admin meminta export rapor per kelas per periode, THE Sistem_Admin SHALL menghasilkan file Excel yang berisi seluruh nilai siswa dalam kelas tersebut
2. THE Sistem_Admin SHALL menyertakan data dalam file export: nama siswa, NISN, seluruh komponen nilai per mata pelajaran, rata-rata, dan peringkat
3. THE Sistem_Admin SHALL hanya mengizinkan export untuk rapor yang sudah berstatus "final"
4. THE Sistem_Admin SHALL menyediakan format export generic (tabel standar) yang dapat disesuaikan oleh sekolah untuk kebutuhan dinas masing-masing
