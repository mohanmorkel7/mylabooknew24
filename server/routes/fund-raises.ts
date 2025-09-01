import { Router, Request, Response } from "express";
import { FundRaiseRepository } from "../models/FundRaise";
import { isDatabaseAvailable, pool, withTimeout } from "../database/connection";

const router = Router();

// Progress data for Fund Raises (for dashboard charts)
router.get("/progress", async (_req: Request, res: Response) => {
  try {
    let progressData: any[] = [];
    try {
      if (await isDatabaseAvailable()) {
        // Attempt to read progress from fund_raise_steps table if it exists
        // Get recent fund raises
        const fundRaisesResult: any = await withTimeout(
          pool.query(
            `SELECT id as fr_id, vc_id, investor_name, ui_status, status, round_stage
             FROM fund_raises
             ORDER BY created_at DESC
             LIMIT 20`,
          ),
          7000,
        );
        const fundRaises = fundRaisesResult.rows || [];

        for (const fr of fundRaises) {
          try {
            const stepsResult: any = await withTimeout(
              pool.query(
                `SELECT id, name, status, order_index, probability_percent
                 FROM fund_raise_steps
                 WHERE fund_raise_id = $1
                 ORDER BY order_index ASC`,
                [fr.fr_id],
              ),
              5000,
            );
            const steps = stepsResult.rows || [];
            const completedSteps = steps.filter(
              (s: any) => s.status === "completed",
            );
            const totalCompletedProbability = Math.round(
              completedSteps.reduce(
                (sum: number, s: any) =>
                  sum + (parseFloat(s.probability_percent) || 0),
                0,
              ),
            );
            const currentStep =
              steps.find((s: any) => s.status === "in_progress") ||
              steps.find((s: any) => s.status === "pending") ||
              null;

            progressData.push({
              vc_id: fr.vc_id, // for click-through
              round_title: fr.round_stage || "Fund Raise",
              investor_name: fr.investor_name,
              status: fr.status || "in-progress",
              completed_count: completedSteps.length,
              total_completed_probability: totalCompletedProbability,
              completed_steps: completedSteps.map((s: any) => ({
                name: s.name,
                probability: parseFloat(s.probability_percent) || 0,
                status: s.status,
              })),
              current_step: currentStep
                ? {
                    name: currentStep.name,
                    probability:
                      parseFloat(currentStep.probability_percent) || 0,
                  }
                : null,
              all_steps: steps.map((s: any) => ({
                name: s.name,
                status: s.status,
                probability: parseFloat(s.probability_percent) || 0,
              })),
            });
          } catch (stepErr: any) {
            // If steps table missing or query fails, skip this fr
            continue;
          }
        }
      } else {
        // Mock progress data when DB is unavailable
        progressData = [
          {
            vc_id: 1,
            round_title: "Series A",
            investor_name: "Alpha Ventures",
            status: "in-progress",
            completed_count: 2,
            total_completed_probability: 40,
            completed_steps: [
              { name: "Initial Pitch", probability: 20, status: "completed" },
              { name: "Product Demo", probability: 20, status: "completed" },
            ],
            current_step: { name: "Due Diligence", probability: 20 },
            all_steps: [
              { name: "Initial Pitch", status: "completed", probability: 20 },
              { name: "Product Demo", status: "completed", probability: 20 },
              { name: "Due Diligence", status: "in_progress", probability: 20 },
              { name: "Term Sheet", status: "pending", probability: 20 },
              { name: "Legal Review", status: "pending", probability: 20 },
            ],
          },
          {
            vc_id: 2,
            round_title: "Seed Round",
            investor_name: "Beta Capital",
            status: "in-progress",
            completed_count: 1,
            total_completed_probability: 20,
            completed_steps: [
              { name: "Initial Pitch", probability: 20, status: "completed" },
            ],
            current_step: { name: "Product Demo", probability: 20 },
            all_steps: [
              { name: "Initial Pitch", status: "completed", probability: 20 },
              { name: "Product Demo", status: "in_progress", probability: 20 },
              { name: "Due Diligence", status: "pending", probability: 20 },
            ],
          },
        ];
      }
    } catch (dbErr: any) {
      // Fallback mock on any error
      progressData = [
        {
          vc_id: 3,
          round_title: "Bridge",
          investor_name: "Gamma Partners",
          status: "in-progress",
          completed_count: 1,
          total_completed_probability: 20,
          completed_steps: [
            { name: "Initial Pitch", probability: 20, status: "completed" },
          ],
          current_step: { name: "Product Demo", probability: 20 },
          all_steps: [
            { name: "Initial Pitch", status: "completed", probability: 20 },
            { name: "Product Demo", status: "in_progress", probability: 20 },
            { name: "Due Diligence", status: "pending", probability: 20 },
          ],
        },
      ];
    }

    res.json(progressData);
  } catch (error: any) {
    console.error("Error fetching fund raise progress:", error.message);
    res.status(500).json({ error: "Failed" });
  }
});

// Get all fund raises
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const rows = await FundRaiseRepository.findAll();
      return res.json(rows);
    }
    return res.json([]);
  } catch (error: any) {
    console.error("Error fetching fund_raises:", error.message);
    return res.json([]);
  }
});

// Get by id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = parseInt(req.params.id);
      const row = await FundRaiseRepository.findById(id);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("Error fetching fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Get by VC id
router.get("/by-vc/:vcId", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const vcId = parseInt(req.params.vcId);
      const rows = await FundRaiseRepository.findByVC(vcId);
      return res.json(rows);
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("Error fetching fund_raise by vc:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Create full fund raise
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (await isDatabaseAvailable()) {
      // If vc_id provided, ensure it exists to avoid FK errors
      if (body.vc_id) {
        try {
          const { pool } = await import("../database/connection");
          const check = await pool.query("SELECT 1 FROM vcs WHERE id = $1", [
            Number(body.vc_id),
          ]);
          if (check.rowCount === 0) {
            return res.status(202).json({
              warning:
                "VC not found in database; fund raise record not created",
              vc_id: body.vc_id,
            });
          }
        } catch (e) {
          // continue; FK will enforce
        }
      }

      const row = await FundRaiseRepository.createFull({
        vc_id: body.vc_id ?? null,
        investor_name: body.investor_name ?? null,
        ui_status:
          body.ui_status ??
          body.uiStatus ??
          body.status_ui ??
          body.statusLabel ??
          "WIP",
        status: body.status ?? null,
        investor_status: body.investor_status ?? null,
        round_stage: body.round_stage ?? null,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        total_raise_mn: body.total_raise_mn ?? null,
        valuation_mn: body.valuation_mn ?? null,
        reason: body.reason ?? null,
        template_id: body.template_id ?? null,
        created_by: body.created_by ?? null,
        updated_by: body.updated_by ?? null,
      });
      return res.status(201).json(row);
    }
    return res.status(503).json({ error: "Database unavailable" });
  } catch (error: any) {
    if (error && error.code === "23503") {
      return res
        .status(202)
        .json({ warning: "Invalid vc_id, record not created" });
    }
    console.error("Error creating fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Update by id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = parseInt(req.params.id);
      const updated = await FundRaiseRepository.update(id, req.body || {});
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    }
    return res.status(503).json({ error: "Database unavailable" });
  } catch (error: any) {
    console.error("Error updating fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Delete by id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const id = parseInt(req.params.id);
      const ok = await FundRaiseRepository.delete(id);
      return res.json({ success: ok });
    }
    return res.status(503).json({ error: "Database unavailable" });
  } catch (error: any) {
    console.error("Error deleting fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
