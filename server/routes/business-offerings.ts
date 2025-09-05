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
    if (!(await isDb())) return res.status(503).json({ error: "Database unavailable" });
    const created = await BusinessOfferingRepository.create(req.body || {});
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create" });
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isDb())) return res.status(503).json({ error: "Database unavailable" });
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
    if (!(await isDb())) return res.status(503).json({ error: "Database unavailable" });
    const id = parseInt(req.params.id);
    const ok = await BusinessOfferingRepository.delete(id);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
