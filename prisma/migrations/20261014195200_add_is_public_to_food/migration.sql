-- AlterTable
ALTER TABLE "Food" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Food_isPublic_idx" ON "Food"("isPublic");
