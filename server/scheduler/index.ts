// server/scheduler/index.ts
import cron from "node-cron";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { scoreStock } from "../engine/scoring.js";
import {
  createAlpacaClient,
  fetchBars,
  isMarketOpen,
  placeMarketOrder,
  closePosition,
  getOpenPositions,
} from "../engine/alpaca.js";

// ── TICKERS PAR SECTEUR ───────────────────────────────────────────
const TICKERS: Record<string, string[]> = {
  defense:   ["LMT", "RTX", "NOC", "GD", "HII", "TXT", "LHX", "DRS"],
  aerospace: ["BA", "SPCE", "RKLB", "ASTS", "KTOS"],
  cyber:     ["AXON", "CRWD", "PANW", "ZS", "LDOS", "SAIC"],
  energy:    ["XOM", "CVX", "SLB", "HAL"],
  gold:      ["GLD", "SLV", "NEM", "GOLD"],
};

// ── TELEGRAM HELPER ───────────────────────────────────────────────
async function sendTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
  } catch (e: any) {
    console.error("[TELEGRAM] ❌", e.message);
  }
}

// ── SCHEDULER INIT ────────────────────────────────────────────────
export function initScheduler() {
  // Cycle principal: toutes les 5 min pendant les heures NYSE (14h30-21h UTC)
  cron.schedule("*/5 14-20 * * 1-5", async () => {
    await runBotCycle();
  });

  // Snapshot journalier à la clôture
  cron.schedule("0 21 * * 1-5", async () => {
    await takePortfolioSnapshots();
  });

  console.log("[SCHEDULER] 🕐 Cron jobs initialized");
  console.log("[SCHEDULER] 🐺 WOLF ENGINE ACTIF — scoring 6 facteurs connecté");
}

// ── CYCLE PRINCIPAL ───────────────────────────────────────────────
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

    if (activeUsers.length === 0) return;
    console.log(`[SCHEDULER] 🐺 ${activeUsers.length} bots actifs`);

    for (const user of activeUsers) {
      try {
        await processUserBot(user);
      } catch (e: any) {
        console.error(`[BOT] ❌ Error user ${user.user_id}:`, e.message);
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

// ── TRAITEMENT PAR USER ───────────────────────────────────────────
async function processUserBot(user: any) {
  const alpaca = createAlpacaClient(
    user.alpaca_key_id,
    user.alpaca_secret_key,
    user.alpaca_is_paper
  );

  // Vérifier que le marché est ouvert
  const marketOpen = await isMarketOpen(alpaca);
  if (!marketOpen) return;

  // Construire la liste des tickers selon les secteurs activés
  const tickers: string[] = [];
  if (user.enable_defense)   tickers.push(...TICKERS.defense);
  if (user.enable_aerospace) tickers.push(...TICKERS.aerospace);
  if (user.enable_cyber)     tickers.push(...TICKERS.cyber);
  if (user.enable_energy)    tickers.push(...TICKERS.energy);
  if (user.enable_gold)      tickers.push(...TICKERS.gold);
  if (tickers.length === 0) return;

  // Récupérer les positions ouvertes
  const openPositions = await getOpenPositions(alpaca);
  const positionSymbols = new Set(openPositions.map((p: any) => p.symbol));

  // ── 1. GESTION TP/SL DES POSITIONS EXISTANTES ────────────────────
  for (const position of openPositions) {
    const pnlPct = parseFloat(position.unrealized_plpc) * 100;
    const symbol = position.symbol;

    const shouldTakeProfit = pnlPct >= parseFloat(user.take_profit_percent);
    const shouldStopLoss   = pnlPct <= -parseFloat(user.stop_loss_percent);

    if (!shouldTakeProfit && !shouldStopLoss) continue;

    const reason = shouldTakeProfit ? "TAKE_PROFIT" : "STOP_LOSS";
    const emoji  = shouldTakeProfit ? "✅" : "🛑";

    try {
      await closePosition(alpaca, symbol);

      await db.execute(sql`
        UPDATE trades SET
          status = 'closed',
          exit_price = ${parseFloat(position.current_price)},
          pnl = ${parseFloat(position.unrealized_pl)},
          pnl_percent = ${pnlPct},
          closed_at = NOW()
        WHERE user_id = ${user.user_id}
          AND symbol = ${symbol}
          AND status = 'open'
      `);

      await db.execute(sql`
        INSERT INTO audit_logs (user_id, action, details)
        VALUES (${user.user_id}, ${`trade_closed_${reason.toLowerCase()}`},
          ${JSON.stringify({ symbol, pnlPct: pnlPct.toFixed(2), reason })}::jsonb)
      `);

      if (user.telegram_chat_id) {
        const pnlStr = pnlPct >= 0 ? `+${pnlPct.toFixed(2)}%` : `${pnlPct.toFixed(2)}%`;
        await sendTelegram(
          user.telegram_chat_id,
          `${emoji} <b>Wolf — ${reason}</b>\n\n` +
          `<b>${symbol}</b> fermé à $${parseFloat(position.current_price).toFixed(2)}\n` +
          `P&L: <b>${pnlStr}</b> ($${parseFloat(position.unrealized_pl).toFixed(2)})`
        );
      }

      console.log(`[BOT] ${emoji} ${reason} — user ${user.user_id} ${symbol} ${pnlPct.toFixed(2)}%`);
    } catch (e: any) {
      console.error(`[BOT] ❌ close ${symbol}:`, e.message);
    }
  }

  // ── 2. RECHERCHE DE NOUVELLES OPPORTUNITÉS ────────────────────────
  const currentOpenCount = openPositions.length;
  if (currentOpenCount >= parseInt(user.max_open_positions)) return;

  const slotsAvailable = parseInt(user.max_open_positions) - currentOpenCount;
  const candidates: Array<{ symbol: string; score: number; details: any }> = [];

  for (const symbol of tickers) {
    if (positionSymbols.has(symbol)) continue;

    const bars = await fetchBars(alpaca, symbol, 50);
    if (bars.length < 35) continue;

    const details = scoreStock(bars);
    if (details.total >= parseInt(user.min_score_to_trade)) {
      candidates.push({ symbol, score: details.total, details });
    }
  }

  // Meilleurs scores en premier
  candidates.sort((a, b) => b.score - a.score);
  const toTrade = candidates.slice(0, slotsAvailable);

  // ── 3. PLACEMENT DES ORDRES ───────────────────────────────────────
  for (const candidate of toTrade) {
    try {
      const account = await alpaca.getAccount();
      const buyingPower = parseFloat(account.buying_power);
      const capital = Math.min(parseFloat(user.max_capital_per_trade), buyingPower * 0.95);

      const bars = await fetchBars(alpaca, candidate.symbol, 2);
      if (bars.length === 0) continue;
      const lastPrice = bars[bars.length - 1].c;
      if (lastPrice <= 0) continue;

      const qty = Math.floor(capital / lastPrice);
      if (qty < 1) continue;

      const order = await placeMarketOrder(alpaca, candidate.symbol, qty, "buy");

      await db.execute(sql`
        INSERT INTO trades (user_id, symbol, side, qty, entry_price, status, score, score_details, sector, alpaca_order_id)
        VALUES (
          ${user.user_id},
          ${candidate.symbol},
          'buy',
          ${qty},
          ${lastPrice},
          'open',
          ${candidate.score},
          ${JSON.stringify(candidate.details)}::jsonb,
          ${getSector(candidate.symbol)},
          ${order.orderId}
        )
      `);

      await db.execute(sql`
        INSERT INTO audit_logs (user_id, action, details)
        VALUES (${user.user_id}, 'trade_opened',
          ${JSON.stringify({ symbol: candidate.symbol, qty, price: lastPrice, score: candidate.score })}::jsonb)
      `);

      if (user.telegram_chat_id) {
        const scoreBar = "🟩".repeat(candidate.score) + "⬜".repeat(6 - candidate.score);
        await sendTelegram(
          user.telegram_chat_id,
          `🐺 <b>Wolf — Nouveau Trade</b>\n\n` +
          `📈 <b>${candidate.symbol}</b> × ${qty} shares\n` +
          `💰 Prix: $${lastPrice.toFixed(2)}\n` +
          `⭐ Score: ${candidate.score}/6  ${scoreBar}\n\n` +
          `RSI: ${candidate.details.rsiValue} | MACD: ${candidate.details.macdValue > 0 ? "↑" : "↓"}\n` +
          `TP: +${user.take_profit_percent}% | SL: -${user.stop_loss_percent}%`
        );
      }

      console.log(
        `[BOT] 📈 BUY — user ${user.user_id} ${candidate.symbol} ×${qty} @ $${lastPrice.toFixed(2)} (score ${candidate.score}/6)`
      );

      await db.execute(sql`
        UPDATE bot_configs SET last_trade_at = NOW() WHERE user_id = ${user.user_id}
      `);
    } catch (e: any) {
      console.error(`[BOT] ❌ order ${candidate.symbol}:`, e.message);
    }
  }
}

// ── PORTFOLIO SNAPSHOTS ───────────────────────────────────────────
async function takePortfolioSnapshots() {
  console.log("[SCHEDULER] 📸 Taking portfolio snapshots...");
  try {
    const users = (await db.execute(sql`
      SELECT bc.user_id, bc.alpaca_key_id, bc.alpaca_secret_key, bc.alpaca_is_paper
      FROM bot_configs bc
      WHERE bc.alpaca_key_id IS NOT NULL
    `)) as any[];

    for (const user of users) {
      try {
        const alpaca = createAlpacaClient(
          user.alpaca_key_id,
          user.alpaca_secret_key,
          user.alpaca_is_paper
        );
        const account = await alpaca.getAccount();
        const positions = await getOpenPositions(alpaca);

        await db.execute(sql`
          INSERT INTO portfolio_snapshots (user_id, equity, cash, day_pnl, total_pnl, open_positions)
          VALUES (
            ${user.user_id},
            ${parseFloat(account.equity)},
            ${parseFloat(account.cash)},
            ${parseFloat(account.equity) - parseFloat(account.last_equity)},
            ${parseFloat(account.equity) - parseFloat(account.initial_equity || account.equity)},
            ${positions.length}
          )
        `);
      } catch (e: any) {
        console.error(`[SCHEDULER] ❌ snapshot user ${user.user_id}:`, e.message);
      }
    }
    console.log(`[SCHEDULER] 📸 Snapshots done — ${users.length} users`);
  } catch (e: any) {
    console.error("[SCHEDULER] ❌ snapshots:", e.message);
  }
}

// ── UTILS ─────────────────────────────────────────────────────────
function getSector(symbol: string): string {
  for (const [sector, tickers] of Object.entries(TICKERS)) {
    if (tickers.includes(symbol)) return sector;
  }
  return "unknown";
}
