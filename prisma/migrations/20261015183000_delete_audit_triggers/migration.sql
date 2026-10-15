-- Audit trail for row deletions on user-data tables.
-- Repeated unexplained wipes made it impossible to tell whether deletes came
-- from app code, tests, or a manual SQL session. This trigger records the
-- caller (application_name, client address, DB user) on every DELETE.
-- Non-blocking by design: legitimate deletes (e.g. meal removal, test
-- cleanup on *_test databases) must keep working.

CREATE TABLE IF NOT EXISTS "_DeleteAudit" (
    "id" SERIAL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "deletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationName" TEXT,
    "clientAddr" TEXT,
    "dbUser" TEXT,
    "sessionUser" TEXT
);

CREATE OR REPLACE FUNCTION audit_row_deletes() RETURNS trigger AS $$
BEGIN
    INSERT INTO "_DeleteAudit" ("tableName", "rowCount", "applicationName", "clientAddr", "dbUser", "sessionUser")
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

CREATE OR REPLACE TRIGGER audit_delete_user
    AFTER DELETE ON "User"
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION audit_row_deletes();

CREATE OR REPLACE TRIGGER audit_delete_meal_entry
    AFTER DELETE ON "MealEntry"
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION audit_row_deletes();

CREATE OR REPLACE TRIGGER audit_delete_daily_target
    AFTER DELETE ON "DailyTarget"
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION audit_row_deletes();

CREATE OR REPLACE TRIGGER audit_delete_food
    AFTER DELETE ON "Food"
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION audit_row_deletes();
