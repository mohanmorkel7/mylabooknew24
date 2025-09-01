import { Router, Request, Response } from "express";
import { FundRaiseRepository } from "../models/FundRaise";
import { isDatabaseAvailable } from "../database/connection";

const router = Router();

// Get all fund raise mappings
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

// Get mapping by id
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

// Get mapping by VC id
router.get("/by-vc/:vcId", async (req: Request, res: Response) => {
  try {
    if (await isDatabaseAvailable()) {
      const vcId = parseInt(req.params.vcId);
      const row = await FundRaiseRepository.findByVC(vcId);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("Error fetching fund_raise by vc:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Create mapping (idempotent on vc_id)
router.post("/", async (req: Request, res: Response) => {
  try {
    const { vc_id } = req.body || {};
    if (!vc_id || isNaN(Number(vc_id))) {
      return res.status(400).json({ error: "vc_id is required" });
    }

    if (await isDatabaseAvailable()) {
      const row = await FundRaiseRepository.create(Number(vc_id));
      return res.status(201).json(row);
    }
    return res.status(503).json({ error: "Database unavailable" });
  } catch (error: any) {
    console.error("Error creating fund_raise:", error.message);
    return res.status(500).json({ error: "Failed" });
  }
});

// Delete mapping by id
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
