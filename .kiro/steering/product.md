# Product Overview

**Teman Sekolah** — a multi-tenant school management SaaS platform (Indonesian market).

## Core Modules
1. **Absensi** — Daily student attendance by teachers, offline-capable on mobile
2. **Tagihan/SPP** — Tuition billing, parent payment with proof upload, bendahara verification
3. **Notifikasi** — Push notifications to parents (absence, billing, rapor)
4. **Rapor Online** — Grade input by guru, finalization by wali kelas, visible to parents
5. **RPP/Modul Ajar** — Teaching plan portal shared among teachers per school
6. **Admin & Manajemen** — Student/class/user CRUD, tahun ajaran, kenaikan kelas, jadwal, konfigurasi

## User Roles
| Role | Platform | Auth Method |
|------|----------|-------------|
| super_admin | Web | Email + Password |
| admin | Web | Email + Password |
| kepala_sekolah | Web | Email + Password |
| guru | Web + Mobile | Email + Password |
| bendahara | Web | Email + Password |
| orang_tua | Mobile | Phone number only |

## Multi-Tenancy
- Each tenant = one school
- Complete data isolation between tenants
- Parents with children in multiple schools see all children in one app
- Super admin manages all tenants from a single dashboard

## Language Convention
- UI copy, domain terms, and module names are in **Bahasa Indonesia**
- Code identifiers (variables, functions, types) use Indonesian domain terms in camelCase/PascalCase
- Comments and documentation can be in English or Indonesian
