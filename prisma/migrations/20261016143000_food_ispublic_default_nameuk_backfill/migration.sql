-- AlterTable
ALTER TABLE "Food" ALTER COLUMN "isPublic" SET DEFAULT true;

-- Backfill: foods saved while the UI was in Ukrainian stored the
-- localized name in "name" with "nameUk" left empty.
UPDATE "Food"
SET "nameUk" = "name"
WHERE "nameUk" IS NULL
  AND "name" ~ '[А-Яа-яІіЇїЄєҐґ]';
