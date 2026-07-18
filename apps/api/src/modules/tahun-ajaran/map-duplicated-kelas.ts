/**
 * Pure function that represents the duplication field mapping logic.
 * Maps source kelas records to new kelas records for a target tahun ajaran.
 *
 * This is the same logic used inside KelasService.duplicateClassStructure(),
 * extracted for property-based testing without DB dependencies.
 */

export interface SourceKelas {
  nama: string;
  tingkat: number;
  kapasitas: number | null;
}

export interface DuplicatedKelas {
  tenantId: string;
  tahunAjaranId: string;
  nama: string;
  tingkat: number;
  kapasitas: number | null;
  waliKelasId: null;
}

export function mapDuplicatedKelas(
  sourceClasses: SourceKelas[],
  tenantId: string,
  toTahunAjaranId: string,
): DuplicatedKelas[] {
  return sourceClasses.map((src) => ({
    tenantId,
    tahunAjaranId: toTahunAjaranId,
    nama: src.nama,
    tingkat: src.tingkat,
    kapasitas: src.kapasitas,
    waliKelasId: null,
  }));
}
