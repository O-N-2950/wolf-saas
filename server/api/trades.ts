// server/api/trades.ts
import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { verifyToken } from "./auth.js";
import type { Response } from "express";

export const tradesRouter = Router();

tradesRouter.get("/", verifyToken, async (req: any, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit) || "50");
    const status = req.query.status as string;

    const trades = await db.execute(sql`
      SELECT * FROM trades
      WHERE user_id = ${req.user.userId}
      ${status ? sql`AND status = ${status}` : sql``}
      ORDER BY opened_at DESC
      LIMIT ${limit}
    `);

    return res.json(trades);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

tradesRouter.get("/stats", verifyToken, async (req: any, res: Response) => {
  try {
    const [stats] = (await db.execute(sql`
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE status = 'closed' AND pnl > 0) as winning_trades,
        COUNT(*) FILTER (WHERE status = 'closed' AND pnl <= 0) as losing_trades,
        COUNT(*) FILTER (WHERE status = 'open') as open_trades,
        COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0) as total_pnl,
        COALESCE(AVG(pnl_percent) FILTER (WHERE status = 'closed' AND pnl > 0), 0) as avg_win_pct,
        COALESCE(AVG(pnl_percent) FILTER (WHERE status = 'closed' AND pnl <= 0), 0) as avg_loss_pct,
        COALESCE(MAX(score), 0) as max_score
      FROM trades
      WHERE user_id = ${req.user.userId}
    `)) as any[];

    const winRate = stats.total_trades > 0
      ? (parseInt(stats.winning_trades) / Math.max(parseInt(stats.winning_trades) + parseInt(stats.losing_trades), 1)) * 100
      : 0;

    return res.json({ ...stats, win_rate: winRate.toFixed(1) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
