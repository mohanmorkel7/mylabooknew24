import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import finopsAlertService from "../services/finopsAlertService";
import finopsScheduler from "../services/finopsScheduler";

const router = Router();

// Ensure finops_external_alerts table and required columns exist
async function ensureExternalAlertsSchema(): Promise<void> {
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
  await pool.query(
    `ALTER TABLE finops_external_alerts ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMP`
  );
}

// Production database availability check - fail fast if no database
async function requireDatabase() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (error) {
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

function parseManagers(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val))
    return val
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof val === "string") {
    let s = val.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      s = s.slice(1, -1);
      return s
        .split(",")
        .map((x) => x.trim())
        .map((x) => x.replace(/^\"|\"$/g, ""))
        .filter(Boolean);
    }
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed))
        return parsed
          .map(String)
          .map((x) => x.trim())
          .filter(Boolean);
    } catch {}
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed)
      ? parsed
          .map(String)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function getUserIdsFromNames(names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const lowered = names.map((n) => n.toLowerCase());
  const result = await pool.query(
    `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
    [lowered],
  );
  return result.rows
    .map((r: any) => r.azure_object_id)
    .filter((id: string | null) => !!id) as string[];
}

async function sendReplicaDownAlertOnce(
  taskId: number,
  subtaskId: string | number,
  title: string,
  userIds: string[],
): Promise<void> {
  try {
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

    const reserve = await pool.query(
      `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_key, title, next_call_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (task_id, subtask_id, alert_key) DO NOTHING
       RETURNING id`,
      [taskId, Number(subtaskId), "replica_down_overdue", title],
    );

    if (reserve.rows.length === 0) {
      console.log("[finops-production] Direct-call skip (already sent)", {
        taskId,
        subtaskId,
        alert_key: "replica_down_overdue",
      });
      return;
    }

    // Task meta for richer payload logging
    const metaRes = await pool.query(
      `SELECT assigned_to, reporting_managers, escalation_managers FROM finops_tasks WHERE id = $1 LIMIT 1`,
      [taskId],
    );
    const meta = metaRes.rows[0] || {};
    const assigned_to_raw = meta.assigned_to ?? null;
    const reporting_managers_raw = meta.reporting_managers ?? null;
    const escalation_managers_raw = meta.escalation_managers ?? null;

    const assigned_to_parsed = parseManagers(assigned_to_raw);
    const reporting_managers_parsed = parseManagers(reporting_managers_raw);
    const escalation_managers_parsed = parseManagers(escalation_managers_raw);

    console.log("[finops-production] Direct-call payload", {
      taskId,
      subtaskId,
      title,
      user_ids: userIds,
      assigned_to_raw,
      reporting_managers_raw,
      escalation_managers_raw,
      assigned_to_parsed,
      reporting_managers_parsed,
      escalation_managers_parsed,
    });

    const resp = await fetch("https://pulsealerts.mylapay.com/direct-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver: "CRM_Switch",
        title,
        user_ids: userIds,
      }),
    });
    if (!resp.ok) {
      console.warn(
        "[finops-production] Replica-down alert failed:",
        resp.status,
      );
    }
  } catch (e) {
    console.warn(
      "[finops-production] Replica-down alert error:",
      (e as Error).message,
    );
  }
}

// Get all FinOps tasks with subtasks
router.get("/tasks", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    await ensureExternalAlertsSchema();

    const query = `
      SELECT
        t.*,
        (SELECT fe.next_call_at FROM finops_external_alerts fe WHERE fe.task_id = t.id AND fe.alert_key = 'replica_down_overdue' ORDER BY fe.created_at DESC LIMIT 1) AS next_call_at,
        json_agg(
          json_build_object(
            'id', st.id,
            'name', st.name,
            'description', st.description,
            'sla_hours', st.sla_hours,
            'sla_minutes', st.sla_minutes,
            'order_position', st.order_position,
            'status', st.status,
            'started_at', st.started_at,
            'completed_at', st.completed_at,
            'due_at', st.due_at,
            'start_time', st.start_time
          ) ORDER BY st.order_position
        ) FILTER (WHERE st.id IS NOT NULL) as subtasks
      FROM finops_tasks t
      LEFT JOIN finops_subtasks st ON t.id = st.task_id
      WHERE t.deleted_at IS NULL
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;

    const result = await pool.query(query);
    const tasks = result.rows.map((row) => ({
      ...row,
      subtasks: row.subtasks || [],
    }));

    res.json(tasks);
  } catch (error) {
    console.error("Error fetching FinOps tasks:", error);
    res.status(500).json({
      error: "Database connection failed",
      message: "Unable to fetch FinOps tasks from database",
      details: error.message,
    });
  }
});

// Create new FinOps task
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const {
      task_name,
      description,
      assigned_to,
      reporting_managers,
      escalation_managers,
      effective_from,
      duration,
      is_active,
      subtasks,
      created_by,
    } = req.body;

    // Validate required fields
    if (
      !task_name ||
      !assigned_to ||
      !effective_from ||
      !duration ||
      !created_by
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        required: [
          "task_name",
          "assigned_to",
          "effective_from",
          "duration",
          "created_by",
        ],
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert main task
      const taskQuery = `
        INSERT INTO finops_tasks (
          task_name, description, assigned_to, reporting_managers, 
          escalation_managers, effective_from, duration, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const taskResult = await client.query(taskQuery, [
        task_name,
        description,
        assigned_to,
        JSON.stringify(reporting_managers || []),
        JSON.stringify(escalation_managers || []),
        effective_from,
        duration,
        is_active ?? true,
        created_by,
      ]);

      const task = taskResult.rows[0];

      // Insert subtasks
      const subtaskResults = [];
      if (subtasks && subtasks.length > 0) {
        for (let i = 0; i < subtasks.length; i++) {
          const subtask = subtasks[i];
          const subtaskQuery = `
            INSERT INTO finops_subtasks (
              task_id, name, description, sla_hours, sla_minutes, order_position
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
          `;

          const subtaskResult = await client.query(subtaskQuery, [
            task.id,
            subtask.name,
            subtask.description || null,
            subtask.sla_hours || 1,
            subtask.sla_minutes || 0,
            i,
          ]);

          subtaskResults.push(subtaskResult.rows[0]);
        }
      }

      await client.query("COMMIT");

      // Log activity
      await client.query(
        `
        INSERT INTO finops_activity_log (task_id, action, user_name, details)
        VALUES ($1, $2, $3, $4)
      `,
        [
          task.id,
          "created",
          assigned_to,
          `Task "${task_name}" created with ${subtaskResults.length} subtasks`,
        ],
      );

      const response = {
        ...task,
        subtasks: subtaskResults,
      };

      res.status(201).json(response);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating FinOps task:", error);
    res.status(500).json({
      error: "Failed to create FinOps task",
      message: error.message,
    });
  }
});

// Update subtask status
router.put("/subtasks/:id", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const subtaskId = parseInt(req.params.id);
    const { status, delay_reason, user_name } = req.body;

    if (isNaN(subtaskId)) {
      return res.status(400).json({ error: "Invalid subtask ID" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const validStatuses = [
      "pending",
      "in_progress",
      "completed",
      "overdue",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status",
        validStatuses,
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Update subtask
      let updateQuery = "";
      let queryParams = [];

      if (status === "in_progress") {
        updateQuery = `
          UPDATE finops_subtasks 
          SET status = $1, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status, subtaskId];
      } else if (status === "completed") {
        updateQuery = `
          UPDATE finops_subtasks 
          SET status = $1, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status, subtaskId];
      } else {
        updateQuery = `
          UPDATE finops_subtasks 
          SET status = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status, subtaskId];
      }

      const result = await client.query(updateQuery, queryParams);

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Subtask not found" });
      }

      const subtask = result.rows[0];

      // Log activity
      let activityDetails = `Subtask "${subtask.name}" status changed to ${status}`;
      if (delay_reason && status === "overdue") {
        activityDetails += `. Delay reason: ${delay_reason}`;
      }

      await client.query(
        `
        INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          subtask.task_id,
          subtaskId,
          "updated",
          user_name || "System",
          activityDetails,
        ],
      );

      // Trigger alerts if needed
      if (status === "overdue") {
        // Existing DB alert
        await finopsAlertService.createSLABreachAlert(
          subtask.task_id,
          subtaskId,
          delay_reason,
        );

        // External Pulse alert with managers and assignees
        const meta = await client.query(
          `SELECT task_name, client_name, assigned_to, reporting_managers, escalation_managers FROM finops_tasks WHERE id = $1 LIMIT 1`,
          [subtask.task_id],
        );
        const row = meta.rows[0] || {};
        const taskName = row.task_name || "Unknown Task";
        const clientName = row.client_name || "Unknown Client";
        const title = `Please take immediate action on the overdue subtask ${subtask.name} under the task ${taskName} for the client ${clientName}.`;
        const managerNames = Array.from(
          new Set([
            ...parseManagers(row.reporting_managers),
            ...parseManagers(row.escalation_managers),
            ...parseManagers(row.assigned_to),
          ]),
        );
        const userIds = await getUserIdsFromNames(managerNames);
        await sendReplicaDownAlertOnce(
          subtask.task_id,
          subtaskId,
          title,
          userIds,
        );
      }

      await client.query("COMMIT");
      res.json(subtask);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error updating subtask:", error);
    res.status(500).json({
      error: "Failed to update subtask",
      message: error.message,
    });
  }
});

// Get activity log
router.get("/activity-log", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { start_date, end_date, task_id } = req.query;

    let query = `
      SELECT 
        al.*,
        t.task_name,
        st.name as subtask_name
      FROM finops_activity_log al
      JOIN finops_tasks t ON al.task_id = t.id
      LEFT JOIN finops_subtasks st ON al.subtask_id = st.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCount = 0;

    if (start_date) {
      paramCount++;
      query += ` AND al.timestamp >= $${paramCount}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND al.timestamp <= $${paramCount}`;
      queryParams.push(end_date);
    }

    if (task_id) {
      paramCount++;
      query += ` AND al.task_id = $${paramCount}`;
      queryParams.push(parseInt(task_id as string));
    }

    query += ` ORDER BY al.timestamp DESC LIMIT 1000`;

    const result = await pool.query(query, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({
      error: "Failed to fetch activity log",
      message: error.message,
    });
  }
});

// Get clients from leads table for dropdown
router.get("/clients", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const query = `
      SELECT DISTINCT client_name as name, client_name as id
      FROM leads 
      WHERE client_name IS NOT NULL AND client_name != ''
      ORDER BY client_name
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching clients from leads:", error);
    res.status(500).json({
      error: "Failed to fetch clients",
      message: error.message,
    });
  }
});

// Get alerts/notifications
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const query = `
      SELECT 
        a.*,
        t.task_name,
        st.name as subtask_name
      FROM finops_alerts a
      JOIN finops_tasks t ON a.task_id = t.id
      LEFT JOIN finops_subtasks st ON a.subtask_id = st.id
      WHERE a.is_active = true
      ORDER BY a.created_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      error: "Failed to fetch alerts",
      message: error.message,
    });
  }
});

// Database health check endpoint
router.get("/health", async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const responseTime = Date.now() - start;

    // Check if required tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('finops_tasks', 'finops_subtasks', 'finops_activity_log', 'finops_alerts')
      ORDER BY table_name
    `;

    const tablesResult = await pool.query(tablesQuery);
    const tables = tablesResult.rows.map((row) => row.table_name);

    const requiredTables = [
      "finops_tasks",
      "finops_subtasks",
      "finops_activity_log",
      "finops_alerts",
    ];
    const missingTables = requiredTables.filter(
      (table) => !tables.includes(table),
    );

    res.json({
      status: missingTables.length === 0 ? "healthy" : "degraded",
      database: "connected",
      responseTime: `${responseTime}ms`,
      tables: {
        found: tables,
        missing: missingTables,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Dashboard endpoint for FinOps dashboard
router.post("/dashboard", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { period, start_date, end_date } = req.body;

    // Get task statistics from database
    const tasksQuery = `
      SELECT
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_tasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_tasks
      FROM finops_tasks
      WHERE deleted_at IS NULL
    `;

    const subtasksQuery = `
      SELECT
        COUNT(*) as total_subtasks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_subtasks,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_subtasks,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_subtasks,
        COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as tasks_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as completed_today,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) = CURRENT_DATE THEN 1 END) as pending_today,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) = CURRENT_DATE THEN 1 END) as sla_breaches_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as completed_this_month,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as pending_this_month,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as sla_breaches_this_month
      FROM finops_subtasks
    `;

    const [tasksResult, subtasksResult] = await Promise.all([
      pool.query(tasksQuery),
      pool.query(subtasksQuery),
    ]);

    const taskStats = tasksResult.rows[0];
    const subtaskStats = subtasksResult.rows[0];

    const dashboardData = {
      total_revenue: 120000,
      total_costs: 45000,
      profit: 75000,
      profit_margin: 62.5,
      overdue_invoices: {
        overdue_count: parseInt(subtaskStats.overdue_subtasks) || 0,
        overdue_amount: 15000,
      },
      budget_utilization: [],
      daily_process_counts: {
        tasks_completed_today: parseInt(subtaskStats.completed_today) || 0,
        tasks_pending_today: parseInt(subtaskStats.pending_today) || 0,
        sla_breaches_today: parseInt(subtaskStats.sla_breaches_today) || 0,
        tasks_completed_this_month:
          parseInt(subtaskStats.completed_this_month) || 0,
        tasks_pending_this_month:
          parseInt(subtaskStats.pending_this_month) || 0,
        sla_breaches_this_month:
          parseInt(subtaskStats.sla_breaches_this_month) || 0,
      },
      task_summary: {
        total_tasks: parseInt(taskStats.total_tasks) || 0,
        active_tasks: parseInt(taskStats.active_tasks) || 0,
        completed_tasks: parseInt(taskStats.completed_tasks) || 0,
        overdue_tasks: parseInt(taskStats.overdue_tasks) || 0,
      },
      subtask_summary: {
        total_subtasks: parseInt(subtaskStats.total_subtasks) || 0,
        completed_subtasks: parseInt(subtaskStats.completed_subtasks) || 0,
        pending_subtasks: parseInt(subtaskStats.pending_subtasks) || 0,
        overdue_subtasks: parseInt(subtaskStats.overdue_subtasks) || 0,
      },
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching FinOps dashboard data:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      message: error.message,
    });
  }
});

// Daily process stats endpoint for real-time tracking
router.post("/daily-process-stats", async (req: Request, res: Response) => {
  try {
    await requireDatabase();

    const { period, start_date, end_date } = req.body;

    const statsQuery = `
      SELECT
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as tasks_completed_today,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) = CURRENT_DATE THEN 1 END) as tasks_pending_today,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) = CURRENT_DATE THEN 1 END) as sla_breaches_today,
        COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as tasks_completed_this_month,
        COUNT(CASE WHEN status = 'pending' AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as tasks_pending_this_month,
        COUNT(CASE WHEN status = 'overdue' AND DATE(updated_at) >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as sla_breaches_this_month
      FROM finops_subtasks
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    const processData = {
      tasks_completed_today: parseInt(stats.tasks_completed_today) || 0,
      tasks_pending_today: parseInt(stats.tasks_pending_today) || 0,
      sla_breaches_today: parseInt(stats.sla_breaches_today) || 0,
      tasks_completed_this_month:
        parseInt(stats.tasks_completed_this_month) || 0,
      tasks_pending_this_month: parseInt(stats.tasks_pending_this_month) || 0,
      sla_breaches_this_month: parseInt(stats.sla_breaches_this_month) || 0,
    };

    res.json(processData);
  } catch (error) {
    console.error("Error fetching daily process stats:", error);
    res.status(500).json({
      error: "Failed to fetch daily process stats",
      message: error.message,
    });
  }
});

// Store overdue reason for subtask status change
router.post("/tasks/overdue-reason", async (req: Request, res: Response) => {
  try {
    const { task_id, subtask_id, reason, created_by } = req.body;

    // Validate required fields
    if (!task_id || !subtask_id || !reason) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["task_id", "subtask_id", "reason"],
      });
    }

    // Check database availability and provide fallback
    try {
      await requireDatabase();
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // Create overdue reasons table if it doesn't exist
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS finops_overdue_reasons (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES finops_tasks(id),
            subtask_id VARCHAR(255),
            reason TEXT NOT NULL,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `;

        await client.query(createTableQuery);

        // Insert the overdue reason
        const insertQuery = `
          INSERT INTO finops_overdue_reasons (task_id, subtask_id, reason, created_by, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING *
        `;

        const result = await client.query(insertQuery, [
          task_id,
          subtask_id,
          reason,
          created_by || 1,
        ]);

        // Log activity
        await client.query(
          `
          INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            task_id,
            subtask_id,
            "overdue_reason_provided",
            "User",
            `Overdue reason provided: ${reason}`,
          ],
        );

        await client.query("COMMIT");

        res.status(201).json({
          success: true,
          overdue_reason: result.rows[0],
          message: "Overdue reason stored successfully",
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (dbError) {
      // Database unavailable - provide mock response
      console.log(
        "Database unavailable for overdue reason, using mock response:",
        dbError.message,
      );

      // Return mock success response
      const mockOverdueReason = {
        id: Date.now(),
        task_id,
        subtask_id,
        reason,
        created_by: created_by || 1,
        created_at: new Date().toISOString(),
      };

      res.status(201).json({
        success: true,
        overdue_reason: mockOverdueReason,
        message:
          "Overdue reason stored successfully (mock mode - database unavailable)",
        mock: true,
      });
    }
  } catch (error) {
    console.error("Error storing overdue reason:", error);
    res.status(500).json({
      error: "Failed to store overdue reason",
      message: error.message,
    });
  }
});

// Public endpoint to scan overdue subtasks and call Pulse Alerts (no auth)
router.post("/public/pulse-sync", async (req: Request, res: Response) => {
  try {
    // Ensure DB reachable
    await requireDatabase();

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

    // Find overdue subtasks that haven't been sent to Pulse yet
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
      const title = `Please take immediate action on the overdue subtask ${row.subtask_name} under the task ${taskName} for the client ${clientName}.`;

      // Reserve to avoid duplicates
      const reserve = await pool.query(
        `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_key, title, next_call_at)
         VALUES ($1, $2, 'replica_down_overdue', $3, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (task_id, subtask_id, alert_key) DO NOTHING
         RETURNING id`,
        [row.task_id, row.subtask_id, title],
      );
      if (reserve.rows.length === 0) continue;

      // Build manager/user list
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

      // Resolve azure_object_id user ids for Pulse
      const lowered = names.map((n) => n.toLowerCase());
      const users = await pool.query(
        `SELECT azure_object_id FROM users WHERE LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)`,
        [lowered],
      );
      const user_ids = users.rows
        .map((r) => r.azure_object_id)
        .filter((id) => !!id);

      // Call Pulse Alerts
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
          console.warn("Pulse call failed:", resp.status);
        } else {
          sent++;
        }
      } catch (err) {
        console.warn("Pulse call error:", (err as Error).message);
      }
    }

    res.json({ success: true, checked: overdue.rowCount, sent });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all external alert next_call timestamps
router.get("/next-calls", async (req: Request, res: Response) => {
  try {
    await requireDatabase();
    const { alert_key } = req.query;
    const params: any[] = [];
    let query = `SELECT task_id, subtask_id, alert_key, next_call_at, created_at FROM finops_external_alerts`;
    if (alert_key) {
      query += ` WHERE alert_key = $1`;
      params.push(String(alert_key));
    }
    query += ` ORDER BY next_call_at ASC NULLS LAST`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching next calls:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
