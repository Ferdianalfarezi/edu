ALTER TABLE "tenant" ADD COLUMN "jumlah_tingkat" integer DEFAULT 6 NOT NULL;
ALTER TABLE "tenant" ADD CONSTRAINT "chk_jumlah_tingkat" CHECK ("tenant"."jumlah_tingkat" BETWEEN 1 AND 13);

-- Adjust existing tenants whose kelas already exceed the default (6)
UPDATE tenant t
SET jumlah_tingkat = sub.max_tingkat
FROM (
  SELECT k.tenant_id, MAX(k.tingkat) AS max_tingkat
  FROM kelas k
  GROUP BY k.tenant_id
  HAVING MAX(k.tingkat) > 6
) sub
WHERE t.id = sub.tenant_id;