import { Handler } from "@netlify/functions";
import { initializeDatabase, pool } from "../../server/database/connection";

export const handler: Handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[pulse-sync] START ${startedAt}`);
  try {
    try {
      await initializeDatabase();
      console.log("[pulse-sync] Database initialized");
    } catch (dbErr: any) {
      console.warn(
        "[pulse-sync] Database init warning:",
        dbErr?.message || dbErr,
      );
    }

    // Ensure idempotency table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS finops_external_alerts (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL,
      subtask_id INTEGER NOT NULL,
      alert_key TEXT NOT NULL,
      title TEXT,
      next_call_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(task_id, subtask_id, alert_key)
    )
    `);

    // Find overdue subtasks not yet sent
    const overdue = await pool.query(
      `
      SELECT
        t.id as task_id,
        t.task_name,
        t.client_name,
        t.assigned_to,
        t.reporting_managers,
        t.escalation_managers,
        st.id as subtask_id,
        st.name as subtask_name
      FROM finops_subtasks st
      JOIN finops_tasks t ON t.id = st.task_id
      WHERE st.status = 'overdue'
        AND t.is_active = true
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM finops_external_alerts fea
          WHERE fea.task_id = t.id AND fea.subtask_id = st.id AND fea.alert_key = 'replica_down_overdue'
        )
      ORDER BY st.id DESC
      LIMIT 100
    `,
    );

    let sent = 0;
    for (const row of overdue.rows) {
      const taskName = row.task_name || "Unknown Task";
      const clientName = row.client_name || "Unknown Client";
      const title = `Please take immediate action on the overdue subtask "${row.subtask_name}" under the task "${taskName}" for the client "${clientName}".`;

      // Reserve to avoid duplicates
      const reserve = await pool.query(
        `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_key, title)
         VALUES ($1, $2, 'replica_down_overdue', $3)
         ON CONFLICT (task_id, subtask_id, alert_key) DO NOTHING
         RETURNING id`,
        [row.task_id, row.subtask_id, title],
      );
      if (reserve.rows.length === 0) continue;

      // Parse managers
      const parseManagers = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val))
          return val
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean);
        try {
          const p = JSON.parse(val);
          return Array.isArray(p)
            ? p
                .map(String)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        } catch {}
        return String(val)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      };

      const names = Array.from(
        new Set([
          ...parseManagers(row.reporting_managers),
          ...parseManagers(row.escalation_managers),
          ...(row.assigned_to ? [String(row.assigned_to)] : []),
        ]),
      );

      const lowered = names.map((n) => n.toLowerCase());
      const users = await pool.query(
        `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
        [lowered],
      );
      const user_ids = users.rows
        .map((r) => r.azure_object_id)
        .filter((id) => !!id);

      try {
        const resp = await fetch(
          "https://pulsealerts.mylapay.com/direct-call",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiver: "CRM_Switch", title, user_ids }),
          },
        );
        if (!resp.ok) {
          console.warn("[pulse-sync] Pulse call failed:", resp.status);
        } else {
          sent++;
        }
      } catch (err) {
        console.warn("[pulse-sync] Pulse call error:", (err as Error).message);
      }
    }

    const finishedAt = new Date().toISOString();
    console.log(
      `[pulse-sync] END ${finishedAt} checked=${overdue.rowCount} sent=${sent}`,
    );
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        startedAt,
        finishedAt,
        checked: overdue.rowCount,
        sent,
      }),
    };
  } catch (e: any) {
    console.error("[pulse-sync] ERROR:", e?.stack || e?.message || String(e));
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    };
  }
};
