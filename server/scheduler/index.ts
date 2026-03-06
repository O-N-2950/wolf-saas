// server/scheduler/index.ts
import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

// Wolf scoring tickers by sector
const TICKERS = {
  defense: ["LMT", "RTX", "NOC", "GD", "HII", "TXT", "LHX", "DRS"],
  aerospace: ["BA", "SPCE", "RKLB", "ASTS", "KTOS"],
  cyber: ["AXON", "CRWD", "PANW", "ZS", "LDOS", "SAIC"],
  energy: ["XOM", "CVX", "SLB", "HAL"],
  gold: ["GLD", "SLV", "NEM", "GOLD"],
};

export function initScheduler() {
  // Bot loop: every 5 minutes during market hours (NYSE: 14:30–21:00 UTC)
  cron.schedule("*/5 14-20 * * 1-5", async () => {
    await runBotCycle();
  });

  // Daily snapshot at market close
  cron.schedule("0 21 * * 1-5", async () => {
    await takePortfolioSnapshots();
  });

  console.log("[SCHEDULER] 🕐 Cron jobs initialized");
}

async function runBotCycle() {
  try {
    const activeUsers = (await db.execute(sql`
      SELECT bc.user_id, bc.alpaca_key_id, bc.alpaca_secret_key, bc.alpaca_is_paper,
        bc.max_capital_per_trade, bc.max_open_positions, bc.stop_loss_percent,
        bc.take_profit_percent, bc.enable_defense, bc.enable_aerospace,
        bc.enable_cyber, bc.enable_energy, bc.enable_gold, bc.min_score_to_trade,
        bc.telegram_chat_id, s.plan, s.status as sub_status
      FROM bot_configs bc
      JOIN subscriptions s ON s.user_id = bc.user_id
      WHERE bc.is_running = true
        AND bc.alpaca_key_id IS NOT NULL
        AND s.status IN ('active', 'trial')
    `)) as any[];

    for (const user of activeUsers) {
      try {
        await processUserBot(user);
      } catch (e: any) {
        console.error(`[BOT] ❌ Error user ${user.user_id}:`, e.message);
      }
    }
  } catch (e: any) {
    console.error("[SCHEDULER] ❌ runBotCycle:", e.message);
  }
}

async function processUserBot(user: any) {
  // TODO: Implement full Wolf scoring engine here
  // This is where the actual 6-factor scoring + Alpaca orders happen
  // Placeholder for now — full engine from local bot to be integrated
  console.log(`[BOT] 🐺 Processing user ${user.user_id} (${user.plan})`);
}

async function takePortfolioSnapshots() {
  console.log("[SCHEDULER] 📸 Taking portfolio snapshots...");
  // TODO: iterate active users, fetch Alpaca account, store snapshot
}
