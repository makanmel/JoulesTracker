-- Rename all tables, columns, indexes and constraints to lowercase
-- snake_case so raw SQL no longer needs quoted mixed-case identifiers.
-- "User" was especially fragile: user is a reserved word in PostgreSQL.
-- Triggers follow table renames automatically; the audit function is
-- rewritten because its INSERT references the old table/column names.

-- Tables
ALTER TABLE "User" RENAME TO users;
ALTER TABLE "Food" RENAME TO foods;
ALTER TABLE "MealEntry" RENAME TO meal_entries;
ALTER TABLE "DailyTarget" RENAME TO daily_targets;
ALTER TABLE "_DeleteAudit" RENAME TO delete_audit;

-- Columns: users
ALTER TABLE users RENAME COLUMN "onboardingState" TO onboarding_state;
ALTER TABLE users RENAME COLUMN "passwordHash" TO password_hash;
ALTER TABLE users RENAME COLUMN "googleSubject" TO google_subject;
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
ALTER TABLE users RENAME COLUMN "weightKg" TO weight_kg;
ALTER TABLE users RENAME COLUMN "heightCm" TO height_cm;
ALTER TABLE users RENAME COLUMN "birthDate" TO birth_date;
ALTER TABLE users RENAME COLUMN "activityLevel" TO activity_level;

-- Columns: foods
ALTER TABLE foods RENAME COLUMN "nameUk" TO name_uk;
ALTER TABLE foods RENAME COLUMN "caloriesPer100g" TO calories_per_100g;
ALTER TABLE foods RENAME COLUMN "proteinPer100g" TO protein_per_100g;
ALTER TABLE foods RENAME COLUMN "carbsPer100g" TO carbs_per_100g;
ALTER TABLE foods RENAME COLUMN "fatPer100g" TO fat_per_100g;
ALTER TABLE foods RENAME COLUMN "fiberPer100g" TO fiber_per_100g;
ALTER TABLE foods RENAME COLUMN "sugarPer100g" TO sugar_per_100g;
ALTER TABLE foods RENAME COLUMN "saturatedFatPer100g" TO saturated_fat_per_100g;
ALTER TABLE foods RENAME COLUMN "saltPer100g" TO salt_per_100g;
ALTER TABLE foods RENAME COLUMN "isDefault" TO is_default;
ALTER TABLE foods RENAME COLUMN "isPublic" TO is_public;
ALTER TABLE foods RENAME COLUMN "createdById" TO created_by_id;
ALTER TABLE foods RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE foods RENAME COLUMN "updatedAt" TO updated_at;

-- Columns: meal_entries
ALTER TABLE meal_entries RENAME COLUMN "userId" TO user_id;
ALTER TABLE meal_entries RENAME COLUMN "foodId" TO food_id;
ALTER TABLE meal_entries RENAME COLUMN "quantityGrams" TO quantity_grams;
ALTER TABLE meal_entries RENAME COLUMN "mealDate" TO meal_date;
ALTER TABLE meal_entries RENAME COLUMN "mealType" TO meal_type;
ALTER TABLE meal_entries RENAME COLUMN "calculatedCalories" TO calculated_calories;
ALTER TABLE meal_entries RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE meal_entries RENAME COLUMN "updatedAt" TO updated_at;

-- Columns: daily_targets
ALTER TABLE daily_targets RENAME COLUMN "userId" TO user_id;
ALTER TABLE daily_targets RENAME COLUMN "targetDate" TO target_date;
ALTER TABLE daily_targets RENAME COLUMN "targetCalories" TO target_calories;
ALTER TABLE daily_targets RENAME COLUMN "proteinPct" TO protein_pct;
ALTER TABLE daily_targets RENAME COLUMN "carbsPct" TO carbs_pct;
ALTER TABLE daily_targets RENAME COLUMN "fatPct" TO fat_pct;
ALTER TABLE daily_targets RENAME COLUMN "fiberGrams" TO fiber_grams;
ALTER TABLE daily_targets RENAME COLUMN "saltGrams" TO salt_grams;
ALTER TABLE daily_targets RENAME COLUMN "sugarGrams" TO sugar_grams;
ALTER TABLE daily_targets RENAME COLUMN "saturatedFatGrams" TO saturated_fat_grams;
ALTER TABLE daily_targets RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE daily_targets RENAME COLUMN "updatedAt" TO updated_at;

-- Columns: delete_audit
ALTER TABLE delete_audit RENAME COLUMN "tableName" TO table_name;
ALTER TABLE delete_audit RENAME COLUMN "rowCount" TO row_count;
ALTER TABLE delete_audit RENAME COLUMN "deletedAt" TO deleted_at;
ALTER TABLE delete_audit RENAME COLUMN "applicationName" TO application_name;
ALTER TABLE delete_audit RENAME COLUMN "clientAddr" TO client_addr;
ALTER TABLE delete_audit RENAME COLUMN "dbUser" TO db_user;
ALTER TABLE delete_audit RENAME COLUMN "sessionUser" TO session_username;

-- Sequence backing delete_audit.id (SERIAL)
ALTER SEQUENCE "_DeleteAudit_id_seq" RENAME TO delete_audit_id_seq;

-- Indexes (standalone and unique-index backed constraints)
ALTER INDEX "User_email_key" RENAME TO users_email_key;
ALTER INDEX "User_googleSubject_key" RENAME TO users_google_subject_key;
ALTER INDEX "Food_isDefault_idx" RENAME TO foods_is_default_idx;
ALTER INDEX "Food_isPublic_idx" RENAME TO foods_is_public_idx;
ALTER INDEX "Food_barcode_idx" RENAME TO foods_barcode_idx;
ALTER INDEX "MealEntry_userId_mealDate_idx" RENAME TO meal_entries_user_id_meal_date_idx;
ALTER INDEX "DailyTarget_userId_targetDate_key" RENAME TO daily_targets_user_id_target_date_key;

-- Primary keys (renames constraint + backing index)
ALTER TABLE users RENAME CONSTRAINT "User_pkey" TO users_pkey;
ALTER TABLE foods RENAME CONSTRAINT "Food_pkey" TO foods_pkey;
ALTER TABLE meal_entries RENAME CONSTRAINT "MealEntry_pkey" TO meal_entries_pkey;
ALTER TABLE daily_targets RENAME CONSTRAINT "DailyTarget_pkey" TO daily_targets_pkey;
ALTER TABLE delete_audit RENAME CONSTRAINT "_DeleteAudit_pkey" TO delete_audit_pkey;

-- Foreign keys
ALTER TABLE foods RENAME CONSTRAINT "Food_createdById_fkey" TO foods_created_by_id_fkey;
ALTER TABLE meal_entries RENAME CONSTRAINT "MealEntry_userId_fkey" TO meal_entries_user_id_fkey;
ALTER TABLE meal_entries RENAME CONSTRAINT "MealEntry_foodId_fkey" TO meal_entries_food_id_fkey;
ALTER TABLE daily_targets RENAME CONSTRAINT "DailyTarget_userId_fkey" TO daily_targets_user_id_fkey;

-- Audit function: rewrite with new identifiers. Triggers stay attached
-- to the renamed tables and keep calling this function.
CREATE OR REPLACE FUNCTION audit_row_deletes() RETURNS trigger AS $$
BEGIN
    INSERT INTO delete_audit (table_name, row_count, application_name, client_addr, db_user, session_username)
    SELECT
        TG_TABLE_NAME,
        COUNT(*)::int,
        current_setting('application_name', true),
        host(inet_client_addr()),
        current_user,
        session_user
    FROM old_rows;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
