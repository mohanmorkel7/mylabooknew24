import { pool } from "../database/connection";
import * as nodemailer from "nodemailer";

// IST timezone helper functions
const IST_TIMEZONE = "Asia/Kolkata";

const getCurrentISTTime = (): Date => {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: IST_TIMEZONE }),
  );
};

const convertToIST = (date: Date | string): Date => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return new Date(dateObj.toLocaleString("en-US", { timeZone: IST_TIMEZONE }));
};

const formatISTDateTime = (date: Date): string => {
  return date.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

interface AlertConfig {
  taskId: number;
  subtaskId?: string;
  alertType: "sla_warning" | "sla_overdue" | "subtask_incomplete";
  recipientType: "assigned_user" | "reporting_managers" | "escalation_managers";
  minutes: number;
}

interface EmailRecipient {
  name: string;
  email: string;
  type: "assigned" | "reporting" | "escalation";
}

class FinOpsAlertService {
  private emailTransporter: nodemailer.Transporter;

  private parseManagers(val: any): string[] {
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
          .map((x) => x.replace(/^"|"$/g, ""))
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

  private async getUserIdsFromNames(names: string[]): Promise<string[]> {
    if (!names.length) return [];
    const normalized = names
      .map((n) => (n || "").toLowerCase().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const collapsed = normalized.map((n) => n.replace(/\s+/g, ""));

    const result = await pool.query(
      `
      SELECT azure_object_id, sso_id, first_name, last_name, email
      FROM users
      WHERE (
        LOWER(CONCAT(first_name,' ',last_name)) = ANY($1)
        OR REPLACE(LOWER(CONCAT(first_name,' ',last_name)),' ','') = ANY($2)
        OR LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))) = ANY($1)
        OR REPLACE(LOWER(CONCAT(first_name,' ',LEFT(COALESCE(last_name,''),1))),' ','') = ANY($2)
        OR LOWER(SPLIT_PART(COALESCE(email,''),'@',1)) = ANY($1)
        OR REPLACE(LOWER(SPLIT_PART(COALESCE(email,''),'@',1)),'.','') = ANY($2)
      )
    `,
      [normalized, collapsed],
    );

    const ids = result.rows
      .map((r: any) => r.azure_object_id || r.sso_id)
      .filter((id: string | null) => !!id) as string[];

    // Visibility for names that didn't resolve to a user id
    try {
      const foundNames = new Set<string>();
      for (const r of result.rows) {
        const fn = String(r.first_name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const ln = String(r.last_name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        const full = `${fn}${ln ? " " + ln : ""}`.trim();
        const initial = `${fn}${ln ? " " + ln.charAt(0) : ""}`.trim();
        const emailLocal =
          String(r.email || "")
            .toLowerCase()
            .split("@")[0] || "";
        foundNames.add(full);
        if (initial) foundNames.add(initial);
        if (emailLocal) {
          foundNames.add(emailLocal);
          foundNames.add(emailLocal.replace(/\./g, ""));
        }
      }
      const missing = normalized.filter((n) => !foundNames.has(n));
      if (missing.length) {
        console.warn("Missing Azure IDs for names (no user match):", missing);
      }
    } catch {}

    return Array.from(new Set(ids));
  }

  constructor() {
    // Initialize email transporter
    const host = process.env.SMTP_HOST || "localhost";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const disabled =
      String(process.env.SMTP_DISABLED || "").toLowerCase() === "true";

    if (disabled || host === "localhost") {
      this.emailTransporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      console.log("Email transport: jsonTransport (development/no SMTP)");
    } else {
      this.emailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
  }

  /**
   * Check all active tasks for SLA breaches and send alerts
   */
  async checkSLAAlerts(): Promise<void> {
    try {
      const { isDatabaseAvailable } = await import("../database/connection");
      if (!(await isDatabaseAvailable())) return;
      console.log("Starting SLA alert check...");

      // Get all active tasks with their subtasks
      const activeTasks = await this.getActiveTasksWithSubtasks();

      for (const task of activeTasks) {
        await this.processTaskAlerts(task);
      }

      // Additionally, trigger repeat escalations for items that remain overdue
      await this.checkOverdueRepeatAlerts();

      console.log("SLA alert check completed");
    } catch (error) {
      console.error("Error in SLA alert check:", error);
    }
  }

  /**
   * Check for daily tasks that need to be executed
   */
  async checkDailyTaskExecution(): Promise<void> {
    try {
      console.log("Checking for daily tasks to execute...");

      const today = new Date().toISOString().split("T")[0];

      const tasksToExecute = await pool.query(
        `
        SELECT * FROM finops_tasks 
        WHERE is_active = true 
        AND duration = 'daily'
        AND effective_from <= $1
        AND (last_run_at IS NULL OR DATE(last_run_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') < $1)
        AND deleted_at IS NULL
      `,
        [today],
      );

      for (const task of tasksToExecute.rows) {
        await this.executeTask(task);
      }

      console.log(
        `Daily task execution completed. Processed ${tasksToExecute.rows.length} tasks`,
      );
    } catch (error) {
      console.error("Error in daily task execution:", error);
    }
  }

  /**
   * Process alerts for a specific task
   */
  private async processTaskAlerts(task: any): Promise<void> {
    for (const subtask of task.subtasks) {
      if (subtask.status === "pending") {
        await this.checkSubtaskSLA(task, subtask);
      }
    }
  }

  /**
   * Check SLA for individual subtask and send alerts if needed
   */
  private async checkSubtaskSLA(task: any, subtask: any): Promise<void> {
    const now = new Date();

    // Only check pending tasks for overdue status
    if (subtask.status !== "pending") {
      return;
    }

    // Calculate due time based on task schedule (start_time)
    // For pending tasks, we check against their scheduled start time
    let dueTime: Date;

    if (subtask.start_time) {
      // Parse start_time (format: "HH:MM:SS" or "HH:MM")
      const today = new Date();
      const [hours, minutes] = subtask.start_time.split(":").map(Number);

      dueTime = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        hours,
        minutes || 0,
      );

      // If the scheduled time has passed today, the task is overdue
      if (now > dueTime) {
        const minutesOverdue = Math.floor(
          (now.getTime() - dueTime.getTime()) / (1000 * 60),
        );

        console.log(
          `Pending task overdue - Task: ${task.task_name}, Subtask: ${subtask.name}, Overdue by: ${minutesOverdue} minutes`,
        );

        // Mark as overdue and send alert
        await this.sendSLAOverdueAlert(task, subtask, minutesOverdue);
        await this.updateSubtaskStatus(task.id, subtask.id, "overdue");
      }
    } else {
      console.log(
        `Subtask ${subtask.id} has no start_time defined, cannot check for overdue status`,
      );
    }
  }

  /**
   * For subtasks that remain overdue, send repeat external alerts every 10 minutes
   */
  private async checkOverdueRepeatAlerts(): Promise<void> {
    try {
      // Trigger on transition (handled elsewhere). Then repeat every 15 minutes while still overdue.
      const initialDelay = 15; // minutes after overdue before first repeat
      const repeatInterval = 15;

      const result = await pool.query(
        `
        SELECT
          t.id as task_id,
          t.task_name,
          t.client_name,
          t.reporting_managers,
          t.escalation_managers,
          t.assigned_to,
          ft.subtask_id,
          ft.subtask_name,
          ft.updated_at as overdue_since,
          ft.status
        FROM finops_tracker ft
        JOIN finops_tasks t ON t.id = ft.task_id
        WHERE ft.status = 'overdue'
          AND ft.run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
          AND t.is_active = true
          AND t.deleted_at IS NULL
          AND (ft.subtask_scheduled_date IS NULL OR ft.subtask_scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
      `,
      );

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

      const now = new Date();
      for (const row of result.rows) {
        const since = row.overdue_since ? new Date(row.overdue_since) : null;
        if (!since) continue;
        const minutes = Math.floor((now.getTime() - since.getTime()) / 60000);

        // Initial delayed call (always allowed; single-overdue constraint applies only to repeats)
        if (minutes >= initialDelay) {
        }

        // Repeat calls with configured interval
        if (minutes >= initialDelay + repeatInterval) {
          const bucket = Math.floor((minutes - initialDelay) / repeatInterval); // 1,2,3...
          const alertKey = `replica_down_overdue_${bucket}`;

          const exists = await pool.query(
            `SELECT id FROM finops_external_alerts WHERE task_id = $1 AND subtask_id = $2 AND alert_key = $3 LIMIT 1`,
            [row.task_id, row.subtask_id, alertKey],
          );
          if (exists.rows.length) continue; // already sent for this bucket

          const names = Array.from(
            new Set([
              ...this.parseManagers(row.reporting_managers),
              ...this.parseManagers(row.escalation_managers),
              ...this.parseManagers(row.assigned_to),
            ]),
          );
          const userIds = await this.getUserIdsFromNames(names);

          const taskName = row.task_name || "Unknown Task";
          const clientName = row.client_name || "Unknown Client";
          const title = `Kindly take prompt action on the overdue subtask ${row.subtask_name} from the task ${taskName} for the client ${clientName}.`;

          console.log("Direct-call payload (service repeat)", {
            taskId: row.task_id,
            subtaskId: row.subtask_id,
            title,
            minutes_overdue: minutes,
            bucket,
            repeat_interval: repeatInterval,
            user_ids: userIds,
          });

          // Reserve an external alert record; actual external call is performed by pulse-sync or external worker
          await pool.query(
            `INSERT INTO finops_external_alerts (task_id, subtask_id, alert_key, title, next_call_at)
                 VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
                 ON CONFLICT (task_id, subtask_id, alert_key) DO NOTHING`,
            [row.task_id, row.subtask_id, alertKey, title],
          );

          await this.logAlert(
            row.task_id,
            String(row.subtask_id),
            "sla_overdue_repeat",
            "all",
            minutes,
            title,
          );
        }
      }
    } catch (e) {
      console.warn("Error in overdue repeat alerts:", (e as Error).message);
    }
  }

  /**
   * Send SLA warning alert (15 minutes before breach)
   */
  private async sendSLAWarningAlert(
    task: any,
    subtask: any,
    minutesRemaining: number,
  ): Promise<void> {
    try {
      // Check if warning already sent
      const existingAlert = await pool.query(
        `
        SELECT * FROM finops_alerts 
        WHERE task_id = $1 AND subtask_id = $2 AND alert_type = 'sla_warning'
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '1 hour')
      `,
        [task.id, subtask.id],
      );

      if (existingAlert.rows.length > 0) {
        return; // Alert already sent
      }

      const recipients = [
        {
          name: task.assigned_to,
          email: `${task.assigned_to.toLowerCase().replace(" ", ".")}@company.com`,
          type: "assigned" as const,
        },
        ...this.parseManagers(task.reporting_managers).map((name: string) => ({
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@company.com`,
          type: "reporting" as const,
        })),
      ];

      const currentTimeIST = formatISTDateTime(getCurrentISTTime());
      const subject = `⚠️ SLA Warning: ${task.task_name} - ${subtask.name}`;
      const message = `
        <h2>SLA Warning Alert</h2>
        <p><strong>Task:</strong> ${task.task_name}</p>
        <p><strong>Subtask:</strong> ${subtask.name}</p>
        <p><strong>Time Remaining:</strong> ${minutesRemaining} minutes</p>
        <p><strong>Current Status:</strong> ${subtask.status}</p>
        <p><strong>Assigned To:</strong> ${task.assigned_to}</p>
        <p><strong>Alert Time (IST):</strong> ${currentTimeIST}</p>

        <p>This subtask is approaching its SLA deadline. Please ensure timely completion to avoid escalation.</p>

        <hr>
        <p><small>This is an automated alert from the FinOps Task Management System (IST).</small></p>
      `;

      await this.sendEmailAlerts(recipients, subject, message);
      await this.logAlert(
        task.id,
        subtask.id,
        "sla_warning",
        "assigned_user,reporting_managers",
        minutesRemaining,
      );
    } catch (error) {
      console.error("Error sending SLA warning alert:", error);
    }
  }

  /**
   * Send SLA overdue alert (immediate escalation)
   */
  private async sendSLAOverdueAlert(
    task: any,
    subtask: any,
    minutesOverdue: number,
  ): Promise<void> {
    try {
      // Check if overdue alert already sent
      const existingAlert = await pool.query(
        `
        SELECT * FROM finops_alerts 
        WHERE task_id = $1 AND subtask_id = $2 AND alert_type = 'sla_overdue'
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '30 minutes')
      `,
        [task.id, subtask.id],
      );

      if (existingAlert.rows.length > 0) {
        return; // Alert already sent
      }

      const recipients = [
        {
          name: task.assigned_to,
          email: `${task.assigned_to.toLowerCase().replace(" ", ".")}@company.com`,
          type: "assigned" as const,
        },
        ...this.parseManagers(task.reporting_managers).map((name: string) => ({
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@company.com`,
          type: "reporting" as const,
        })),
        ...this.parseManagers(task.escalation_managers).map((name: string) => ({
          name,
          email: `${name.toLowerCase().replace(" ", ".")}@company.com`,
          type: "escalation" as const,
        })),
      ];

      const currentTimeIST = formatISTDateTime(getCurrentISTTime());
      const subject = `🚨 SLA OVERDUE: ${task.task_name} - ${subtask.name}`;
      const message = `
        <h2 style="color: #dc2626;">SLA OVERDUE ALERT</h2>
        <p><strong>Task:</strong> ${task.task_name}</p>
        <p><strong>Subtask:</strong> ${subtask.name}</p>
        <p><strong>Time Overdue:</strong> ${minutesOverdue} minutes</p>
        <p><strong>Current Status:</strong> ${subtask.status}</p>
        <p><strong>Assigned To:</strong> ${task.assigned_to}</p>
        <p><strong>Alert Time (IST):</strong> ${currentTimeIST}</p>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <h3 style="color: #dc2626; margin-top: 0;">IMMEDIATE ACTION REQUIRED</h3>
          <p>This subtask has exceeded its SLA deadline and requires immediate escalation.</p>
          <p>Escalation managers have been notified.</p>
        </div>

        <hr>
        <p><small>This is an automated escalation alert from the FinOps Task Management System (IST).</small></p>
      `;

      await this.sendEmailAlerts(recipients, subject, message);
      const customTitle = `Kindly take prompt action on the overdue subtask ${subtask.name} from the task ${task.task_name} for the client ${task.client_name}.`;
      await this.logAlert(
        task.id,
        subtask.id,
        "sla_overdue",
        "all",
        minutesOverdue,
        customTitle,
      );
    } catch (error) {
      console.error("Error sending SLA overdue alert:", error);
    }
  }

  /**
   * Send external alert to Pulse Alerts endpoint
   */
  private async sendReplicaDownAlert(
    taskId: number,
    subtaskId: string | number,
    title: string,
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
        return;
      }

      // Resolve user_ids from reporting & escalation managers
      const taskRow = await pool.query(
        `SELECT reporting_managers, escalation_managers, assigned_to FROM finops_tasks WHERE id = $1`,
        [taskId],
      );
      const managers = taskRow.rows[0] || {};
      const names = Array.from(
        new Set([
          ...this.parseManagers(managers.reporting_managers),
          ...this.parseManagers(managers.escalation_managers),
          ...this.parseManagers(managers.assigned_to),
        ]),
      );
      const userIds = await this.getUserIdsFromNames(names);

      console.log("Direct-call payload (service)", {
        taskId,
        subtaskId,
        title,
        manager_names: names,
        user_ids: userIds,
      });

      // External call delegated to pulse-sync worker; finops_external_alerts already contains reservation row
      // No direct network call here to avoid duplicate/parallel requests and to centralize retries
    } catch (err) {
      console.warn("Replica-down alert error:", (err as Error).message);
    }
  }

  /**
   * Execute a task (create daily instances of subtasks)
   */
  private async executeTask(task: any): Promise<void> {
    try {
      console.log(`Executing daily task: ${task.task_name}`);

      // Get subtasks for this task
      const subtasks = await pool.query(
        `
        SELECT * FROM finops_subtasks 
        WHERE task_id = $1 
        ORDER BY order_position
      `,
        [task.id],
      );

      // Ensure datewise columns exist
      await pool.query(`
        ALTER TABLE finops_subtasks
          ADD COLUMN IF NOT EXISTS scheduled_date DATE,
          ADD COLUMN IF NOT EXISTS auto_notify BOOLEAN DEFAULT true,
          ADD COLUMN IF NOT EXISTS notification_sent_15min BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_start BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS notification_sent_escalation BOOLEAN DEFAULT false;
      `);

      // Upsert tracker rows for today's IST date for each subtask (do not mutate finops_subtasks)
      for (const subtask of subtasks.rows) {
        // Ensure tracking table exists with expanded columns (no-op if already created)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS finops_tracker (
            id SERIAL PRIMARY KEY,
            run_date DATE NOT NULL,
            period VARCHAR(20) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
            task_id INTEGER NOT NULL,
            task_name TEXT,
            subtask_id INTEGER NOT NULL DEFAULT 0,
            subtask_name TEXT,
            status VARCHAR(20) NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue','delayed','cancelled')),
            started_at TIMESTAMP NULL,
            completed_at TIMESTAMP NULL,
            scheduled_time TIME NULL,
            subtask_scheduled_date DATE NULL,
            description TEXT,
            sla_hours INTEGER,
            sla_minutes INTEGER,
            order_position INTEGER,
            delay_reason TEXT,
            delay_notes TEXT,
            notification_sent_15min BOOLEAN DEFAULT false,
            notification_sent_start BOOLEAN DEFAULT false,
            notification_sent_escalation BOOLEAN DEFAULT false,
            auto_notify BOOLEAN DEFAULT true,
            assigned_to TEXT,
            reporting_managers TEXT,
            escalation_managers TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(run_date, period, task_id, subtask_id)
          );
        `);

        // Upsert into finops_tracker for datewise tracking (do not touch finops_subtasks table)
        await pool.query(
          `
          INSERT INTO finops_tracker (
            run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date, description, sla_hours, sla_minutes, order_position
          ) VALUES (
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $1, $2, $3, $4, $5, 'pending', NULL, NULL, $6, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, $7, $8, $9, $10
          )
          ON CONFLICT (run_date, period, task_id, subtask_id)
          DO UPDATE SET status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, updated_at = NOW(), subtask_scheduled_date = EXCLUDED.subtask_scheduled_date
          `,
          [
            String(task.duration || "daily"),
            task.id,
            task.task_name || "",
            subtask.id,
            subtask.name || "",
            subtask.start_time || null,
            subtask.description || null,
            subtask.sla_hours || null,
            subtask.sla_minutes || null,
            subtask.order_position || null,
          ],
        );
      }

      // Update task last run time
      await pool.query(
        `
        UPDATE finops_tasks
        SET last_run_at = CURRENT_TIMESTAMP,
            next_run_at = CURRENT_TIMESTAMP + INTERVAL '1 day'
        WHERE id = $1
      `,
        [task.id],
      );

      // Log activity
      await this.logActivity(
        task.id,
        null,
        "daily_execution",
        "System",
        "Daily task execution started",
      );

      console.log(`Daily task executed successfully: ${task.task_name}`);
    } catch (error) {
      console.error(`Error executing daily task ${task.task_name}:`, error);
    }
  }

  /**
   * Get all active tasks with their subtasks
   */
  private async getActiveTasksWithSubtasks(): Promise<any[]> {
    const query = `
      SELECT 
        t.*,
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
            'start_time', st.start_time
          ) ORDER BY st.order_position
        ) FILTER (WHERE st.id IS NOT NULL) as subtasks
      FROM finops_tasks t
      LEFT JOIN finops_subtasks st ON t.id = st.task_id
      WHERE t.is_active = true AND t.deleted_at IS NULL
      GROUP BY t.id
    `;

    const result = await pool.query(query);
    return result.rows.map((row) => ({
      ...row,
      subtasks: row.subtasks || [],
    }));
  }

  /**
   * Send email alerts to recipients
   */
  private async sendEmailAlerts(
    recipients: EmailRecipient[],
    subject: string,
    htmlMessage: string,
  ): Promise<void> {
    for (const recipient of recipients) {
      try {
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || "finops@company.com",
          to: recipient.email,
          subject: subject,
          html: htmlMessage,
        });

        console.log(
          `Alert email sent to ${recipient.name} (${recipient.email})`,
        );
      } catch (error) {
        console.error(`Failed to send email to ${recipient.name}:`, error);
      }
    }
  }

  /**
   * Log alert in database
   */
  private async logAlert(
    taskId: number,
    subtaskId: string,
    alertType: string,
    recipients: string,
    minutesData: number,
    customMessage?: string,
  ): Promise<void> {
    try {
      const level = alertType.includes("overdue")
        ? "critical"
        : alertType.includes("warning")
          ? "warning"
          : "info";
      const defaultMessage = `${alertType} • ${minutesData} min`;
      const messageToStore = customMessage || defaultMessage;
      const recipsArray = recipients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const metadata = { minutes_data: minutesData } as any;
      await pool.query(
        `
        INSERT INTO finops_alerts (task_id, subtask_id, alert_type, alert_level, message, recipients, metadata, sent_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), true)
      `,
        [
          taskId,
          subtaskId,
          alertType,
          level,
          messageToStore,
          JSON.stringify(recipsArray),
          JSON.stringify(metadata),
        ],
      );
    } catch (error) {
      console.error("Error logging alert:", error);
    }
  }

  /**
   * Update subtask status
   */
  private async updateSubtaskStatus(
    taskId: number,
    subtaskId: string,
    status: string,
  ): Promise<void> {
    try {
      // Read current subtask status and name from finops_tracker for today's date (fallback to finops_subtasks)
      const trackerCurrent = await pool.query(
        `
        SELECT status, subtask_name as name FROM finops_tracker WHERE task_id = $1 AND subtask_id = $2 AND run_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
      `,
        [taskId, subtaskId],
      );

      let currentRow = trackerCurrent.rows[0];

      if (!currentRow) {
        const fallback = await pool.query(
          `SELECT status, name FROM finops_subtasks WHERE task_id = $1 AND id = $2 LIMIT 1`,
          [taskId, subtaskId],
        );
        currentRow = fallback.rows[0] || { status: null, name: "" };
      }

      const previousStatus = currentRow?.status || "unknown";
      const subtaskName = currentRow?.name || String(subtaskId);

      // Upsert into finops_tracker for today's date
      await pool.query(
        `
        INSERT INTO finops_tracker (run_date, period, task_id, task_name, subtask_id, subtask_name, status, started_at, completed_at, scheduled_time, subtask_scheduled_date)
        VALUES (
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
          'daily',
          $2,
          (SELECT task_name FROM finops_tasks WHERE id = $2 LIMIT 1),
          $3::integer,
          $4,
          $1::text,
          CASE WHEN $1::text = 'in_progress'::text THEN CURRENT_TIMESTAMP ELSE NULL END,
          CASE WHEN $1::text = 'completed'::text THEN CURRENT_TIMESTAMP ELSE NULL END,
          NULL,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
        )
        ON CONFLICT (run_date, period, task_id, subtask_id)
        DO UPDATE SET status = EXCLUDED.status, started_at = COALESCE(finops_tracker.started_at, EXCLUDED.started_at), completed_at = COALESCE(finops_tracker.completed_at, EXCLUDED.completed_at), updated_at = NOW(), subtask_scheduled_date = EXCLUDED.subtask_scheduled_date
      `,
        [status, taskId, subtaskId, subtaskName],
      );

      // Fetch task and client details for richer message
      const taskMeta = await pool.query(
        `SELECT task_name, client_name FROM finops_tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const taskName = taskMeta.rows[0]?.task_name || "Unknown Task";
      const clientName = taskMeta.rows[0]?.client_name || "Unknown Client";

      // Build human-readable status change message (special phrasing for overdue)
      const statusChangeMessage =
        status === "overdue"
          ? `Kindly take prompt action on the overdue subtask ${subtaskName} from the task ${taskName} for the client ${clientName}.`
          : `Subtask "${subtaskName}" status changed from "${previousStatus}" to "${status}"`;

      await this.logActivity(
        taskId,
        subtaskId,
        "status_changed",
        "System",
        statusChangeMessage,
      );

      // Trigger external alert only for overdue transitions
      if (status === "overdue") {
        await this.sendReplicaDownAlert(taskId, subtaskId, statusChangeMessage);
      }
    } catch (error) {
      console.error("Error updating subtask status:", error);
    }
  }

  /**
   * Create an overdue reason request that requires immediate attention
   */
  private async createOverdueReasonRequest(
    task: any,
    subtask: any,
    overdueMinutes: number,
  ): Promise<void> {
    try {
      console.log(
        `Creating overdue reason request for ${task.task_name} - ${subtask.name}`,
      );

      // Create a special notification type that requires overdue reason
      await pool.query(
        `
        INSERT INTO finops_activity_log (action, task_id, subtask_id, user_name, details, timestamp)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [
          "overdue_reason_required",
          task.id,
          subtask.id,
          "System",
          `OVERDUE REASON REQUIRED: ${task.task_name} - ${subtask.name} is overdue by ${overdueMinutes} minutes. Immediate explanation required.`,
        ],
      );

      // Also create an entry in a dedicated overdue tracking table
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS finops_overdue_tracking (
          id SERIAL PRIMARY KEY,
          task_id INTEGER NOT NULL,
          subtask_id INTEGER,
          task_name VARCHAR(255),
          subtask_name VARCHAR(255),
          assigned_to VARCHAR(255),
          overdue_minutes INTEGER DEFAULT 0,
          reason_provided BOOLEAN DEFAULT FALSE,
          reason_text TEXT,
          overdue_detected_at TIMESTAMP DEFAULT NOW(),
          reason_provided_at TIMESTAMP,
          status VARCHAR(50) DEFAULT 'pending_reason',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `;

      await pool.query(createTableQuery);

      // Insert tracking record
      await pool.query(
        `
        INSERT INTO finops_overdue_tracking
        (task_id, subtask_id, task_name, subtask_name, assigned_to, overdue_minutes, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending_reason')
        ON CONFLICT DO NOTHING
      `,
        [
          task.id,
          subtask.id,
          task.task_name,
          subtask.name,
          task.assigned_to,
          overdueMinutes,
        ],
      );

      console.log(
        `✅ Overdue reason request created for ${task.task_name} - ${subtask.name}`,
      );
    } catch (error) {
      console.error("Error creating overdue reason request:", error);
    }
  }

  /**
   * Log activity
   */
  private async logActivity(
    taskId: number,
    subtaskId: string | null,
    action: string,
    userName: string,
    details: string,
  ): Promise<void> {
    try {
      await pool.query(
        `
        INSERT INTO finops_activity_log (task_id, subtask_id, action, user_name, details)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [taskId, subtaskId, action, userName, details],
      );
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  }

  /**
   * Check for incomplete subtasks and send alerts
   */
  async checkIncompleteSubtasks(): Promise<void> {
    try {
      console.log("Checking for incomplete subtasks...");

      const incompleteSubtasks = await pool.query(`
        SELECT t.*, st.*, 
               t.task_name, t.assigned_to, t.reporting_managers, t.escalation_managers
        FROM finops_subtasks st
        JOIN finops_tasks t ON st.task_id = t.id
        WHERE st.status = 'in_progress'
        AND st.started_at < (CURRENT_TIMESTAMP - INTERVAL '2 hours')
        AND t.is_active = true
        AND t.deleted_at IS NULL
      `);

      for (const row of incompleteSubtasks.rows) {
        await this.sendIncompleteSubtaskAlert(row);
      }

      console.log(
        `Incomplete subtask check completed. Found ${incompleteSubtasks.rows.length} incomplete subtasks`,
      );
    } catch (error) {
      console.error("Error checking incomplete subtasks:", error);
    }
  }

  /**
   * Send alert for incomplete subtasks
   */
  private async sendIncompleteSubtaskAlert(subtaskData: any): Promise<void> {
    try {
      const recipients = [
        {
          name: subtaskData.assigned_to,
          email: `${subtaskData.assigned_to.toLowerCase().replace(" ", ".")}@company.com`,
          type: "assigned" as const,
        },
        ...this.parseManagers(subtaskData.reporting_managers).map(
          (name: string) => ({
            name,
            email: `${name.toLowerCase().replace(" ", ".")}@company.com`,
            type: "reporting" as const,
          }),
        ),
      ];

      const subject = `📋 Incomplete Subtask Alert: ${subtaskData.task_name}`;
      const message = `
        <h2>Incomplete Subtask Alert</h2>
        <p><strong>Task:</strong> ${subtaskData.task_name}</p>
        <p><strong>Subtask:</strong> ${subtaskData.name}</p>
        <p><strong>Status:</strong> ${subtaskData.status}</p>
        <p><strong>Started At:</strong> ${new Date(subtaskData.started_at).toLocaleString()}</p>
        <p><strong>Assigned To:</strong> ${subtaskData.assigned_to}</p>
        
        <p>This subtask has been in progress for more than 2 hours. Please review and update the status.</p>
        
        <hr>
        <p><small>This is an automated alert from the FinOps Task Management System.</small></p>
      `;

      await this.sendEmailAlerts(recipients, subject, message);
      await this.logAlert(
        subtaskData.task_id,
        subtaskData.id,
        "subtask_incomplete",
        "assigned_user,reporting_managers",
        0,
      );
    } catch (error) {
      console.error("Error sending incomplete subtask alert:", error);
    }
  }
}

export default new FinOpsAlertService();
