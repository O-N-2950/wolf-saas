import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import crypto from "crypto";
import { z } from "zod";
import type { Request, Response } from "express";

// Input validation schemas (CRITIQUE 3)
const magicLinkSchema = z.object({
  email: z.string().email("Email invalide").max(320),
});
const verifySchema = z.object({
  token: z.string().min(1).max(256),
  email: z.string().email().max(320),
});

export const authRouter = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// JWT_SECRET: JAMAIS de fallback hardcodé (CRITIQUE 1)
// Le serveur refuse de démarrer si absent (voir index.ts validateStartup)
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("[SECURITY] JWT_SECRET manquant ou trop court");
  }
  return secret;
}

// ── MIDDLEWARE ─────────────────────────────────────────────────
export function verifyToken(req: any, res: Response, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requis" });
  try {
    req.user = jwt.verify(token, getJwtSecret()) as any;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

// ── POST /api/auth/magic-link ──────────────────────────────────
authRouter.post("/magic-link", async (req: Request, res: Response) => {
  try {
    const parsed = magicLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message || "Email invalide" });
    const { email } = parsed.data;

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15min

    // Upsert user
    await db.execute(sql`
      INSERT INTO users (email, magic_token, magic_token_expires_at)
      VALUES (${email}, ${token}, ${expires.toISOString()})
      ON CONFLICT (email) DO UPDATE SET
        magic_token = ${token},
        magic_token_expires_at = ${expires.toISOString()},
        updated_at = NOW()
    `);

    const loginUrl = `${process.env.APP_URL || "https://wolf.trading"}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;

    await resend.emails.send({
      from: "Wolf Trading <noreply@wolf.trading>",
      to: email,
      subject: "🐺 Votre lien de connexion Wolf Trading",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0a0d0f;color:#e2e8f0;padding:40px;border-radius:12px">
          <div style="font-size:32px;margin-bottom:8px">🐺</div>
          <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Wolf Trading</h1>
          <p style="color:#64748b;margin-bottom:32px">Votre lien de connexion (valide 15 minutes)</p>
          <a href="${loginUrl}" style="display:inline-block;background:#f59e0b;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px">
            → Connexion au dashboard
          </a>
          <p style="color:#334155;font-size:12px;margin-top:32px">Si vous n'avez pas demandé ce lien, ignorez cet email.</p>
        </div>
      `,
    });

    return res.json({ ok: true, message: "Lien envoyé" });
  } catch (err: any) {
    console.error("[AUTH] ❌", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/verify ──────────────────────────────────────
authRouter.post("/verify", async (req: Request, res: Response) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Token et email requis" });
    const { token, email } = parsed.data;

    const [user] = (await db.execute(sql`
      SELECT * FROM users WHERE email = ${email}
        AND magic_token = ${token}
        AND magic_token_expires_at > NOW()
    `)) as any[];

    if (!user) return res.status(401).json({ error: "Lien invalide ou expiré" });

    // Clear token + update login
    await db.execute(sql`
      UPDATE users SET
        magic_token = NULL,
        magic_token_expires_at = NULL,
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = ${user.id}
    `);

    // Create subscription if first login
    const [sub] = (await db.execute(sql`
      SELECT id FROM subscriptions WHERE user_id = ${user.id}
    `)) as any[];
    
    if (!sub) {
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      await db.execute(sql`
        INSERT INTO subscriptions (user_id, plan, status, trial_ends_at)
        VALUES (${user.id}, 'starter', 'trial', ${trialEnd.toISOString()})
      `);
    }

    // Create bot config if first login
    const [cfg] = (await db.execute(sql`
      SELECT id FROM bot_configs WHERE user_id = ${user.id}
    `)) as any[];
    
    if (!cfg) {
      await db.execute(sql`
        INSERT INTO bot_configs (user_id) VALUES (${user.id})
      `);
    }

    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    return res.json({ ok: true, token: jwtToken, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    console.error("[AUTH] ❌ verify:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────
authRouter.get("/me", verifyToken, async (req: any, res: Response) => {
  try {
    const [user] = (await db.execute(sql`
      SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
        s.plan, s.status, s.trial_ends_at, s.current_period_end,
        bc.is_running, bc.alpaca_is_paper, bc.alpaca_key_id
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN bot_configs bc ON bc.user_id = u.id
      WHERE u.id = ${req.user.userId}
    `)) as any[];

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      plan: user.plan,
      status: user.status,
      trialEndsAt: user.trial_ends_at,
      periodEnd: user.current_period_end,
      botRunning: user.is_running,
      alpacaConnected: !!user.alpaca_key_id,
      isPaper: user.alpaca_is_paper,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
