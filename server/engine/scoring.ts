// server/engine/scoring.ts
// ╔══════════════════════════════════════════════════════════════════╗
// ║  🐺 WOLF SCORING ENGINE — 6 FACTEURS                           ║
// ║  Momentum · Volatilité · RSI · Trend · MACD · Bollinger        ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface Bar {
  c: number; // close
  h: number; // high
  l: number; // low
  o: number; // open
  v: number; // volume
  t: string; // timestamp
}

export interface ScoreDetails {
  momentum: 0 | 1;
  volatility: 0 | 1;
  rsi: 0 | 1;
  trend: 0 | 1;
  macd: 0 | 1;
  bollinger: 0 | 1;
  total: number; // 0–6
  rsiValue: number;
  macdValue: number;
  macdSignal: number;
  bollingerPct: number; // position dans le canal 0–1
}

// ── HELPERS ──────────────────────────────────────────────────────

function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { macdLine: number; signal: number; histogram: number } {
  if (closes.length < 35) return { macdLine: 0, signal: 0, histogram: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  // Align lengths (ema26 is shorter)
  const offset = ema12.length - ema26.length;
  const macdLine = ema26.map((v, i) => ema12[i + offset] - v);
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  const lastSignal = signalLine[signalLine.length - 1];
  return {
    macdLine: macdLine[last],
    signal: lastSignal,
    histogram: macdLine[last] - lastSignal,
  };
}

function bollingerBands(closes: number[], period = 20, stdDev = 2) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, pct: 0.5 };
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = middle + stdDev * std;
  const lower = middle - stdDev * std;
  const last = closes[closes.length - 1];
  const pct = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { upper, middle, lower, pct };
}

// ── MAIN SCORING FUNCTION ─────────────────────────────────────────

export function scoreStock(bars: Bar[]): ScoreDetails {
  if (bars.length < 35) {
    return {
      momentum: 0, volatility: 0, rsi: 0, trend: 0, macd: 0, bollinger: 0,
      total: 0, rsiValue: 50, macdValue: 0, macdSignal: 0, bollingerPct: 0.5,
    };
  }

  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const last = closes[closes.length - 1];

  // 1. MOMENTUM — prix > SMA20
  const sma20 = sma(closes, 20);
  const momentumScore: 0 | 1 = last > sma20[sma20.length - 1] ? 1 : 0;

  // 2. VOLATILITÉ — volume actuel > moyenne des 20 derniers jours
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volatilityScore: 0 | 1 = currentVolume > avgVolume * 1.1 ? 1 : 0;

  // 3. RSI — zone neutre-bullish (40–70)
  const rsiValue = rsi(closes, 14);
  const rsiScore: 0 | 1 = rsiValue >= 40 && rsiValue <= 70 ? 1 : 0;

  // 4. TREND — EMA9 > EMA21
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const trendScore: 0 | 1 = ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 1 : 0;

  // 5. MACD — histogramme positif (momentum haussier)
  const macdResult = macd(closes);
  const macdScore: 0 | 1 = macdResult.histogram > 0 ? 1 : 0;

  // 6. BOLLINGER — prix dans la moitié inférieure → potentiel de rebond
  //    OU prix qui vient de franchir la bande médiane vers le haut
  const bb = bollingerBands(closes);
  const bollingerScore: 0 | 1 = bb.pct > 0.3 && bb.pct < 0.85 ? 1 : 0;

  const total =
    momentumScore + volatilityScore + rsiScore + trendScore + macdScore + bollingerScore;

  return {
    momentum: momentumScore,
    volatility: volatilityScore,
    rsi: rsiScore,
    trend: trendScore,
    macd: macdScore,
    bollinger: bollingerScore,
    total,
    rsiValue: Math.round(rsiValue * 100) / 100,
    macdValue: Math.round(macdResult.macdLine * 1000) / 1000,
    macdSignal: Math.round(macdResult.signal * 1000) / 1000,
    bollingerPct: Math.round(bb.pct * 1000) / 1000,
  };
}
