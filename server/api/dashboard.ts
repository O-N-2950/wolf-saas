// server/api/dashboard.ts
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { verifyToken } from "./auth.js";
import type { Response } from "express";

export const dashboardRouter = Router();

dashboardRouter.get("/", verifyToken, async (req: any, res: Response) => {
  try {
    const [stats] = (await db.execute(sql`
      SELECT
        COUNT(DISTINCT t.id) as total_trades,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0) as total_pnl,
        COUNT(t.id) FILTER (WHERE t.status = 'open') as open_positions
      FROM trades t
      WHERE t.user_id = ${req.user.userId}
    `)) as any[];

    const recent = await db.execute(sql`
      SELECT symbol, side, pnl, pnl_percent, score, status, opened_at, closed_at
      FROM trades WHERE user_id = ${req.user.userId}
      ORDER BY opened_at DESC LIMIT 5
    `);

    return res.json({ stats, recent });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
