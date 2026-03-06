import { Router } from "express";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { verifyToken } from "./auth.js";
import type { Request, Response } from "express";

export const stripeRouter = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2023-10-16" });

// Plans tarifaires
export const PLANS = {
  starter: {
    name: "Starter",
    price: 4900, // CHF 49 en centimes
    currency: "chf",
    priceId: process.env.STRIPE_PRICE_STARTER || "",
    features: ["1 compte Alpaca", "5 positions max", "Défense + Aérospatiale", "Alertes Telegram"],
  },
  pro: {
    name: "Pro",
    price: 9900, // CHF 99
    currency: "chf",
    priceId: process.env.STRIPE_PRICE_PRO || "",
    features: ["1 compte Alpaca", "15 positions max", "Tous secteurs", "Alertes Telegram + Email", "Score détaillé", "Analytics avancés"],
  },
  premium: {
    name: "Premium",
    price: 19900, // CHF 199
    currency: "chf",
    priceId: process.env.STRIPE_PRICE_PREMIUM || "",
    features: ["3 comptes Alpaca", "Positions illimitées", "Tous secteurs", "Alertes prioritaires", "API accès", "Support prioritaire", "Rapport mensuel PDF"],
  },
};

// ── POST /api/stripe/checkout ──────────────────────────────────
stripeRouter.post("/checkout", verifyToken, async (req: any, res: Response) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan as keyof typeof PLANS]) return res.status(400).json({ error: "Plan invalide" });

    const planData = PLANS[plan as keyof typeof PLANS];
    const [user] = (await db.execute(sql`SELECT * FROM users WHERE id = ${req.user.userId}`)) as any[];
    const [sub] = (await db.execute(sql`SELECT * FROM subscriptions WHERE user_id = ${req.user.userId}`)) as any[];

    // Get or create Stripe customer
    let customerId = sub?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await db.execute(sql`
        UPDATE subscriptions SET stripe_customer_id = ${customerId} WHERE user_id = ${req.user.userId}
      `);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: planData.priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/dashboard?checkout=success&plan=${plan}`,
      cancel_url: `${process.env.APP_URL}/pricing?checkout=cancelled`,
      metadata: { userId: req.user.userId, plan },
      subscription_data: { trial_period_days: 7 },
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[STRIPE] ❌ checkout:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stripe/portal ────────────────────────────────────
stripeRouter.post("/portal", verifyToken, async (req: any, res: Response) => {
  try {
    const [sub] = (await db.execute(sql`SELECT stripe_customer_id FROM subscriptions WHERE user_id = ${req.user.userId}`)) as any[];
    if (!sub?.stripe_customer_id) return res.status(400).json({ error: "Pas de compte Stripe" });

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.APP_URL}/dashboard`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stripe/plans ──────────────────────────────────────
stripeRouter.get("/plans", (_req: Request, res: Response) => {
  return res.json(PLANS);
});

// ── POST /api/stripe/webhook ───────────────────────────────────
stripeRouter.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (err: any) {
    console.error("[STRIPE] ❌ Webhook signature:", err.message);
    return res.status(400).json({ error: err.message });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan } = session.metadata || {};
        if (!userId || !plan) break;

        await db.execute(sql`
          UPDATE subscriptions SET
            plan = ${plan},
            status = 'active',
            stripe_subscription_id = ${session.subscription as string},
            updated_at = NOW()
          WHERE user_id = ${parseInt(userId)}
        `);
        console.log(`[STRIPE] ✅ Subscription activée — user ${userId} plan ${plan}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const [dbSub] = (await db.execute(sql`
          SELECT * FROM subscriptions WHERE stripe_subscription_id = ${sub.id}
        `)) as any[];
        if (!dbSub) break;

        const status = sub.status === "active" ? "active"
          : sub.status === "paused" ? "paused"
          : sub.status === "canceled" ? "cancelled" : "active";

        await db.execute(sql`
          UPDATE subscriptions SET
            status = ${status},
            current_period_end = ${new Date(sub.current_period_end * 1000).toISOString()},
            updated_at = NOW()
          WHERE stripe_subscription_id = ${sub.id}
        `);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db.execute(sql`
          UPDATE subscriptions SET
            status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
          WHERE stripe_subscription_id = ${sub.id}
        `);
        // Stop bot
        const [dbSub] = (await db.execute(sql`SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ${sub.id}`)) as any[];
        if (dbSub) {
          await db.execute(sql`UPDATE bot_configs SET is_running = false WHERE user_id = ${dbSub.user_id}`);
        }
        break;
      }
    }
  } catch (err: any) {
    console.error("[STRIPE] ❌ Webhook handler:", err.message);
  }

  return res.json({ received: true });
});
