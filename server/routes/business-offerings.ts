import { Router, Request, Response } from "express";
import { BusinessOfferingRepository } from "../models/BusinessOffering";
import { DatabaseValidator } from "../utils/validation";

const router = Router();

async function isDb() {
  try {
    return await DatabaseValidator.isDatabaseAvailable();
  } catch {
    return false;
  }
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    if (!(await isDb())) return res.json([]);
    const rows = await BusinessOfferingRepository.findAll();
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDb())) return res.status(404).json({ error: "Not found" });
    const id = parseInt(req.params.id);
    const row = await BusinessOfferingRepository.findById(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const created = await BusinessOfferingRepository.create(req.body || {});
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const id = parseInt(req.params.id);
    const updated = await BusinessOfferingRepository.update(id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const id = parseInt(req.params.id);
    const ok = await BusinessOfferingRepository.delete(id);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// Steps endpoints
router.get("/:id/steps", async (req: Request, res: Response) => {
  try {
    if (!(await isDb())) return res.json([]);
    const boId = parseInt(req.params.id);
    if (isNaN(boId)) return res.status(400).json({ error: "Invalid id" });

    let stepsResult = await (
      await import("../database/connection")
    ).pool.query(
      `SELECT * FROM business_offer_steps WHERE business_offering_id = $1 ORDER BY order_index ASC, created_at ASC`,
      [boId],
    );
    let steps = stepsResult.rows;

    if (!steps || steps.length === 0) {
      // Seed from template steps
      const { pool } = await import("../database/connection");
      const boRow = await pool.query(
        `SELECT template_id, created_by FROM business_offerings WHERE id = $1`,
        [boId],
      );
      const templateId = boRow.rows?.[0]?.template_id;
      const createdBy = boRow.rows?.[0]?.created_by || 1;
      if (templateId) {
        const tpl = await pool.query(
          `SELECT name, description, step_order, default_eta_days, probability_percent FROM template_steps WHERE template_id = $1 ORDER BY step_order ASC`,
          [templateId],
        );
        for (const [idx, t] of tpl.rows.entries()) {
          await pool.query(
            `INSERT INTO business_offer_steps (business_offering_id, name, description, status, priority, assigned_to, due_date, completed_date, order_index, probability_percent, created_by)
             VALUES ($1,$2,$3,'pending','medium',NULL,NULL,NULL,$4,$5,$6)`,
            [
              boId,
              t.name,
              t.description,
              t.step_order ?? idx + 1,
              t.probability_percent ?? 0,
              createdBy,
            ],
          );
        }
        stepsResult = await pool.query(
          `SELECT * FROM business_offer_steps WHERE business_offering_id = $1 ORDER BY order_index ASC, created_at ASC`,
          [boId],
        );
        steps = stepsResult.rows;
      }
    }

    res.json(steps);
  } catch (e: any) {
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/:id/steps", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const boId = parseInt(req.params.id);
    if (isNaN(boId)) return res.status(400).json({ error: "Invalid id" });
    const b = req.body || {};
    const { pool } = await import("../database/connection");
    const r = await pool.query(
      `INSERT INTO business_offer_steps (business_offering_id, name, description, status, priority, assigned_to, due_date, order_index, probability_percent, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        boId,
        b.name,
        b.description || null,
        b.status || "pending",
        b.priority || "medium",
        b.assigned_to || null,
        b.due_date || null,
        b.order_index || 0,
        b.probability_percent || 0,
        b.created_by || null,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/steps/:stepId", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step id" });
    const data = req.body || {};
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields.push(`${k} = $${i}`);
        values.push(v);
        i++;
      }
    }
    if (!fields.length) {
      const { pool } = await import("../database/connection");
      const cur = await pool.query(
        `SELECT * FROM business_offer_steps WHERE id = $1`,
        [stepId],
      );
      return res.json(cur.rows[0] || null);
    }
    values.push(stepId);
    const { pool } = await import("../database/connection");
    const r = await pool.query(
      `UPDATE business_offer_steps SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    res.json(r.rows[0] || null);
  } catch (e: any) {
    res.status(500).json({ error: "Failed" });
  }
});

router.put("/:id/steps/reorder", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const boId = parseInt(req.params.id);
    if (isNaN(boId)) return res.status(400).json({ error: "Invalid id" });
    const stepOrders: Array<{
      id: number;
      order_index?: number;
      order?: number;
    }> = Array.isArray(req.body?.stepOrders) ? req.body.stepOrders : [];
    if (!stepOrders.length)
      return res.status(400).json({ error: "No step orders provided" });
    const { pool } = await import("../database/connection");
    await pool.query("BEGIN");
    for (let i = 0; i < stepOrders.length; i++) {
      const s = stepOrders[i];
      const newOrder = (s.order_index ?? s.order ?? i) + 1;
      await pool.query(
        `UPDATE business_offer_steps SET order_index = $1, updated_at = NOW() WHERE id = $2 AND business_offering_id = $3`,
        [newOrder, s.id, boId],
      );
    }
    await pool.query("COMMIT");
    res.json({ success: true });
  } catch (e: any) {
    try {
      (await import("../database/connection")).pool.query("ROLLBACK");
    } catch {}
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/steps/:stepId", async (req: Request, res: Response) => {
  try {
    if (!(await isDb()))
      return res.status(503).json({ error: "Database unavailable" });
    const stepId = parseInt(req.params.stepId);
    if (isNaN(stepId))
      return res.status(400).json({ error: "Invalid step id" });
    const { pool } = await import("../database/connection");
    const r = await pool.query(
      `DELETE FROM business_offer_steps WHERE id = $1`,
      [stepId],
    );
    res.json({ success: r.rowCount > 0 });
  } catch (e: any) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
