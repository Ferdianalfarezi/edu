# Requirements Document

## Introduction

Fitur Reset Password memungkinkan superadmin untuk mereset password pengguna (admin, kepala_sekolah, guru, bendahara) langsung dari halaman daftar user di dashboard superadmin. Ketika direset, sistem membuat password baru secara acak, mengirim email notifikasi ke user yang bersangkutan, dan memaksa user untuk mengganti password pada saat login berikutnya.

**Catatan konteks**: Backend sudah memiliki endpoint `POST /users/:id/reset-password` dan service method `resetPassword()` yang berfungsi. Yang perlu dibuat adalah: (1) email template baru khusus untuk notifikasi password-direset-oleh-superadmin, (2) tombol dan dialog konfirmasi di frontend.

## Glossary

- **Superadmin**: Pengguna dengan role `super_admin` yang dapat mengelola user lintas tenant
- **User**: Pengguna dengan role `admin`, `kepala_sekolah`, `guru`, atau `bendahara` yang dapat direset passwordnya
- **Password_Generator**: Komponen backend yang menghasilkan password acak menggunakan `crypto.randomBytes`
- **Email_Service**: Queue-based email processor (`EmailProcessor`) yang mengirim email via Gmail API
- **Reset_Password_Dialog**: Komponen modal konfirmasi di frontend sebelum aksi reset dijalankan
- **Password_Reset_Email**: Email notifikasi yang dikirim ke user berisi password baru sementara
- **must_change_password**: Field boolean di tabel `user` yang memaksa user mengganti password saat login berikutnya
- **Audit_Log**: Sistem pencatatan aksi yang sudah terintegrasi via `AuditInterceptor`

---

## Requirements

### Requirement 1: Tampilan Tombol Reset Password di Tabel User

**User Story:** Sebagai superadmin, saya ingin melihat tombol "Reset Password" di setiap baris tabel user, sehingga saya dapat dengan mudah menemukan dan memulai aksi reset untuk user manapun.

#### Acceptance Criteria

1. IF pengguna yang login memiliki role `super_admin` AND user pada baris tabel memiliki role `admin`, `kepala_sekolah`, `guru`, atau `bendahara`, THEN THE User_Management_Page SHALL menampilkan tombol "Reset Password" pada kolom Aksi di baris tersebut.
2. IF pengguna yang login memiliki role `super_admin` AND user pada baris tabel memiliki role `super_admin`, THEN THE User_Management_Page SHALL TIDAK menampilkan tombol "Reset Password" pada baris tersebut.
3. IF user pada baris tabel memiliki field `email` bernilai `null`, string kosong, atau string yang hanya berisi spasi, THEN THE User_Management_Page SHALL menonaktifkan (disabled, tidak dapat diklik) tombol "Reset Password" pada baris tersebut.
4. THE User_Management_Page SHALL menampilkan tombol "Reset Password" menggunakan `variant="purple"` pada komponen `ActionButton`.

---

### Requirement 2: Dialog Konfirmasi Reset Password

**User Story:** Sebagai superadmin, saya ingin melihat dialog konfirmasi sebelum reset password dieksekusi, sehingga saya tidak mereset password secara tidak sengaja.

#### Acceptance Criteria

1. WHEN superadmin mengklik tombol "Reset Password" pada baris user, THE Reset_Password_Dialog SHALL tampil berisi nama lengkap user yang akan direset.
2. THE Reset_Password_Dialog SHALL menampilkan dua tombol: "Batal" dan "Ya, Reset".
3. WHEN superadmin mengklik tombol "Batal", mengklik area luar dialog, ATAU menekan tombol Escape, THE Reset_Password_Dialog SHALL tertutup tanpa melakukan aksi apapun.
4. WHEN superadmin mengklik tombol "Ya, Reset", THE Reset_Password_Dialog SHALL menonaktifkan tombol "Ya, Reset" dan menampilkan indikator loading untuk mencegah duplikasi klik; WHEN reset berhasil, THE Reset_Password_Dialog SHALL tertutup dan menampilkan notifikasi sukses.
5. WHEN API reset password mengembalikan error, THE Reset_Password_Dialog SHALL mengaktifkan kembali tombol "Ya, Reset", menyembunyikan indikator loading, dan menampilkan notifikasi error tanpa menutup dialog.
6. THE Reset_Password_Dialog SHALL menggunakan komponen `BaseModal` yang sudah ada di sistem.

---

### Requirement 3: Eksekusi Reset Password di Backend

**User Story:** Sebagai superadmin, saya ingin sistem secara otomatis membuat password baru saat aksi reset dikonfirmasi, sehingga proses reset aman dan tidak memerlukan input manual.

#### Acceptance Criteria

1. WHEN endpoint `POST /users/:id/reset-password` dipanggil dengan `id` user yang valid, THE User_Service SHALL membuat password acak minimal 12 karakter yang mengandung kombinasi huruf besar, huruf kecil, angka, dan karakter simbol.
2. WHEN password baru dibuat, THE User_Service SHALL menyimpan hash password baru dan menetapkan `must_change_password = true` secara atomik dalam satu transaksi database, sehingga jika salah satu gagal keduanya di-rollback.
3. WHEN reset password berhasil, THE endpoint SHALL mengembalikan HTTP 200 tanpa menyertakan password plaintext di response body.
4. IF user dengan `id` yang diberikan tidak ditemukan, THEN THE User_Service SHALL mengembalikan HTTP 404 dengan pesan "User tidak ditemukan".
5. IF pengguna yang memanggil endpoint tidak memiliki role `super_admin`, THEN THE endpoint SHALL mengembalikan HTTP 403 Forbidden.
6. WHEN aksi reset password berhasil, THE Audit_Log SHALL mencatat aksi `password_reset` dengan `entityType: 'user'` dan `entityId` berisi id user yang direset.

---

### Requirement 4: Email Notifikasi Password Baru

**User Story:** Sebagai user yang passwordnya direset, saya ingin menerima email berisi password baru saya, sehingga saya dapat segera login kembali.

#### Acceptance Criteria

1. WHEN reset password berhasil dieksekusi, THE Email_Service SHALL menambahkan job ke email queue dengan informasi penerima (alamat email user), nama user, dan password baru plaintext (sebelum di-hash) sebagai payload.
2. WHEN Email_Service memproses job tersebut, THE Email_Service SHALL mengirim email ke alamat email user yang direset.
3. WHEN Email_Service gagal mengirim email (SMTP error atau queue error), THE Email_Service SHALL mencatat error ke log tanpa membatalkan operasi reset password yang sudah berhasil disimpan ke database.
4. THE Password_Reset_Email SHALL memuat nama user, password baru yang bersifat sementara dan wajib diganti pada saat login pertama, dan instruksi langkah-langkah login.
5. THE Password_Reset_Email SHALL memuat peringatan bahwa email ini dikirim karena aksi administrator, bukan permintaan user sendiri.
6. IF email user bernilai `null`, string kosong, atau string yang hanya berisi spasi, THEN THE User_Service SHALL mengembalikan `BadRequestException` dengan pesan "User tidak memiliki alamat email" tanpa melanjutkan proses reset password.
7. THE Password_Reset_Email SHALL menggunakan format dan struktur HTML yang konsisten dengan email-email lain yang dikirim oleh sistem (font, warna, layout, dan branding yang sama).

---

### Requirement 5: Notifikasi Hasil di Frontend

**User Story:** Sebagai superadmin, saya ingin mendapat notifikasi yang jelas tentang hasil aksi reset password, sehingga saya tahu apakah operasi berhasil atau gagal.

#### Acceptance Criteria

1. WHEN API reset password mengembalikan respons sukses (HTTP 200), THE User_Management_Page SHALL menampilkan notifikasi sukses dengan pesan "Password berhasil direset dan email telah dikirim ke [email user]".
2. WHEN API reset password mengembalikan error (HTTP 4xx atau 5xx) AND response body mengandung pesan error yang dapat dibaca, THEN THE User_Management_Page SHALL menampilkan notifikasi error dengan pesan tersebut; IF response body tidak mengandung pesan error yang dapat dibaca, THEN THE User_Management_Page SHALL menampilkan pesan fallback "Gagal mereset password. Silakan coba lagi.".
3. WHEN reset password berhasil, THE Reset_Password_Dialog SHALL tertutup secara otomatis.
4. THE User_Management_Page SHALL menampilkan notifikasi (sukses maupun error) yang tetap terlihat selama minimal 5000ms sebelum menghilang secara otomatis.

---

### Requirement 6: Pembatasan Akses dan Visibilitas

**User Story:** Sebagai admin sekolah, saya tidak ingin melihat atau dapat menggunakan fitur reset password yang hanya diperuntukkan bagi superadmin, sehingga tidak ada kebingungan atas hak akses.

#### Acceptance Criteria

1. IF pengguna yang login memiliki role `super_admin`, THEN THE User_Management_Page SHALL menampilkan tombol "Reset Password" pada baris user yang memenuhi syarat.
2. IF pengguna yang login TIDAK memiliki role `super_admin`, THEN THE User_Management_Page SHALL TIDAK menampilkan tombol "Reset Password" pada baris manapun.
3. WHEN pengguna dengan role selain `super_admin` memanggil endpoint `POST /users/:id/reset-password`, THE API SHALL mengembalikan HTTP 403 Forbidden dengan pesan "Akses ditolak" tanpa melakukan perubahan apapun pada data user.
4. WHEN endpoint `POST /users/:id/reset-password` dipanggil dengan `id` yang mengacu pada user dengan role `super_admin`, THE API SHALL mengembalikan HTTP 403 Forbidden dengan pesan "Tidak dapat mereset password superadmin" tanpa melakukan perubahan apapun.
5. WHEN superadmin memanggil endpoint `POST /users/:id/reset-password` dengan `id` miliknya sendiri, THE API SHALL mengembalikan HTTP 403 Forbidden tanpa melakukan perubahan apapun.
