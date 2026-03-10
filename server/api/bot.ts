import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { verifyToken } from "./auth.js";
import Alpaca from "@alpacahq/alpaca-trade-api";
import crypto from "crypto";
import { z } from "zod";
import type { Response } from "express";

export const botRouter = Router();

// Input validation schemas (CRITIQUE 3)
const connectAlpacaSchema = z.object({
  keyId: z.string().min(10).max(100),
  secretKey: z.string().min(10).max(100),
  isPaper: z.boolean().optional().default(true),
});
const updateConfigSchema = z.object({
  maxCapitalPerTrade: z.number().min(1).max(100000).optional(),
  maxOpenPositions: z.number().int().min(1).max(50).optional(),
  stopLossPercent: z.number().min(0.5).max(50).optional(),
  takeProfitPercent: z.number().min(0.5).max(100).optional(),
  enableDefense: z.boolean().optional(),
  enableAerospace: z.boolean().optional(),
  enableCyber: z.boolean().optional(),
  enableEnergy: z.boolean().optional(),
  enableGold: z.boolean().optional(),
  minScoreToTrade: z.number().int().min(1).max(6).optional(),
  telegramChatId: z.string().max(50).optional().nullable(),
});

// ── AUDIT LOG HELPER ──────────────────────────────────────────
async function auditLog(userId: number, action: string, details: any, req: any) {
  try {
    await db.execute(sql`
      INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent)
      VALUES (${userId}, ${action}, ${JSON.stringify(details)}::jsonb, ${req.ip || 'unknown'}, ${req.headers?.['user-agent'] || 'unknown'})
    `);
  } catch (e: any) {
    console.error(`[AUDIT] ❌ Failed to log: ${e.message}`);
  }
}

export const botRouter = Router();

// ── ENCRYPTION (CRITIQUE 1: clé JAMAIS hardcodée) ─────────────
// La clé DOIT être dans ENCRYPTION_KEY (env) — 32 chars minimum (256 bits)
// Le serveur refuse de démarrer si elle manque (voir index.ts validateStartup)
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("[SECURITY] ENCRYPTION_KEY manquante ou trop courte. Minimum 32 caractères.");
  }
  return Buffer.from(key.slice(0, 32));
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  return iv.toString("hex") + ":" + cipher.update(text, "utf8", "hex") + cipher.final("hex");
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(":");
  if (!ivHex || !encrypted) throw new Error("Format de données chiffrées invalide");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

// ── GET /api/bot/config ────────────────────────────────────────
botRouter.get("/config", verifyToken, async (req: any, res: Response) => {
  try {
    const [cfg] = (await db.execute(sql`
      SELECT bc.*, s.plan, s.status
      FROM bot_configs bc
      LEFT JOIN subscriptions s ON s.user_id = bc.user_id
      WHERE bc.user_id = ${req.user.userId}
    `)) as any[];

    if (!cfg) return res.status(404).json({ error: "Config non trouvée" });

    return res.json({
      alpacaConnected: !!cfg.alpaca_key_id,
      alpacaIsPaper: cfg.alpaca_is_paper,
      isRunning: cfg.is_running,
      maxCapitalPerTrade: cfg.max_capital_per_trade,
      maxOpenPositions: cfg.max_open_positions,
      stopLossPercent: cfg.stop_loss_percent,
      takeProfitPercent: cfg.take_profit_percent,
      enableDefense: cfg.enable_defense,
      enableAerospace: cfg.enable_aerospace,
      enableCyber: cfg.enable_cyber,
      enableEnergy: cfg.enable_energy,
      enableGold: cfg.enable_gold,
      minScoreToTrade: cfg.min_score_to_trade,
      telegramConnected: !!cfg.telegram_chat_id,
      plan: cfg.plan,
      subStatus: cfg.status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bot/connect-alpaca ───────────────────────────────
botRouter.post("/connect-alpaca", verifyToken, async (req: any, res: Response) => {
  try {
    const parsed = connectAlpacaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Données invalides" });
    const { keyId, secretKey, isPaper } = parsed.data;

    // Validate credentials with Alpaca
    const alpaca = new Alpaca({
      keyId,
      secretKey,
      paper: isPaper !== false,
    });

    let account;
    try {
      account = await alpaca.getAccount();
    } catch {
      return res.status(400).json({ error: "Clés Alpaca invalides — vérifiez vos credentials" });
    }

    await db.execute(sql`
      UPDATE bot_configs SET
        alpaca_key_id = ${encrypt(keyId)},
        alpaca_secret_key = ${encrypt(secretKey)},
        alpaca_is_paper = ${isPaper !== false},
        updated_at = NOW()
      WHERE user_id = ${req.user.userId}
    `);

    await auditLog(req.user.userId, 'alpaca_connected', { isPaper, equity: account.equity }, req);

    return res.json({
      ok: true,
      account: {
        buyingPower: account.buying_power,
        equity: account.equity,
        cash: account.cash,
        currency: account.currency,
      },
    });
  } catch (err: any) {
    console.error("[BOT] ❌ connect-alpaca:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bot/update-config ────────────────────────────────
botRouter.post("/update-config", verifyToken, async (req: any, res: Response) => {
  try {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Données invalides" });
    const {
      maxCapitalPerTrade, maxOpenPositions, stopLossPercent, takeProfitPercent,
      enableDefense, enableAerospace, enableCyber, enableEnergy, enableGold,
      minScoreToTrade, telegramChatId,
    } = parsed.data;

    await db.execute(sql`
      UPDATE bot_configs SET
        max_capital_per_trade = ${maxCapitalPerTrade},
        max_open_positions = ${maxOpenPositions},
        stop_loss_percent = ${stopLossPercent},
        take_profit_percent = ${takeProfitPercent},
        enable_defense = ${enableDefense},
        enable_aerospace = ${enableAerospace},
        enable_cyber = ${enableCyber},
        enable_energy = ${enableEnergy},
        enable_gold = ${enableGold},
        min_score_to_trade = ${minScoreToTrade},
        telegram_chat_id = ${telegramChatId || null},
        updated_at = NOW()
      WHERE user_id = ${req.user.userId}
    `);

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bot/start ────────────────────────────────────────
botRouter.post("/start", verifyToken, async (req: any, res: Response) => {
  try {
    const [cfg] = (await db.execute(sql`
      SELECT bc.*, s.status as sub_status
      FROM bot_configs bc
      JOIN subscriptions s ON s.user_id = bc.user_id
      WHERE bc.user_id = ${req.user.userId}
    `)) as any[];

    if (!cfg) return res.status(404).json({ error: "Config non trouvée" });
    if (!cfg.alpaca_key_id) return res.status(400).json({ error: "Connectez d'abord votre compte Alpaca" });
    if (!["active", "trial"].includes(cfg.sub_status)) {
      return res.status(403).json({ error: "Abonnement inactif — activez votre plan pour démarrer le bot" });
    }

    await db.execute(sql`
      UPDATE bot_configs SET is_running = true, updated_at = NOW()
      WHERE user_id = ${req.user.userId}
    `);

    await auditLog(req.user.userId, 'bot_started', { plan: cfg.plan }, req);
    console.log(`[BOT] 🟢 Bot démarré — user ${req.user.userId}`);
    return res.json({ ok: true, isRunning: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/bot/stop ─────────────────────────────────────────
botRouter.post("/stop", verifyToken, async (req: any, res: Response) => {
  try {
    await db.execute(sql`
      UPDATE bot_configs SET is_running = false, updated_at = NOW()
      WHERE user_id = ${req.user.userId}
    `);
    console.log(`[BOT] 🔴 Bot arrêté — user ${req.user.userId}`);
    return res.json({ ok: true, isRunning: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/bot/portfolio ─────────────────────────────────────
botRouter.get("/portfolio", verifyToken, async (req: any, res: Response) => {
  try {
    const [cfg] = (await db.execute(sql`
      SELECT alpaca_key_id, alpaca_secret_key, alpaca_is_paper
      FROM bot_configs WHERE user_id = ${req.user.userId}
    `)) as any[];

    if (!cfg?.alpaca_key_id) return res.status(400).json({ error: "Alpaca non connecté" });

    const alpaca = new Alpaca({
      keyId: decrypt(cfg.alpaca_key_id),
      secretKey: decrypt(cfg.alpaca_secret_key),
      paper: cfg.alpaca_is_paper,
    });

    const [account, positions] = await Promise.all([
      alpaca.getAccount(),
      alpaca.getPositions(),
    ]);

    return res.json({
      equity: parseFloat(account.equity),
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      dayPnl: parseFloat(account.equity) - parseFloat(account.last_equity),
      positions: positions.map((p: any) => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        side: p.side,
        entryPrice: parseFloat(p.avg_entry_price),
        currentPrice: parseFloat(p.current_price),
        pnl: parseFloat(p.unrealized_pl),
        pnlPercent: parseFloat(p.unrealized_plpc) * 100,
        marketValue: parseFloat(p.market_value),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
