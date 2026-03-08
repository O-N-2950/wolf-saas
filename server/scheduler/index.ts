// server/scheduler/index.ts
import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠️  SIMULATION MODE                                              ║
// ║ Le moteur de scoring est en cours d'intégration.                  ║
// ║ Aucun ordre réel n'est envoyé à Alpaca pour le moment.           ║
// ║ Les trades affichés sont basés sur le scoring uniquement.        ║
// ║ Ce module sera connecté au moteur 6 facteurs Wolf v2.            ║
// ╚═══════════════════════════════════════════════════════════════════╝

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
  console.log("[SCHEDULER] ⚠️  MODE SIMULATION — Aucun trade réel n'est exécuté");
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

    if (activeUsers.length > 0) {
      console.log(`[SCHEDULER] 🐺 ${activeUsers.length} bots actifs — mode simulation`);
    }

    for (const user of activeUsers) {
      try {
        await processUserBot(user);
      } catch (e: any) {
        // Règle WinWin #1 : NE JAMAIS AVALER LES ERREURS
        console.error(`[BOT] ❌ Error user ${user.user_id}:`, e.message);
        // Log l'incident en DB
        try {
          await db.execute(sql`
            INSERT INTO audit_logs (user_id, action, details)
            VALUES (${user.user_id}, 'bot_error', ${JSON.stringify({ error: e.message })}::jsonb)
          `);
        } catch {}
      }
    }
  } catch (e: any) {
    console.error("[SCHEDULER] ❌ runBotCycle:", e.message);
  }
}

async function processUserBot(user: any) {
  // ⚠️ SIMULATION UNIQUEMENT — pas de trades réels
  // Le moteur de scoring 6 facteurs (Wolf v2) sera intégré ici.
  // Pour l'instant on log l'activité sans exécuter d'ordres Alpaca.
  console.log(`[BOT] 🐺 Cycle simulation — user ${user.user_id} (${user.plan})`);

  // TODO Phase 2: Intégrer le scoring engine (engine.py → TypeScript)
  // 1. Construire la liste de tickers selon les secteurs activés
  // 2. Récupérer les bars via Alpaca API
  // 3. Calculer le score 6 facteurs
  // 4. Si score >= min_score_to_trade → placer un ordre
  // 5. Vérifier positions existantes → TP/SL/trailing
}

async function takePortfolioSnapshots() {
  console.log("[SCHEDULER] 📸 Taking portfolio snapshots...");
  try {
    // Récupérer les utilisateurs avec Alpaca connecté
    const users = (await db.execute(sql`
      SELECT bc.user_id, bc.alpaca_key_id, bc.alpaca_secret_key, bc.alpaca_is_paper
      FROM bot_configs bc
      WHERE bc.alpaca_key_id IS NOT NULL
    `)) as any[];

    console.log(`[SCHEDULER] 📸 ${users.length} utilisateurs avec Alpaca connecté`);
    // TODO: Pour chaque user, fetch account via Alpaca, insert into portfolio_snapshots
  } catch (e: any) {
    console.error("[SCHEDULER] ❌ snapshots:", e.message);
  }
}
