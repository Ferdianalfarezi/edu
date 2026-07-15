# Bugfix Requirements Document

## Introduction

Modul rapor "input nilai" memiliki beberapa bug kritis yang menyebabkan: validasi DTO menolak input yang seharusnya valid, data tidak tersimpan ke database, race condition pada finalisasi, partial data corruption karena tidak ada transaksi, dan mismatch antara frontend dan backend API. Bug-bug ini berdampak langsung pada kemampuan guru untuk menginput nilai dan wali kelas untuk memfinalisasi rapor.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN guru mengirim POST /rapor/nilai dengan `periode_rapor_id` berisi string enum seperti "uts_semester_1" THEN the system menolak request dengan error validasi "periode_rapor_id harus berupa UUID" karena DTO decorator `@IsUUID('4')` pada field tersebut

1.2 WHEN guru menyimpan nilai untuk 30 siswa dan terjadi error pada siswa ke-15 (network error, crash, constraint violation) THEN the system menyimpan 14 siswa pertama tanpa rollback, menghasilkan data parsial yang korup

1.3 WHEN frontend `RaporInputView` mengirim GET /rapor/nilai dengan query param `periode_id` THEN the system tidak menerima nilai periode karena backend controller membaca `@Query('periode_rapor_id')` — param name tidak cocok

1.4 WHEN guru sudah submit nilai dan menyadari ada kesalahan input THEN the system tidak menyediakan mekanisme un-submit, guru hanya bisa menunggu wali kelas revert seluruh rapor (yang mungkin sudah final)

1.5 WHEN ada perubahan nilai oleh guru (edit draft, re-submit) THEN the system hanya memperbarui field `updatedAt` tanpa mencatat siapa mengubah nilai apa dari berapa ke berapa, sehingga tidak ada audit trail untuk dispute nilai

1.6 WHEN dua user (atau satu user double-click) melakukan POST finalize secara bersamaan THEN the system melewati status check "already final?" pada kedua request karena tidak ada transaksi/locking, menyebabkan duplikasi kalkulasi ranking dan notifikasi ganda ke orang tua

1.7 WHEN guru menyimpan nilai untuk kelas dengan 40 siswa THEN the system menjalankan 80 query individual (1 SELECT + 1 INSERT/UPDATE per siswa) — N+1 problem yang menyebabkan response time lambat

1.8 WHEN guru mengisi tabel nilai 40 siswa × 4 komponen dan browser crash sebelum menekan "Simpan Draft" THEN the system kehilangan seluruh input karena tidak ada mekanisme auto-save periodik

1.9 WHEN guru menekan submit nilai THEN the system hanya memvalidasi format (angka dalam range, huruf valid) tapi TIDAK memvalidasi apakah SEMUA siswa aktif di kelas sudah memiliki nilai — guru bisa submit dengan data tidak lengkap

1.10 WHEN sekolah memiliki mata pelajaran dengan kebutuhan komponen berbeda (Matematika: Tugas Harian + UTS + UAS; Seni: Praktik + Portfolio) THEN the system memaksa semua mapel menggunakan komponen_penilaian yang sama karena komponen bersifat global per tenant

1.11 WHEN wali kelas menyimpan catatan siswa via POST /rapor/nilai/catatan THEN the system hanya memvalidasi wali kelas dan mengembalikan `{ saved: dto.catatan.length }` tanpa benar-benar mempersist data ke database

1.12 WHEN sekolah menggunakan komponen penilaian bertipe "huruf" (A=4, B=3, C=2, D=1) THEN the system mengabaikan komponen tersebut dalam kalkulasi rata-rata karena `calculateRankings` hanya menghitung komponen bertipe "angka"

1.13 WHEN admin ingin mengunci periode input (misal UTS Semester 1 hanya bisa diisi sampai tanggal tertentu) THEN the system tidak menyediakan mekanisme deadline/period lock — guru bisa input kapan saja selama rapor belum final

1.14 WHEN frontend `RaporInputView` memanggil GET /rapor/nilai dan mengharapkan response `{ siswa: [...], komponen: [...] }` THEN the system mengembalikan format `KelasGradeResult` yang berbeda strukturnya (`{ students: [...], komponen_penilaian: [...] }`) karena endpoint yang dipanggil tidak sesuai

### Expected Behavior (Correct)

2.1 WHEN guru mengirim POST /rapor/nilai dengan `periode_rapor_id` berisi string enum ("uts_semester_1", "semester_1", "uts_semester_2", "semester_2") THEN the system SHALL menerima dan memproses request karena DTO menggunakan validasi `@IsEnum` atau `@IsIn` yang sesuai dengan tipe data aktual

2.2 WHEN guru menyimpan nilai untuk N siswa dan terjadi error di tengah proses THEN the system SHALL melakukan rollback seluruh operasi dalam satu database transaction sehingga tidak ada data parsial yang tersimpan

2.3 WHEN frontend mengirim GET /rapor/nilai dengan query param `periode_id` THEN the system SHALL membaca param tersebut dengan nama yang konsisten antara frontend dan backend (keduanya menggunakan `periode_id` atau keduanya menggunakan `periode_rapor_id`)

2.4 WHEN guru sudah submit nilai dan ingin menarik kembali (un-submit) THEN the system SHALL menyediakan endpoint dan UI untuk mengubah status dari "submitted" kembali ke "draft" selama rapor belum difinalkan oleh wali kelas

2.5 WHEN ada perubahan nilai (insert atau update) THEN the system SHALL mencatat audit trail berisi: user_id yang mengubah, timestamp, field yang berubah, nilai lama, dan nilai baru

2.6 WHEN finalisasi rapor dilakukan THEN the system SHALL membungkus seluruh proses (check status → validate → save notes → calculate rankings → update status → send notification) dalam satu database transaction dengan pessimistic locking pada rapor record

2.7 WHEN guru menyimpan nilai untuk kelas THEN the system SHALL menggunakan bulk upsert (single query INSERT...ON CONFLICT UPDATE) untuk seluruh siswa sekaligus, bukan loop per-siswa

2.8 WHEN guru sedang mengisi nilai di frontend THEN the system SHALL melakukan auto-save draft secara periodik (misal setiap 30 detik jika ada perubahan) untuk mencegah kehilangan data akibat crash browser

2.9 WHEN guru menekan submit nilai THEN the system SHALL memvalidasi bahwa SEMUA siswa aktif di kelas memiliki nilai yang terisi pada komponen wajib, dan menolak submit jika ada siswa yang belum lengkap

2.10 WHEN admin mengkonfigurasi komponen penilaian THEN the system SHALL mendukung assignment komponen per mata pelajaran (atau per grup mata pelajaran) sehingga setiap mapel bisa memiliki set komponen berbeda

2.11 WHEN wali kelas menyimpan catatan siswa via POST /rapor/nilai/catatan THEN the system SHALL benar-benar mempersist catatan_wali_kelas dan p5_deskripsi ke database (tabel rapor_nilai atau tabel catatan khusus)

2.12 WHEN sistem menghitung rata-rata untuk peringkat THEN the system SHALL mengkonversi komponen bertipe "huruf" ke bobot numerik (A=4, B=3, C=2, D=1, E=0) dan menyertakannya dalam kalkulasi rata-rata

2.13 WHEN admin mengkonfigurasi periode rapor THEN the system SHALL menyediakan fitur deadline per periode sehingga input nilai otomatis ditolak setelah tanggal batas yang ditentukan

2.14 WHEN frontend memanggil endpoint GET /rapor/nilai dengan query params THEN the system SHALL mengembalikan response dalam format yang konsisten dengan ekspektasi frontend (`{ siswa: [...], komponen: [...] }`) atau frontend disesuaikan untuk membaca format yang benar dari backend

### Unchanged Behavior (Regression Prevention)

3.1 WHEN guru mengirim POST /rapor/nilai dengan `kelas_id` dan `mata_pelajaran_id` berupa UUID valid THEN the system SHALL CONTINUE TO memvalidasi field tersebut sebagai UUID

3.2 WHEN guru menyimpan nilai untuk seluruh siswa tanpa error THEN the system SHALL CONTINUE TO menyimpan semua nilai dan mengembalikan `{ saved: N, rapor_id: ... }`

3.3 WHEN frontend memanggil endpoint lain (GET /rapor/mata-pelajaran, GET /rapor/kelas, POST /rapor/nilai) THEN the system SHALL CONTINUE TO berfungsi normal tanpa perubahan contract

3.4 WHEN rapor sudah difinalkan THEN the system SHALL CONTINUE TO menolak edit nilai oleh guru (ForbiddenException)

3.5 WHEN guru belum di-assign ke mapel+kelas via jadwal THEN the system SHALL CONTINUE TO menolak akses (ForbiddenException "Anda tidak ditugaskan...")

3.6 WHEN wali kelas melakukan finalisasi rapor yang semua mapelnya sudah submitted THEN the system SHALL CONTINUE TO menghitung ranking, mengubah status ke "final", dan mengirim notifikasi ke orang tua

3.7 WHEN nilai angka di luar range skala_min–skala_max THEN the system SHALL CONTINUE TO menolak dengan BadRequestException

3.8 WHEN periode yang dikirim bukan salah satu dari enum valid THEN the system SHALL CONTINUE TO menolak dengan BadRequestException "Periode tidak valid"

3.9 WHEN user bukan wali kelas mencoba finalisasi atau revert rapor THEN the system SHALL CONTINUE TO menolak dengan ForbiddenException

3.10 WHEN rapor sudah berstatus draft dan user mencoba revert THEN the system SHALL CONTINUE TO menolak dengan BadRequestException "Rapor sudah dalam status draft"
