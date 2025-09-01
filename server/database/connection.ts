import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Use environment variables or fallback values for local development
const dbConfig = {
  user: process.env.PG_USER || "crmuser",
  host: process.env.PG_HOST || "localhost",
  database: process.env.PG_DB || "crm_test",
  password: process.env.PG_PASSWORD || "myl@p@y-crm$102019",
  port: Number(process.env.PG_PORT) || 2019,
  ssl: false,
};

// Log the actual connection parameters being used (hide password for security)
console.log("🔗 Database connection config:", {
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  password: dbConfig.password ? "[SET]" : "[NOT SET]",
  ssl: dbConfig.ssl,
});

const pool = new Pool(dbConfig);

// Add timeout wrapper for database operations
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Database operation timeout")),
        timeoutMs,
      ),
    ),
  ]);
}

// Check if database is available with timeout
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const client = await withTimeout(pool.connect(), 3000);
    await withTimeout(client.query("SELECT 1"), 2000);
    client.release();
    return true;
  } catch (error) {
    console.log("Database availability check failed:", error.message);
    return false;
  }
}

// Initialize database only if available
export async function initializeDatabase() {
  try {
    // Quick connection test first
    const isAvailable = await isDatabaseAvailable();
    if (!isAvailable) {
      console.log("Database not available, skipping initialization");
      console.log("Application will run with mock data");
      return;
    }

    const client = await pool.connect();

    // Check if schema exists before reading large files
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log("Initializing database schema...");

      // Read and execute complete schema
      const schemaPath = path.join(__dirname, "complete-schema.sql");
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, "utf8");
        await client.query(schema);
        console.log("Database schema initialized");
      }

      // Also ensure VC schema is created if not present
      try {
        const vcTableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'vcs'
          );
        `);
        if (!vcTableCheck.rows[0].exists) {
          const vcSchemaPath = path.join(__dirname, "vc-schema.sql");
          if (fs.existsSync(vcSchemaPath)) {
            const vcSchema = fs.readFileSync(vcSchemaPath, "utf8");
            await client.query(vcSchema);
            console.log("VC schema initialized");
          }
        }
      } catch (e) {
        console.log("VC schema init skipped or failed:", e.message);
      }

      // Run migration for notifications and activity logs
      try {
        const migrationPath = path.join(
          __dirname,
          "migration-fix-notifications-activity.sql",
        );
        if (fs.existsSync(migrationPath)) {
          const migration = fs.readFileSync(migrationPath, "utf8");
          await client.query(migration);
          console.log("Migration applied successfully");
        }
      } catch (migrationError) {
        console.log(
          "Migration already applied or error:",
          migrationError.message,
        );
      }

      // Run VC probability column migration
      try {
        const vcMigrationPath = path.join(
          __dirname,
          "add-vc-probability-migration.sql",
        );
        if (fs.existsSync(vcMigrationPath)) {
          const vcMigration = fs.readFileSync(vcMigrationPath, "utf8");
          await client.query(vcMigration);
          console.log("VC probability migration applied successfully");
        }
      } catch (vcMigrationError) {
        console.log(
          "VC probability migration already applied or error:",
          vcMigrationError.message,
        );
      }

      // Run activity log ip_address columns migration
      try {
        const activityIpMigrationPath = path.join(
          __dirname,
          "migration-add-activity-ip-columns.sql",
        );
        if (fs.existsSync(activityIpMigrationPath)) {
          const activityIpMigration = fs.readFileSync(
            activityIpMigrationPath,
            "utf8",
          );
          await client.query(activityIpMigration);
          console.log("Activity log IP columns migration applied successfully");
        }
      } catch (activityIpMigrationError) {
        console.log(
          "Activity log IP columns migration already applied or error:",
          activityIpMigrationError.message,
        );
      }
    } else {
      console.log("Database schema already exists");

      // Ensure VC schema exists even if main schema is present
      try {
        const vcTableCheck = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'vcs'
          );
        `);
        if (!vcTableCheck.rows[0].exists) {
          const vcSchemaPath = path.join(__dirname, "vc-schema.sql");
          if (fs.existsSync(vcSchemaPath)) {
            const vcSchema = fs.readFileSync(vcSchemaPath, "utf8");
            await client.query(vcSchema);
            console.log("VC schema initialized");
          }
        }
      } catch (e) {
        console.log("VC schema init skipped or failed:", e.message);
      }
    }

    // Always try to apply VC schema options migration (even if tables exist)
    try {
      const vcOptionsMigrationPath = path.join(
        __dirname,
        "update-vc-schema-options.sql",
      );
      if (fs.existsSync(vcOptionsMigrationPath)) {
        const vcOptionsMigration = fs.readFileSync(
          vcOptionsMigrationPath,
          "utf8",
        );
        await client.query(vcOptionsMigration);
        console.log("VC schema options migration applied successfully");
      }
    } catch (vcOptionsMigrationError) {
      console.log(
        "VC schema options migration already applied or error:",
        vcOptionsMigrationError.message,
      );
    }

    // Always try to add investor_last_feedback column
    try {
      const investorFeedbackMigrationPath = path.join(
        __dirname,
        "add-investor-last-feedback.sql",
      );
      if (fs.existsSync(investorFeedbackMigrationPath)) {
        const investorFeedbackMigration = fs.readFileSync(
          investorFeedbackMigrationPath,
          "utf8",
        );
        await client.query(investorFeedbackMigration);
        console.log("VC investor_last_feedback migration applied successfully");
      }
    } catch (investorFeedbackError) {
      console.log(
        "VC investor_last_feedback migration already applied or error:",
        investorFeedbackError.message,
      );
    }

    // Always try to apply Azure fields migration (even if tables exist)
    try {
      const azureMigrationPath = path.join(__dirname, "add-azure-fields.sql");
      if (fs.existsSync(azureMigrationPath)) {
        const azureMigration = fs.readFileSync(azureMigrationPath, "utf8");
        await client.query(azureMigration);
        console.log("Azure fields migration applied successfully");
      }
    } catch (azureMigrationError) {
      console.log(
        "Azure fields migration already applied or error:",
        azureMigrationError.message,
      );
    }

    // Always try to apply FinOps clients table migration
    try {
      const finopsClientsMigrationPath = path.join(
        __dirname,
        "create-finops-clients-table.sql",
      );
      if (fs.existsSync(finopsClientsMigrationPath)) {
        const finopsClientsMigration = fs.readFileSync(
          finopsClientsMigrationPath,
          "utf8",
        );
        await client.query(finopsClientsMigration);
        console.log("FinOps clients table migration applied successfully");
      }
    } catch (finopsClientsMigrationError) {
      console.log(
        "FinOps clients table migration already applied or error:",
        finopsClientsMigrationError.message,
      );
    }

    // Always try to apply FinOps client columns migration
    try {
      const finopsClientColumnsMigrationPath = path.join(
        __dirname,
        "add-finops-client-columns.sql",
      );
      if (fs.existsSync(finopsClientColumnsMigrationPath)) {
        const finopsClientColumnsMigration = fs.readFileSync(
          finopsClientColumnsMigrationPath,
          "utf8",
        );
        await client.query(finopsClientColumnsMigration);
        console.log("FinOps client columns migration applied successfully");
      }
    } catch (finopsClientColumnsMigrationError) {
      console.log(
        "FinOps client columns migration already applied or error:",
        finopsClientColumnsMigrationError.message,
      );
    }

    // Always try to apply IST FinOps SLA notifications migration
    try {
      const finopsIstMigrationPath = path.join(
        __dirname,
        "migration-create-finops-sla-notifications-ist.sql",
      );
      if (fs.existsSync(finopsIstMigrationPath)) {
        const finopsIstMigration = fs.readFileSync(
          finopsIstMigrationPath,
          "utf8",
        );
        await client.query(finopsIstMigration);
        console.log(
          "IST FinOps SLA notifications migration applied successfully",
        );
      }
    } catch (finopsIstMigrationError) {
      console.log(
        "IST FinOps SLA notifications migration already applied or error:",
        finopsIstMigrationError.message,
      );
    }

    // await client.query(schema);
    console.log("Database initialized successfully");
    client.release();
  } catch (error) {
    console.error("Database initialization error:", error.message);
    // Don't throw error to allow development without DB
    console.log("Continuing without database connection...");
  }
}

export { pool };
