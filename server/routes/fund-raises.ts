import { Router, Request, Response } from "express";
import { FundRaiseRepository } from "../models/FundRaise";
import { isDatabaseAvailable } from "../database/connection";

const router = Router();

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
      const row = await FundRaiseRepository.createFull({
        vc_id: body.vc_id ?? null,
        investor_name: body.investor_name ?? null,
        ui_status: body.ui_status ?? body.uiStatus ?? body.status_ui ?? body.statusLabel ?? 'WIP',
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
