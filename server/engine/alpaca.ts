// server/engine/alpaca.ts
// Helper qui crée un client Alpaca authentifié + fonctions marché

import Alpaca from "@alpacahq/alpaca-trade-api";
import crypto from "crypto";
import type { Bar } from "./scoring.js";

// ── DECRYPTION (même logique que bot.ts) ──────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new Error("[SECURITY] ENCRYPTION_KEY manquante");
  return Buffer.from(key.slice(0, 32));
}

export function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(":");
  if (!ivHex || !encrypted) throw new Error("Format de données chiffrées invalide");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), Buffer.from(ivHex, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

// ── CLIENT FACTORY ────────────────────────────────────────────────

export function createAlpacaClient(encryptedKeyId: string, encryptedSecret: string, isPaper: boolean) {
  return new Alpaca({
    keyId: decrypt(encryptedKeyId),
    secretKey: decrypt(encryptedSecret),
    paper: isPaper,
  });
}

// ── MARKET DATA ───────────────────────────────────────────────────

export async function fetchBars(alpaca: any, symbol: string, limit = 50): Promise<Bar[]> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 80); // ~80 jours pour avoir 50 bars de trading

    const barsGenerator = alpaca.getBarsV2(symbol, {
      start: start.toISOString(),
      end: end.toISOString(),
      timeframe: "1Day",
      limit,
      adjustment: "raw",
    });

    const bars: Bar[] = [];
    for await (const bar of barsGenerator) {
      bars.push({
        c: bar.ClosePrice,
        h: bar.HighPrice,
        l: bar.LowPrice,
        o: bar.OpenPrice,
        v: bar.Volume,
        t: bar.Timestamp,
      });
    }
    return bars;
  } catch (e: any) {
    console.error(`[ALPACA] ❌ fetchBars ${symbol}: ${e.message}`);
    return [];
  }
}

export async function isMarketOpen(alpaca: any): Promise<boolean> {
  try {
    const clock = await alpaca.getClock();
    return clock.is_open;
  } catch {
    return false;
  }
}

// ── ORDER MANAGEMENT ─────────────────────────────────────────────

export interface OrderResult {
  orderId: string;
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  filledPrice?: number;
}

export async function placeMarketOrder(
  alpaca: any,
  symbol: string,
  qty: number,
  side: "buy" | "sell"
): Promise<OrderResult> {
  const order = await alpaca.createOrder({
    symbol,
    qty,
    side,
    type: "market",
    time_in_force: "day",
  });

  return {
    orderId: order.id,
    symbol: order.symbol,
    qty: parseFloat(order.qty),
    side: order.side,
    filledPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : undefined,
  };
}

export async function closePosition(alpaca: any, symbol: string): Promise<void> {
  try {
    await alpaca.closePosition(symbol);
  } catch (e: any) {
    // Position peut déjà être fermée
    if (!e.message?.includes("position does not exist")) {
      throw e;
    }
  }
}

export async function getOpenPositions(alpaca: any): Promise<any[]> {
  try {
    return await alpaca.getPositions();
  } catch {
    return [];
  }
}
