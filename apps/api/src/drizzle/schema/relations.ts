import { relations } from 'drizzle-orm';
import { tenant } from './tenant';
import { user } from './user';
import { tahunAjaran } from './tahun-ajaran';
import { kelas } from './kelas';
import { siswa } from './siswa';
import { mataPelajaran } from './mata-pelajaran';
import { jadwalPelajaran, guruPengganti } from './jadwal';
import { absensi, absensiAudit } from './absensi';

// --- Tenant relations ---
export const tenantRelations = relations(tenant, ({ many }) => ({
  users: many(user),
  tahunAjaran: many(tahunAjaran),
  kelas: many(kelas),
  siswa: many(siswa),
  mataPelajaran: many(mataPelajaran),
}));

// --- User relations ---
export const userRelations = relations(user, ({ one, many }) => ({
  tenant: one(tenant, {
    fields: [user.tenantId],
    references: [tenant.id],
  }),
  kelasAsWali: many(kelas, { relationName: 'waliKelas' }),
  siswaAsOrangTua: many(siswa, { relationName: 'orangTua' }),
  siswaProcessedBy: many(siswa, { relationName: 'processedBy' }),
}));

// --- Tahun Ajaran relations ---
export const tahunAjaranRelations = relations(tahunAjaran, ({ one, many }) => ({
  tenant: one(tenant, {
    fields: [tahunAjaran.tenantId],
    references: [tenant.id],
  }),
  kelas: many(kelas),
}));

// --- Kelas relations ---
export const kelasRelations = relations(kelas, ({ one, many }) => ({
  tenant: one(tenant, {
    fields: [kelas.tenantId],
    references: [tenant.id],
  }),
  tahunAjaran: one(tahunAjaran, {
    fields: [kelas.tahunAjaranId],
    references: [tahunAjaran.id],
  }),
  waliKelas: one(user, {
    fields: [kelas.waliKelasId],
    references: [user.id],
    relationName: 'waliKelas',
  }),
  siswa: many(siswa),
}));

// --- Siswa relations ---
export const siswaRelations = relations(siswa, ({ one }) => ({
  tenant: one(tenant, {
    fields: [siswa.tenantId],
    references: [tenant.id],
  }),
  kelas: one(kelas, {
    fields: [siswa.kelasId],
    references: [kelas.id],
  }),
  orangTua: one(user, {
    fields: [siswa.orangTuaId],
    references: [user.id],
    relationName: 'orangTua',
  }),
  processedBy: one(user, {
    fields: [siswa.processedBy],
    references: [user.id],
    relationName: 'processedBy',
  }),
}));

// --- Mata Pelajaran relations ---
export const mataPelajaranRelations = relations(mataPelajaran, ({ one }) => ({
  tenant: one(tenant, {
    fields: [mataPelajaran.tenantId],
    references: [tenant.id],
  }),
}));

// --- Jadwal Pelajaran relations ---
export const jadwalPelajaranRelations = relations(jadwalPelajaran, ({ one }) => ({
  tenant: one(tenant, {
    fields: [jadwalPelajaran.tenantId],
    references: [tenant.id],
  }),
  kelas: one(kelas, {
    fields: [jadwalPelajaran.kelasId],
    references: [kelas.id],
  }),
  mataPelajaran: one(mataPelajaran, {
    fields: [jadwalPelajaran.mataPelajaranId],
    references: [mataPelajaran.id],
  }),
  guru: one(user, {
    fields: [jadwalPelajaran.guruId],
    references: [user.id],
    relationName: 'jadwalGuru',
  }),
  tahunAjaran: one(tahunAjaran, {
    fields: [jadwalPelajaran.tahunAjaranId],
    references: [tahunAjaran.id],
  }),
}));

// --- Guru Pengganti relations ---
export const guruPenggantiRelations = relations(guruPengganti, ({ one }) => ({
  tenant: one(tenant, {
    fields: [guruPengganti.tenantId],
    references: [tenant.id],
  }),
  guru: one(user, {
    fields: [guruPengganti.guruPenggantiId],
    references: [user.id],
    relationName: 'guruPenggantiUser',
  }),
  kelas: one(kelas, {
    fields: [guruPengganti.kelasId],
    references: [kelas.id],
  }),
  mataPelajaran: one(mataPelajaran, {
    fields: [guruPengganti.mataPelajaranId],
    references: [mataPelajaran.id],
  }),
  ditugaskanOleh: one(user, {
    fields: [guruPengganti.ditugaskanOleh],
    references: [user.id],
    relationName: 'guruPenggantiAssigner',
  }),
}));

// --- Absensi relations ---
export const absensiRelations = relations(absensi, ({ one, many }) => ({
  tenant: one(tenant, {
    fields: [absensi.tenantId],
    references: [tenant.id],
  }),
  siswa: one(siswa, {
    fields: [absensi.siswaId],
    references: [siswa.id],
  }),
  kelas: one(kelas, {
    fields: [absensi.kelasId],
    references: [kelas.id],
  }),
  guru: one(user, {
    fields: [absensi.guruId],
    references: [user.id],
    relationName: 'absensiGuru',
  }),
  audits: many(absensiAudit),
}));

// --- Absensi Audit relations ---
export const absensiAuditRelations = relations(absensiAudit, ({ one }) => ({
  absensi: one(absensi, {
    fields: [absensiAudit.absensiId],
    references: [absensi.id],
  }),
  user: one(user, {
    fields: [absensiAudit.userId],
    references: [user.id],
    relationName: 'absensiAuditUser',
  }),
}));
