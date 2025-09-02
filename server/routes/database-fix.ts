import { Router, Request, Response } from "express";
import { pool } from "../database/connection";

const router = Router();

// Fix follow-ups constraint
router.post(
  "/fix-follow-ups-constraint",
  async (req: Request, res: Response) => {
    try {
      const client = await pool.connect();
      console.log("✅ Database connection successful!");

      // Drop the existing constraint
      console.log("Dropping existing constraint...");
      try {
        await client.query(`
        ALTER TABLE follow_ups 
        DROP CONSTRAINT IF EXISTS chk_follow_up_context
      `);
        console.log("✅ Dropped old constraint");
      } catch (error) {
        console.log("⚠️ No existing constraint to drop");
      }

      // Add the corrected constraint that allows general follow-ups (both null)
    // but prevents both lead_id and vc_id from being set simultaneously
    console.log("Adding corrected constraint...");
    await client.query(`
      ALTER TABLE follow_ups
      ADD CONSTRAINT chk_follow_up_context
      CHECK (
        NOT (lead_id IS NOT NULL AND vc_id IS NOT NULL)
      )
    `);
      console.log("✅ Added corrected constraint");

      client.release();

      res.json({
        success: true,
        message: "Follow-ups constraint fixed successfully",
      });
    } catch (error) {
      console.error("❌ Fix failed:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

export default router;
