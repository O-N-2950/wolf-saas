import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./api/auth.js";
import { dashboardRouter } from "./api/dashboard.js";
import { botRouter } from "./api/bot.js";
import { stripeRouter } from "./api/stripe.js";
import { tradesRouter } from "./api/trades.js";
import { initScheduler } from "./scheduler/index.js";

// ===== CRASH PROTECTION (pattern WinWin V2) =====
process.on('uncaughtException', (err) => {
  console.error('🔴 [UNCAUGHT EXCEPTION] (server survived):', err?.message || err);
  // NE PAS process.exit() — le serveur continue
});
process.on('unhandledRejection', (reason: any) => {
  console.error('🟡 [UNHANDLED REJECTION] (server survived):', reason?.message || reason);
});
process.on('SIGTERM', () => { console.log('🛑 SIGTERM — graceful shutdown'); process.exit(0); });
process.on('SIGINT', () => { console.log('🛑 SIGINT — graceful shutdown'); process.exit(0); });
// =================================================

const app = express();
const PORT = process.env.PORT || 3001;

// ── STARTUP VALIDATION (Règle WinWin #3) ─────────────────────
function validateStartup() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`🔴 [STARTUP] Variables manquantes: ${missing.join(', ')}`);
    console.error('   → Configurez-les dans .env ou Railway');
    process.exit(1);
  }
  // Validate ENCRYPTION_KEY is 32+ bytes
  const key = process.env.ENCRYPTION_KEY!;
  if (key.length < 32) {
    console.error('🔴 [STARTUP] ENCRYPTION_KEY doit faire minimum 32 caractères (256 bits)');
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'change-me-min-32-chars-random-string') {
    console.error('🔴 [STARTUP] JWT_SECRET est encore la valeur par défaut — changez-la!');
    process.exit(1);
  }
  console.log('[STARTUP] ✅ Configuration validée');
}
validateStartup();

// ── RATE LIMITING (simple in-memory, CRITIQUE 3) ─────────────
const rateLimits = new Map<string, { count: number; resetAt: number }>();
function rateLimiter(windowMs: number, maxRequests: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = `${req.ip}-${req.path}`;
    const now = Date.now();
    const record = rateLimits.get(key);

    if (!record || now > record.resetAt) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > maxRequests) {
      console.warn(`[RATE] 🛑 ${req.ip} blocked on ${req.path} (${record.count}/${maxRequests})`);
      return res.status(429).json({ error: "Trop de requêtes — réessayez dans quelques minutes" });
    }
    return next();
  };
}
// Nettoyage périodique
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimits.entries()) {
    if (now > val.resetAt) rateLimits.delete(key);
  }
}, 60000);

// ── MIDDLEWARE ────────────────────────────────────────────────
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    console.warn(`[CORS] Blocked: ${origin}`);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
// Raw body for Stripe webhooks
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));

// Global rate limit: 100 req/min per IP
app.use("/api/", rateLimiter(60000, 100));
// Strict rate limits on sensitive endpoints
app.use("/api/auth/magic-link", rateLimiter(60000, 5));   // 5 magic links/min
app.use("/api/auth/verify", rateLimiter(60000, 10));       // 10 verify/min
app.use("/api/bot/start", rateLimiter(60000, 3));          // 3 start/min
app.use("/api/bot/connect-alpaca", rateLimiter(60000, 5)); // 5 connect/min
app.use("/api/stripe/checkout", rateLimiter(60000, 3));    // 3 checkout/min

// ── HEALTH ────────────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString(), version: "2.0.0" }));

// ── ROUTES ────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bot", botRouter);
app.use("/api/stripe", stripeRouter);
app.use("/api/trades", tradesRouter);

// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[SERVER] ❌", err.message);
  // Never leak stack traces to client
  res.status(500).json({ error: "Erreur interne du serveur" });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[WOLF] 🐺 Server running on :${PORT}`);
  console.log(`[WOLF] Mode: ${process.env.NODE_ENV || 'development'}`);
  initScheduler();
});
