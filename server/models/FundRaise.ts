import { pool, withTimeout } from "../database/connection";

export interface FundRaise {
  id: number;
  vc_id: number;
  created_at?: string;
  updated_at?: string;
}

export class FundRaiseRepository {
  static async findAll(): Promise<FundRaise[]> {
    const query = `
      SELECT fr.id, fr.vc_id, fr.created_at, fr.updated_at
      FROM fund_raises fr
      ORDER BY fr.created_at DESC
    `;
    const result = await withTimeout(pool.query(query), 5000);
    return result.rows;
  }

  static async findById(id: number): Promise<FundRaise | null> {
    const result = await pool.query(
      `SELECT id, vc_id, created_at, updated_at FROM fund_raises WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  static async findByVC(vcId: number): Promise<FundRaise | null> {
    const result = await pool.query(
      `SELECT id, vc_id, created_at, updated_at FROM fund_raises WHERE vc_id = $1`,
      [vcId],
    );
    return result.rows[0] || null;
  }

  static async create(vcId: number): Promise<FundRaise> {
    const query = `
      INSERT INTO fund_raises (vc_id)
      VALUES ($1)
      ON CONFLICT (vc_id) DO UPDATE SET vc_id = EXCLUDED.vc_id
      RETURNING id, vc_id, created_at, updated_at
    `;
    const result = await pool.query(query, [vcId]);
    return result.rows[0];
  }

  static async delete(id: number): Promise<boolean> {
    const result = await pool.query(`DELETE FROM fund_raises WHERE id = $1`, [
      id,
    ]);
    return result.rowCount > 0;
  }
}
