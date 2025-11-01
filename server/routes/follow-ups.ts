import { Router, Request, Response } from "express";
import { pool } from "../database/connection";
import { normalizeUserId } from "../services/mockData";

const router = Router();

// IST helpers
const IST_TIMEZONE = "Asia/Kolkata";
function toISTDate(date: any): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const utcMs = d.getTime();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs);
}
function toISTDisplay(date: any): string | null {
  const d = toISTDate(date);
  if (!d) return null;
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const parts = new Intl.DateTimeFormat("en-IN", opts).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")?.toUpperCase()}`;
}
function toISTISO(date: any): string | null {
  const d = toISTDate(date);
  if (!d) return null;
  return d.toISOString().replace(/Z$/, "+05:30");
}
function addISTFields(row: any) {
  if (!row || typeof row !== "object") return row;
  const fields = ["due_date", "created_at", "updated_at", "completed_at"];
  for (const f of fields) {
    const v = (row as any)[f];
    (row as any)[`${f}_ist`] = toISTDisplay(v);
    (row as any)[`${f}_ist_iso`] = toISTISO(v);
  }
  return row;
}

// Enhanced helper function with better error handling and timeout
async function isDatabaseAvailable() {
  try {
    // Add a 5-second timeout to prevent long waits
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database query timeout")), 5000),
    );

    const queryPromise = pool.query("SELECT 1");

    await Promise.race([queryPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.log("Database not available:", error.message);
    return false;
  }
}

// Create a new follow-up
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      client_id,
      lead_id,
      step_id,
      vc_id,
      vc_step_id,
      business_offering_id,
      business_offering_step_id,
      title,
      description,
      due_date,
      follow_up_type = "general",
      assigned_to,
      created_by,
      message_id,
    } = req.body;

    if (await isDatabaseAvailable()) {
      try {
        // Check if VC and business offering columns exist in follow_ups table
        const columnCheck = await pool.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'follow_ups'
          AND column_name IN ('vc_id', 'vc_step_id', 'business_offering_id', 'business_offering_step_id', 'assigned_to_list')
        `);

        const hasVCColumns = columnCheck.rows.some((row) =>
          ["vc_id", "vc_step_id"].includes(row.column_name),
        );
        const hasBusinessOfferingColumns = columnCheck.rows.some((row) =>
          ["business_offering_id", "business_offering_step_id"].includes(
            row.column_name,
          ),
        );
        let hasAssignedList = columnCheck.rows.some(
          (row) => row.column_name === "assigned_to_list",
        );

        // Ensure assigned_to_list column exists
        if (!hasAssignedList) {
          try {
            await pool.query(
              `ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS assigned_to_list JSONB DEFAULT '[]'::jsonb`,
            );
            hasAssignedList = true;
          } catch (e: any) {
            console.warn("Could not add assigned_to_list column:", e.message);
          }
        }

        let query, values;

        if (hasVCColumns) {
          // Handle fund raise steps vs VC steps differently
          let resolvedVcId = vc_id;
          let resolvedVcStepId = vc_step_id;

          // If vc_step_id is provided, check if it's a fund_raise_step or actual vc_step
          if (vc_step_id && !vc_id) {
            try {
              // First check if it's a fund_raise_step
              const fundRaiseStepResult = await pool.query(
                `
                SELECT fr.vc_id
                FROM fund_raise_steps frs
                JOIN fund_raises fr ON frs.fund_raise_id = fr.id
                WHERE frs.id = $1
              `,
                [vc_step_id],
              );

              if (fundRaiseStepResult.rows.length > 0) {
                // This is a fund_raise_step, so get vc_id but don't use vc_step_id
                resolvedVcId = fundRaiseStepResult.rows[0].vc_id;
                resolvedVcStepId = null; // Don't use vc_step_id for fund raise steps
                console.log(
                  `Resolved vc_id ${resolvedVcId} for fund_raise_step ${vc_step_id}, setting vc_step_id to null`,
                );
              } else {
                // Check if it's a real vc_step
                const vcStepResult = await pool.query(
                  `SELECT vc_id FROM vc_steps WHERE id = $1`,
                  [vc_step_id],
                );
                if (vcStepResult.rows.length > 0) {
                  resolvedVcId = vcStepResult.rows[0].vc_id;
                  console.log(
                    `Found real vc_step ${vc_step_id} with vc_id ${resolvedVcId}`,
                  );
                }
              }
            } catch (error) {
              console.log("Could not resolve step type:", error.message);
            }
          }

          // Full query with VC and business offering support
          query = hasAssignedList
            ? `
            INSERT INTO follow_ups (
              client_id, lead_id, step_id, vc_id, vc_step_id, business_offering_id, business_offering_step_id,
              title, description, due_date, follow_up_type, assigned_to, created_by, message_id, assigned_to_list
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
          `
            : `
            INSERT INTO follow_ups (
              client_id, lead_id, step_id, vc_id, vc_step_id, business_offering_id, business_offering_step_id,
              title, description, due_date, follow_up_type, assigned_to, created_by, message_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
          `;

          // Set default due date to 3 days from now (preserve time, store as UTC ISO)
          const defaultDueDate =
            due_date ||
            new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

          // For fund raise steps, store the fund_raise_step_id in message_id field for reference
          let finalMessageId = message_id;
          if (!resolvedVcStepId && vc_step_id) {
            // This is a fund raise step, store it in message_id for reference
            finalMessageId = vc_step_id;
            console.log(
              `📋 Storing fund_raise_step_id ${vc_step_id} in message_id for follow-up`,
            );
          }

          // Handle business offering step resolution
          let resolvedBusinessOfferingId = business_offering_id;
          let finalBusinessOfferingStepId = business_offering_step_id;

          // For business offering steps, store the business_offering_step_id in message_id field for reference
          if (business_offering_step_id && !finalMessageId) {
            try {
              // Check if it's a business offering step and get the business offering ID
              const businessOfferingStepResult = await pool.query(
                `SELECT business_offering_id FROM business_offer_steps WHERE id = $1`,
                [business_offering_step_id],
              );

              if (businessOfferingStepResult.rows.length > 0) {
                resolvedBusinessOfferingId =
                  businessOfferingStepResult.rows[0].business_offering_id;
                finalMessageId = business_offering_step_id; // Store step id in message_id for reference
                console.log(
                  `📋 Resolved business_offering_id ${resolvedBusinessOfferingId} for business_offering_step ${business_offering_step_id}`,
                );
              }
            } catch (error) {
              console.log(
                "Could not resolve business offering step:",
                error.message,
              );
            }
          }

          console.log(`📋 Creating follow-up with:`, {
            vc_id: resolvedVcId,
            vc_step_id: resolvedVcStepId,
            business_offering_id: resolvedBusinessOfferingId,
            business_offering_step_id: finalBusinessOfferingStepId,
            fund_raise_step_id: finalMessageId,
            title,
          });

          values = [
            client_id || null,
            lead_id || null,
            step_id || null,
            resolvedVcId || null,
            resolvedVcStepId || null,
            resolvedBusinessOfferingId || null,
            finalBusinessOfferingStepId || null,
            title,
            description || null,
            defaultDueDate,
            follow_up_type,
            assigned_to || null,
            created_by,
            finalMessageId,
          ];
          if (hasAssignedList) {
            values.push(JSON.stringify(req.body.assigned_to_list || []));
          }
        } else {
          // Legacy query without VC support
          if (vc_id || vc_step_id) {
            console.log(
              "⚠️ VC follow-up requested but VC columns don't exist in follow_ups table",
            );
            return res.status(400).json({
              error:
                "VC follow-ups not supported. Database migration required.",
            });
          }

          query = `
            INSERT INTO follow_ups (
              client_id, lead_id, step_id, title, description, due_date,
              follow_up_type, assigned_to, created_by, message_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
          `;

          values = [
            client_id || null,
            lead_id || null,
            step_id || null,
            title,
            description || null,
            due_date || null,
            follow_up_type,
            assigned_to || null,
            created_by,
            message_id || null,
          ];
        }

        const result = await pool.query(query, values);
        const followUp = result.rows[0];

        res.status(201).json(addISTFields({ ...followUp }));
      } catch (dbError) {
        console.error("Database insertion error:", dbError.message);
        // If database error (like missing column), run migration and fall back to mock
        if (
          dbError.message.includes("follow_up_type") ||
          dbError.message.includes("lead_id") ||
          dbError.message.includes("step_id") ||
          dbError.message.includes("message_id")
        ) {
          console.log("Attempting to run migration...");
          try {
            // Try to add missing columns
            await pool.query(`
              ALTER TABLE follow_ups
              ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id),
              ADD COLUMN IF NOT EXISTS step_id INTEGER REFERENCES lead_steps(id),
              ADD COLUMN IF NOT EXISTS message_id INTEGER,
              ADD COLUMN IF NOT EXISTS follow_up_type VARCHAR(50) DEFAULT 'general',
              ADD COLUMN IF NOT EXISTS business_offering_id INTEGER,
              ADD COLUMN IF NOT EXISTS business_offering_step_id INTEGER
            `);

            // Drop and recreate constraints
            await pool.query(`
              ALTER TABLE follow_ups DROP CONSTRAINT IF EXISTS follow_ups_follow_up_type_check;
              ALTER TABLE follow_ups DROP CONSTRAINT IF EXISTS follow_ups_status_check;
              ALTER TABLE follow_ups
              ADD CONSTRAINT follow_ups_follow_up_type_check
              CHECK (follow_up_type IN ('call', 'email', 'meeting', 'document', 'proposal', 'contract', 'onboarding', 'general', 'sales', 'support', 'other'));
              ALTER TABLE follow_ups
              ADD CONSTRAINT follow_ups_status_check
              CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue'))
            `);

            console.log("Migration completed, retrying insert...");
            // Retry the insert with fallback query (without VC columns)
            const retryQuery = `
              INSERT INTO follow_ups (
                client_id, lead_id, step_id, business_offering_id, business_offering_step_id,
                title, description, due_date, follow_up_type, assigned_to, created_by, message_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *
            `;
            const retryValues = [
              client_id || null,
              lead_id || null,
              step_id || null,
              business_offering_id || null,
              business_offering_step_id || null,
              title,
              description || null,
              due_date || null,
              follow_up_type,
              assigned_to || null,
              created_by,
              message_id || null,
            ];
            const retryResult = await pool.query(retryQuery, retryValues);
            return res.status(201).json(retryResult.rows[0]);
          } catch (migrationError) {
            console.error("Migration failed:", migrationError.message);
          }
        }

        // Handle strict context constraint preventing business offering follow-ups
        if (
          ((dbError as any).code === "23514" &&
            dbError.message.includes("chk_follow_up_context")) ||
          dbError.message.includes("chk_follow_up_context")
        ) {
          try {
            await pool.query(`
              ALTER TABLE follow_ups DROP CONSTRAINT IF EXISTS chk_follow_up_context;
              ALTER TABLE follow_ups
              ADD CONSTRAINT chk_follow_up_context
              CHECK (
                ((CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) +
                 (CASE WHEN vc_id IS NOT NULL THEN 1 ELSE 0 END) +
                 (CASE WHEN business_offering_id IS NOT NULL THEN 1 ELSE 0 END)) = 1
              ) NOT VALID;
            `);
            // Re-attempt insert with a safe fallback insert (business offering aware)
            const retryQuery2 = `
              INSERT INTO follow_ups (
                client_id, lead_id, step_id, business_offering_id, business_offering_step_id,
                title, description, due_date, follow_up_type, assigned_to, created_by, message_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *
            `;
            const fallbackDueDate =
              (due_date as any) ||
              new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
            const retryValues2 = [
              client_id || null,
              lead_id || null,
              step_id || null,
              business_offering_id || null,
              business_offering_step_id || null,
              title,
              description || null,
              fallbackDueDate,
              follow_up_type,
              assigned_to || null,
              created_by,
              message_id || null,
            ];
            const retry = await pool.query(retryQuery2, retryValues2 as any[]);
            return res.status(201).json(retry.rows[0]);
          } catch (constraintError: any) {
            console.error(
              "Failed to update chk_follow_up_context:",
              constraintError.message,
            );
          }
        }

        // Fallback to mock response
        throw dbError;
      }
    } else {
      // Return mock follow-up when database is unavailable
      const mockFollowUp = {
        id: Date.now(),
        client_id,
        lead_id,
        step_id,
        business_offering_id,
        business_offering_step_id,
        title,
        description,
        due_date,
        follow_up_type,
        assigned_to,
        created_by,
        message_id,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log("Database unavailable, returning mock follow-up response");
      res.status(201).json(addISTFields({ ...mockFollowUp }));
    }
  } catch (error) {
    console.error("Error creating follow-up:", error);
    // Return mock response on error as well
    const mockFollowUp = {
      id: Date.now(),
      client_id: req.body.client_id,
      lead_id: req.body.lead_id,
      step_id: req.body.step_id,
      title: req.body.title,
      description: req.body.description,
      due_date: req.body.due_date,
      follow_up_type: req.body.follow_up_type || "general",
      assigned_to: req.body.assigned_to,
      created_by: req.body.created_by,
      message_id: req.body.message_id,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("Database error, returning mock follow-up response");
    res.status(201).json(addISTFields({ ...mockFollowUp }));
  }
});

// Get follow-ups for a client
router.get("/client/:clientId", async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);

    if (await isDatabaseAvailable()) {
      const query = `
        SELECT f.*,
               CONCAT(u.first_name, ' ', u.last_name) as assigned_user_name,
               CONCAT(c.first_name, ' ', c.last_name) as created_by_name
        FROM follow_ups f
        LEFT JOIN users u ON f.assigned_to = u.id
        LEFT JOIN users c ON f.created_by = c.id
        WHERE f.client_id = $1
        ORDER BY f.created_at DESC
      `;

      const result = await pool.query(query, [clientId]);
      res.json(result.rows.map((row: any) => addISTFields({ ...row })));
    } else {
      // Return empty array when database is unavailable
      console.log("Database unavailable, returning empty follow-ups array");
      res.json([]);
    }
  } catch (error) {
    console.error("Error fetching follow-ups:", error);
    // Return empty array on error
    res.json([]);
  }
});

// Get follow-ups for a lead
router.get("/lead/:leadId", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.leadId);

    if (await isDatabaseAvailable()) {
      const query = `
        SELECT f.*,
               CONCAT(u.first_name, ' ', u.last_name) as assigned_user_name,
               CONCAT(c.first_name, ' ', c.last_name) as created_by_name
        FROM follow_ups f
        LEFT JOIN users u ON f.assigned_to = u.id
        LEFT JOIN users c ON f.created_by = c.id
        WHERE f.lead_id = $1
        ORDER BY f.created_at DESC
      `;

      const result = await pool.query(query, [leadId]);
      res.json(result.rows.map((row: any) => addISTFields({ ...row })));
    } else {
      // Return empty array when database is unavailable
      console.log("Database unavailable, returning empty follow-ups array");
      res.json([]);
    }
  } catch (error) {
    console.error("Error fetching follow-ups:", error);
    // Return empty array on error
    res.json([]);
  }
});

// Get single follow-up by id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    if (await isDatabaseAvailable()) {
      const r = await pool.query("SELECT * FROM follow_ups WHERE id = $1", [
        id,
      ]);
      if (r.rows.length === 0)
        return res.status(404).json({ error: "Not found" });
      return res.json(addISTFields({ ...r.rows[0] }));
    }
    // Mock when DB down
    return res.json({ id, status: "pending" });
  } catch (e: any) {
    return res.json({ id: parseInt(req.params.id), status: "pending" });
  }
});

// Update follow-up status
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const followUpId = parseInt(req.params.id);
    const { status, completed_at } = req.body;

    if (await isDatabaseAvailable()) {
      const query = `
        UPDATE follow_ups
        SET status = $1, completed_at = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const values = [status, completed_at || null, followUpId];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Follow-up not found" });
      }

      res.json(result.rows[0]);
    } else {
      // Return mock updated follow-up when database is unavailable
      const mockUpdatedFollowUp = {
        id: followUpId,
        status,
        completed_at: completed_at || null,
        updated_at: new Date().toISOString(),
      };

      console.log("Database unavailable, returning mock follow-up update");
      res.json(mockUpdatedFollowUp);
    }
  } catch (error) {
    console.error("Error updating follow-up:", error);
    // Return mock response on error
    const mockUpdatedFollowUp = {
      id: parseInt(req.params.id),
      status: req.body.status,
      completed_at: req.body.completed_at || null,
      updated_at: new Date().toISOString(),
    };

    console.log("Database error, returning mock follow-up update");
    res.json(mockUpdatedFollowUp);
  }
});

// Get all follow-ups with role-based filtering
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userId, userRole, status, assigned_to } = req.query;

    if (await isDatabaseAvailable()) {
      let whereClause = "WHERE 1=1";
      const queryParams: any[] = [];

      // Role-based filtering
      if (userRole === "sales" && userId) {
        // Sales users see follow-ups assigned to them or created by them
        whereClause += ` AND (f.assigned_to = $${queryParams.length + 1} OR f.created_by = $${queryParams.length + 1})`;
        queryParams.push(parseInt(userId as string));
      } else if (userRole === "product" && userId) {
        // Product users see follow-ups assigned to them or created by them
        whereClause += ` AND (f.assigned_to = $${queryParams.length + 1} OR f.created_by = $${queryParams.length + 1})`;
        queryParams.push(parseInt(userId as string));
      }
      // Admin users see all follow-ups (no additional filter needed)

      // Status filtering
      if (status) {
        whereClause += ` AND f.status = $${queryParams.length + 1}`;
        queryParams.push(status);
      }

      // Assigned to filtering
      if (assigned_to) {
        whereClause += ` AND f.assigned_to = $${queryParams.length + 1}`;
        queryParams.push(parseInt(assigned_to as string));
      }

      // Check if VC, business offering and assigned list columns exist in follow_ups table
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'follow_ups'
        AND column_name IN ('vc_id', 'vc_step_id', 'business_offering_id', 'business_offering_step_id', 'assigned_to_list')
      `);

      const hasVCColumns = columnCheck.rows.some((row) =>
        ["vc_id", "vc_step_id"].includes(row.column_name),
      );
      const hasBusinessOfferingColumns = columnCheck.rows.some((row) =>
        ["business_offering_id", "business_offering_step_id"].includes(
          row.column_name,
        ),
      );
      const hasAssignedList = columnCheck.rows.some(
        (row) => row.column_name === "assigned_to_list",
      );

      // If business offering columns are missing, add them
      let finalHasBusinessOfferingColumns = hasBusinessOfferingColumns;
      if (!hasBusinessOfferingColumns) {
        try {
          console.log(
            "Adding missing business offering columns to follow_ups table...",
          );
          await pool.query(`
            ALTER TABLE follow_ups
            ADD COLUMN IF NOT EXISTS business_offering_id INTEGER,
            ADD COLUMN IF NOT EXISTS business_offering_step_id INTEGER
          `);
          console.log("✅ Business offering columns added successfully");
          finalHasBusinessOfferingColumns = true; // Update flag after successful migration
        } catch (migrationError) {
          console.error(
            "❌ Failed to add business offering columns:",
            migrationError.message,
          );
        }
      }

      let query;
      if (hasVCColumns) {
        // Build query based on available columns
        const businessOfferingSelect = finalHasBusinessOfferingColumns
          ? `, bo.solution as business_offering_solution,
               bo.product as business_offering_product,
               bos.name as business_offering_step_name,
               bo.id as business_offering_id`
          : `, NULL as business_offering_solution,
               NULL as business_offering_product,
               NULL as business_offering_step_name,
               NULL as business_offering_id`;

        const businessOfferingJoins = finalHasBusinessOfferingColumns
          ? `LEFT JOIN business_offerings bo ON f.business_offering_id = bo.id
             LEFT JOIN business_offer_steps bos ON f.business_offering_step_id = bos.id`
          : "";

        const assignedListSelect = hasAssignedList
          ? `, f.assigned_to_list,
              (
                SELECT string_agg(CONCAT(u2.first_name, ' ', u2.last_name), ', ')
                FROM users u2
                JOIN LATERAL jsonb_array_elements_text(f.assigned_to_list) AS j(uid) ON true
                WHERE u2.id = (j.uid)::int
              ) as assigned_users_names`
          : `, NULL as assigned_to_list, NULL as assigned_users_names`;

        // Full query with VC, Fund Raise and conditional Business Offering support
        query = `
          SELECT f.*,
                 CONCAT(u.first_name, ' ', u.last_name) as assigned_user_name,
                 CONCAT(c.first_name, ' ', c.last_name) as created_by_name,
                 cl.client_name,
                 l.client_name as lead_client_name,
                 l.project_title as lead_project_title,
                 COALESCE(fr.investor_name, v.round_title) as vc_round_title,
                 COALESCE(fr.investor_name, v.investor_name) as investor_name,
                 vs.name as vc_step_name,
                 fr.round_stage as fund_raise_stage,
                 fr.id as fund_raise_id${businessOfferingSelect}
                 ${assignedListSelect}
          FROM follow_ups f
          LEFT JOIN users u ON f.assigned_to = u.id
          LEFT JOIN users c ON f.created_by = c.id
          LEFT JOIN clients cl ON f.client_id = cl.id
          LEFT JOIN leads l ON f.lead_id = l.id
          LEFT JOIN vcs v ON f.vc_id = v.id
          LEFT JOIN vc_steps vs ON f.vc_step_id = vs.id
          LEFT JOIN fund_raise_steps frs ON (
            f.vc_step_id IS NULL
            AND f.message_id IS NOT NULL
            AND frs.id = f.message_id
          )
          LEFT JOIN fund_raises fr ON fr.id = frs.fund_raise_id
          ${businessOfferingJoins}
          ${whereClause}
          ORDER BY f.created_at DESC
        `;
      } else {
        // Legacy query without VC support
        query = `
          SELECT f.*,
                 CONCAT(u.first_name, ' ', u.last_name) as assigned_user_name,
                 CONCAT(c.first_name, ' ', c.last_name) as created_by_name,
                 cl.client_name,
                 l.client_name as lead_client_name,
                 l.project_title as lead_project_title,
                 NULL as step_name,
                 NULL as vc_round_title,
                 NULL as investor_name,
                 NULL as vc_step_name,
                 NULL as fund_raise_stage,
                 NULL as fund_raise_id
          FROM follow_ups f
          LEFT JOIN users u ON f.assigned_to = u.id
          LEFT JOIN users c ON f.created_by = c.id
          LEFT JOIN clients cl ON f.client_id = cl.id
          LEFT JOIN leads l ON f.lead_id = l.id
          ${whereClause}
          ORDER BY f.created_at DESC
        `;
        console.log(
          "⚠️ VC columns not found in follow_ups table, using legacy query",
        );
      }

      console.log("📊 Follow-ups query:", query);
      console.log("��� Query params:", queryParams);

      const result = await pool.query(query, queryParams);

      console.log(`📊 Found ${result.rows.length} follow-ups`);

      // Debug VC follow-ups specifically
      const vcFollowUps = result.rows.filter((row) => row.vc_id);
      if (vcFollowUps.length > 0) {
        console.log(
          "🔍 VC Follow-ups found:",
          vcFollowUps.map((f) => ({
            id: f.id,
            vc_id: f.vc_id,
            vc_round_title: f.vc_round_title,
            investor_name: f.investor_name,
            vc_step_name: f.vc_step_name,
          })),
        );
      }

      res.json(result.rows.map((row: any) => addISTFields({ ...row })));
    } else {
      // Return mock data from MockDataService when database is unavailable
      console.log("Database unavailable, returning mock follow-ups");
      const { MockDataService } = await import("../services/mockData");

      // Get mock follow-ups based on role
      let mockFollowUps = [
        {
          id: 13,
          client_id: 1,
          lead_id: 1,
          step_id: 1,
          title: "Technical Specifications Review",
          description:
            "Review technical specifications for TechCorp integration",
          status: "pending",
          follow_up_type: "technical",
          assigned_to: 3, // Mike Johnson
          created_by: 2, // Jane Smith
          due_date: "2024-01-25",
          created_at: "2024-01-16T14:15:00+05:30",
          updated_at: "2024-01-16T14:15:00+05:30",
          assigned_user_name: "Mike Johnson",
          created_by_name: "Jane Smith",
          client_name: "TechCorp Solutions",
          lead_client_name: "TechCorp Solutions",
          lead_project_title: "E-commerce Platform Development",
          step_name: "Initial Contact",
        },
        {
          id: 14,
          client_id: 1,
          lead_id: 1,
          step_id: 2,
          title: "API Documentation",
          description: "Provide API documentation for client review",
          status: "in_progress",
          follow_up_type: "document",
          assigned_to: 1, // John Doe
          created_by: 2, // Jane Smith
          due_date: "2024-01-24",
          created_at: "2024-01-21T09:00:00+05:30",
          updated_at: "2024-01-21T09:00:00+05:30",
          assigned_user_name: "John Doe",
          created_by_name: "Jane Smith",
          client_name: "TechCorp Solutions",
          lead_client_name: "TechCorp Solutions",
          lead_project_title: "E-commerce Platform Development",
          step_name: "Document Collection",
        },
        {
          id: 15,
          client_id: 2,
          lead_id: 2,
          step_id: 3,
          title: "Timeline Assessment",
          description:
            "Assess timeline impact for additional reporting features",
          status: "completed",
          follow_up_type: "meeting",
          assigned_to: 3, // Mike Johnson
          created_by: 1, // John Doe
          due_date: "2024-01-20",
          completed_at: "2024-01-19T16:45:00+05:30",
          created_at: "2024-01-18T11:30:00+05:30",
          updated_at: "2024-01-19T16:45:00+05:30",
          assigned_user_name: "Mike Johnson",
          created_by_name: "John Doe",
          client_name: "RetailMax Inc",
          lead_client_name: "RetailMax Inc",
          lead_project_title: "Mobile App Development",
          step_name: "Proposal Sent",
        },
        {
          id: 16,
          client_id: 3,
          lead_id: 3,
          step_id: 4,
          title: "Banking Compliance Review",
          description:
            "Review banking regulations for data handling compliance",
          status: "overdue",
          follow_up_type: "compliance",
          assigned_to: 2, // Jane Smith
          created_by: 3, // Mike Johnson
          due_date: "2024-01-22",
          created_at: "2024-01-20T14:20:00+05:30",
          updated_at: "2024-01-20T14:20:00+05:30",
          assigned_user_name: "Jane Smith",
          created_by_name: "Mike Johnson",
          client_name: "FinanceFirst Bank",
          lead_client_name: "FinanceFirst Bank",
          lead_project_title: "Data Analytics Dashboard",
          step_name: "Initial Contact",
        },
      ];

      // Add VC follow-ups for admin users
      if (userRole === "admin") {
        mockFollowUps.push(
          {
            id: 17,
            vc_id: 1,
            step_id: 5,
            title: "Investment Committee Presentation",
            description:
              "Schedule and prepare presentation for Accel Partners investment committee",
            status: "pending",
            follow_up_type: "meeting",
            assigned_to: 4, // Emily Davis (VC team)
            created_by: 5, // David Kim (VC team)
            due_date: "2024-01-27",
            created_at: "2024-01-24T10:00:00+05:30",
            updated_at: "2024-01-24T10:00:00+05:30",
            assigned_user_name: "Emily Davis",
            created_by_name: "David Kim",
            vc_round_title: "Series A Funding",
            investor_name: "Accel Partners",
            step_name: "Due Diligence Review",
            fund_raise_stage: "series_a",
            fund_raise_id: 1,
            type: "vc",
          },
          {
            id: 18,
            vc_id: 2,
            step_id: 6,
            title: "Financial Projections Update",
            description:
              "Send updated Q4 financial projections to Sequoia Capital",
            status: "in_progress",
            follow_up_type: "document",
            assigned_to: 6, // Finance Team
            created_by: 7, // Bob Wilson
            due_date: "2024-01-26",
            created_at: "2024-01-23T14:30:00+05:30",
            updated_at: "2024-01-23T14:30:00+05:30",
            assigned_user_name: "Finance Team",
            created_by_name: "Bob Wilson",
            vc_round_title: "Seed Round",
            investor_name: "Sequoia Capital",
            step_name: "Financial Review",
            fund_raise_stage: "seed",
            fund_raise_id: 2,
            type: "vc",
          },
          {
            id: 19,
            vc_id: 4,
            step_id: 7,
            title: "Technical Architecture Deep Dive",
            description:
              "Technical review meeting with Lightspeed technical partners",
            status: "pending",
            follow_up_type: "meeting",
            assigned_to: 8, // Tech Lead
            created_by: 5, // David Kim
            due_date: "2024-01-30",
            created_at: "2024-01-22T09:15:00+05:30",
            updated_at: "2024-01-22T09:15:00+05:30",
            assigned_user_name: "Tech Lead",
            created_by_name: "David Kim",
            vc_round_title: "Pre-Series A",
            investor_name: "Lightspeed Venture",
            step_name: "Technical Due Diligence",
            fund_raise_stage: "pre_series_a",
            fund_raise_id: 3,
            type: "vc",
          },
        );
      }

      // Apply role-based filtering to mock data
      if (userRole === "sales" && userId) {
        const userIdNum = normalizeUserId(userId as string);
        mockFollowUps = mockFollowUps.filter(
          (f) => f.assigned_to === userIdNum || f.created_by === userIdNum,
        );
      } else if (userRole === "product" && userId) {
        const userIdNum = normalizeUserId(userId as string);
        mockFollowUps = mockFollowUps.filter(
          (f) => f.assigned_to === userIdNum || f.created_by === userIdNum,
        );
      }

      // Apply status filtering
      if (status) {
        mockFollowUps = mockFollowUps.filter((f) => f.status === status);
      }

      // Apply assigned to filtering
      if (assigned_to) {
        const assignedToNum = normalizeUserId(assigned_to as string);
        mockFollowUps = mockFollowUps.filter(
          (f) => f.assigned_to === assignedToNum,
        );
      }

      res.json(mockFollowUps);
    }
  } catch (error) {
    console.error("Error fetching all follow-ups:", error);
    res.json([]);
  }
});

export default router;
