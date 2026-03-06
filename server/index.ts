import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./api/auth.js";
import { dashboardRouter } from "./api/dashboard.js";
import { botRouter } from "./api/bot.js";
import { stripeRouter } from "./api/stripe.js";
import { tradesRouter } from "./api/trades.js";
import { initScheduler } from "./scheduler/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
// Raw body for Stripe webhooks
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "5mb" }));

// ── HEALTH ────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── ROUTES ────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bot", botRouter);
app.use("/api/stripe", stripeRouter);
app.use("/api/trades", tradesRouter);

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[SERVER] ❌", err.message);
  res.status(500).json({ error: err.message });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WOLF] 🐺 Server running on :${PORT}`);
  initScheduler();
});
