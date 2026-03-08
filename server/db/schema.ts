import { pgTable, serial, text, varchar, timestamp, boolean, integer, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "pro", "premium"]);
export const statusEnum = pgEnum("status", ["active", "paused", "cancelled", "trial"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const tradeSideEnum = pgEnum("trade_side", ["buy", "sell"]);

// ── USERS ──────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash"),
  magicToken: varchar("magic_token", { length: 256 }),
  magicTokenExpiresAt: timestamp("magic_token_expires_at"),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── SUBSCRIPTIONS ──────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  plan: planEnum("plan").default("starter").notNull(),
  status: statusEnum("status").default("trial").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── BOT CONFIGS ────────────────────────────────────────────────
export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  // Alpaca credentials (encrypted)
  alpacaKeyId: text("alpaca_key_id"),
  alpacaSecretKey: text("alpaca_secret_key"),
  alpacaIsPaper: boolean("alpaca_is_paper").default(true),
  // Risk settings
  maxCapitalPerTrade: numeric("max_capital_per_trade", { precision: 12, scale: 2 }).default("500"),
  maxOpenPositions: integer("max_open_positions").default(5),
  stopLossPercent: numeric("stop_loss_percent", { precision: 5, scale: 2 }).default("3.0"),
  takeProfitPercent: numeric("take_profit_percent", { precision: 5, scale: 2 }).default("8.0"),
  // Sector filters
  enableDefense: boolean("enable_defense").default(true),
  enableAerospace: boolean("enable_aerospace").default(true),
  enableCyber: boolean("enable_cyber").default(true),
  enableEnergy: boolean("enable_energy").default(false),
  enableGold: boolean("enable_gold").default(false),
  // Bot state
  isRunning: boolean("is_running").default(false),
  lastTradeAt: timestamp("last_trade_at"),
  telegramChatId: varchar("telegram_chat_id", { length: 50 }),
  // Scoring thresholds
  minScoreToTrade: integer("min_score_to_trade").default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── TRADES ─────────────────────────────────────────────────────
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  side: tradeSideEnum("side").notNull(),
  qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
  entryPrice: numeric("entry_price", { precision: 12, scale: 4 }),
  exitPrice: numeric("exit_price", { precision: 12, scale: 4 }),
  pnl: numeric("pnl", { precision: 12, scale: 2 }),
  pnlPercent: numeric("pnl_percent", { precision: 8, scale: 4 }),
  status: tradeStatusEnum("status").default("open"),
  score: integer("score"), // 0-6 Wolf score
  scoreDetails: jsonb("score_details"), // {trend, volume, rsi, macd, sector, news}
  sector: varchar("sector", { length: 50 }),
  alpacaOrderId: varchar("alpaca_order_id", { length: 100 }),
  openedAt: timestamp("opened_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── PORTFOLIO SNAPSHOTS ────────────────────────────────────────
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  equity: numeric("equity", { precision: 14, scale: 2 }).notNull(),
  cash: numeric("cash", { precision: 14, scale: 2 }).notNull(),
  dayPnl: numeric("day_pnl", { precision: 12, scale: 2 }),
  totalPnl: numeric("total_pnl", { precision: 12, scale: 2 }),
  openPositions: integer("open_positions").default(0),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
});

// ── WATCHLIST ──────────────────────────────────────────────────
export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  sector: varchar("sector", { length: 50 }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

// ── AUDIT LOG (CRITIQUE 3: traçabilité de toutes les opérations) ──
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
