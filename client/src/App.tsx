import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ── TYPES ──────────────────────────────────────────────────────
interface User { id: number; email: string; plan: string; status: string; trialEndsAt?: string; botRunning: boolean; alpacaConnected: boolean; isPaper: boolean; }
interface Trade { id: number; symbol: string; side: string; qty: number; entryPrice: number; exitPrice?: number; pnl?: number; pnlPercent?: number; status: string; score: number; sector: string; openedAt: string; closedAt?: string; }
interface Position { symbol: string; qty: number; entryPrice: number; currentPrice: number; pnl: number; pnlPercent: number; marketValue: number; }
interface Portfolio { equity: number; cash: number; buyingPower: number; dayPnl: number; positions: Position[]; }
interface BotConfig { alpacaConnected: boolean; isRunning: boolean; maxCapitalPerTrade: number; maxOpenPositions: number; stopLossPercent: number; takeProfitPercent: number; enableDefense: boolean; enableAerospace: boolean; enableCyber: boolean; enableEnergy: boolean; enableGold: boolean; minScoreToTrade: number; }

// ── UTILS ──────────────────────────────────────────────────────
function fmtCurrency(n: number) { return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("wolf_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
  });
}

// ── WOLF SCORE DISPLAY ─────────────────────────────────────────
function WolfScore({ score }: { score: number }) {
  const paws = Array.from({ length: 6 }, (_, i) => i < score);
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {paws.map((active, i) => (
        <span key={i} style={{ fontSize: 11, opacity: active ? 1 : 0.2 }}>🐾</span>
      ))}
    </span>
  );
}

// ── LANDING PAGE ───────────────────────────────────────────────
function Landing({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/auth/magic-link", { method: "POST", body: JSON.stringify({ email }) });
      const d = await r.json();
      if (d.ok) setSent(true);
    } finally { setLoading(false); }
  }

  const TICKERS = ["LMT", "RTX", "NOC", "GD", "BA", "AXON", "LDOS", "SAIC", "HII", "TXT"];
  const PRICES = ["589.40 +2.1%", "124.20 +1.4%", "832.60 +0.8%", "310.15 +3.2%", "198.75 -0.5%", "412.30 +4.7%", "195.60 +1.1%", "177.90 +2.3%", "294.40 +0.6%", "88.30 +1.8%"];

  return (
    <div style={{ background: "#060a0e", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Syne', 'DM Sans', sans-serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes scan { from { transform: translateY(-100%); } to { transform: translateY(100vh); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ticker { from { transform:translateX(0); } to { transform:translateX(-50%); } }
        .fade { animation: up 0.6s ease forwards; }
        .ticker-inner { display:flex; animation: ticker 30s linear infinite; }
        .btn-primary { background: #f59e0b; color: #000; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { background: #fbbf24; transform: translateY(-1px); }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; }
        .input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0; border-radius: 10px; padding: 14px 18px; font-size: 15px; outline: none; transition: border-color 0.2s; }
        .input:focus { border-color: #f59e0b; }
        .green { color: #10b981; }
        .red { color: #ef4444; }
        .amber { color: #f59e0b; }
      `}</style>

      {/* Scan line effect */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "rgba(245,158,11,0.08)", animation: "scan 8s linear infinite" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)", pointerEvents: "none" }} />
      </div>

      {/* Ticker */}
      <div style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.15)", padding: "8px 0", overflow: "hidden", position: "relative", zIndex: 1 }}>
        <div className="ticker-inner">
          {[...TICKERS, ...TICKERS].map((t, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 8, padding: "0 32px", fontFamily: "'DM Mono', monospace", fontSize: 12, whiteSpace: "nowrap", color: i % 2 === 0 ? "#10b981" : "#f59e0b" }}>
              <strong style={{ color: "#e2e8f0" }}>{t}</strong> {PRICES[i % PRICES.length]}
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "20px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>🐺</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>WOLF</span>
          <span style={{ fontSize: 10, background: "rgba(245,158,11,0.2)", color: "#f59e0b", padding: "2px 8px", borderRadius: 4, fontFamily: "monospace", letterSpacing: 1 }}>TRADING</span>
        </div>
        <button className="btn-primary" onClick={onLogin} style={{ padding: "10px 24px", borderRadius: 8, fontSize: 13 }}>
          Dashboard →
        </button>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 48px 60px", position: "relative", zIndex: 1 }}>
        <div className="fade" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 20, padding: "6px 16px", fontSize: 12, color: "#f59e0b", marginBottom: 32, fontFamily: "monospace" }}>
          <span style={{ animation: "blink 1.5s infinite" }}>●</span> PAPER TRADING · SCORE 6 FACTEURS · SECTEUR DÉFENSE
        </div>

        <h1 style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, letterSpacing: -3, marginBottom: 24 }}>
          Le bot qui trade<br />
          <span style={{ color: "#f59e0b" }}>défense & aérospatiale</span><br />
          pendant que vous dormez.
        </h1>

        <p style={{ fontSize: 18, color: "#64748b", maxWidth: 560, lineHeight: 1.7, marginBottom: 48 }}>
          Algorithme propriétaire. Score 6 facteurs. Focus secteurs blindés contre la récession.
          Alpaca intégré. Alertes Telegram. 7 jours d'essai gratuit.
        </p>

        {sent ? (
          <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: "20px 28px", display: "inline-flex", alignItems: "center", gap: 12, fontSize: 15 }}>
            <span className="green" style={{ fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontWeight: 700 }}>Lien envoyé !</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>Vérifiez votre boîte mail — valide 15 minutes</div>
            </div>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} style={{ display: "flex", gap: 12, maxWidth: 480 }}>
            <input className="input" type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" type="submit" disabled={loading} style={{ padding: "14px 28px", borderRadius: 10, fontSize: 14, whiteSpace: "nowrap" }}>
              {loading ? "..." : "Essai gratuit →"}
            </button>
          </form>
        )}
        <p style={{ color: "#334155", fontSize: 12, marginTop: 12 }}>7 jours gratuits · Aucune CB requise · Annulation en 1 clic</p>
      </div>

      {/* Stats bar */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "32px 48px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", maxWidth: 1100, margin: "0 auto" }}>
        {[
          { label: "Scoring", value: "6/6", sub: "Facteurs techniques" },
          { label: "Secteurs", value: "5", sub: "Défense, Aéro, Cyber..." },
          { label: "Broker", value: "Alpaca", sub: "Commission $0" },
          { label: "Essai gratuit", value: "7 jours", sub: "Sans engagement" },
        ].map(s => (
          <div key={s.label} style={{ padding: "0 32px", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#f59e0b", letterSpacing: -1 }}>{s.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "#334155" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Scoring */}
      <div style={{ maxWidth: 1100, margin: "80px auto", padding: "0 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 3, fontWeight: 700, marginBottom: 16, textTransform: "uppercase" }}>Algorithme propriétaire</div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, marginBottom: 20 }}>Score 6 facteurs.<br />Aucun trade en dessous de 4/6.</h2>
            <p style={{ color: "#64748b", lineHeight: 1.8, marginBottom: 32 }}>Chaque opportunité est évaluée selon 6 critères avant d'ouvrir une position. En dessous de 4/6 : le bot ne trade pas.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "📈", label: "Tendance", desc: "EMA 20/50/200 alignées" },
                { icon: "📊", label: "Volume", desc: "Volume > moyenne 20j × 1.5" },
                { icon: "⚡", label: "RSI", desc: "RSI entre 40 et 65" },
                { icon: "🔄", label: "MACD", desc: "Croisement haussier confirmé" },
                { icon: "🏭", label: "Secteur", desc: "Défense/Aéro/Cyber activé" },
                { icon: "📰", label: "Sentiment", desc: "Actualités neutres ou positives" },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 20, width: 32, textAlign: "center" }}>{f.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                    <div style={{ color: "#475569", fontSize: 12 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fake terminal */}
          <div className="card" style={{ padding: 0, overflow: "hidden", fontFamily: "'DM Mono', monospace" }}>
            <div style={{ background: "#0d1117", padding: "12px 16px", display: "flex", gap: 6, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {["#ef4444","#f59e0b","#10b981"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
              <span style={{ color: "#334155", fontSize: 11, marginLeft: 8 }}>wolf-engine — live</span>
            </div>
            <div style={{ padding: 20, fontSize: 12, lineHeight: 2 }}>
              {[
                { t: "14:32:01", txt: "🔍 Scanning 47 defense tickers...", c: "#64748b" },
                { t: "14:32:03", txt: "📊 LMT: Score 5/6 — buying 2 shares @ $589.40", c: "#f59e0b" },
                { t: "14:32:04", txt: "✅ Order filled — $1,178.80 deployed", c: "#10b981" },
                { t: "14:32:15", txt: "📊 AXON: Score 6/6 — buying 3 shares @ $412.30", c: "#f59e0b" },
                { t: "14:32:16", txt: "✅ Order filled — $1,236.90 deployed", c: "#10b981" },
                { t: "14:45:22", txt: "📈 LMT +2.8% — approaching take profit", c: "#3b82f6" },
                { t: "14:51:09", txt: "💰 LMT closed @ $606.45 — P&L: +$34.10 (+2.9%)", c: "#10b981" },
                { t: "15:02:33", txt: "🔍 Scanning 47 defense tickers...", c: "#64748b" },
                { t: "15:02:35", txt: "RTX: Score 3/6 — SKIP (below threshold)", c: "#475569" },
              ].map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 16 }}>
                  <span style={{ color: "#1e293b", minWidth: 70 }}>{l.t}</span>
                  <span style={{ color: l.c }}>{l.txt}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ color: "#1e293b", minWidth: 70 }}>15:02:36</span>
                <span style={{ color: "#e2e8f0", animation: "blink 1.5s infinite" }}>█</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{ maxWidth: 1000, margin: "80px auto", padding: "0 48px" }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, textAlign: "center", marginBottom: 12 }}>Tarifs simples</h2>
        <p style={{ color: "#64748b", textAlign: "center", marginBottom: 48 }}>Tous les plans incluent 7 jours d'essai gratuit</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { plan: "starter", name: "Starter", price: "CHF 49", per: "/mois", highlight: false, features: ["1 compte Alpaca", "5 positions simultanées", "Défense + Aérospatiale", "Alertes Telegram", "7 jours d'essai"] },
            { plan: "pro", name: "Pro", price: "CHF 99", per: "/mois", highlight: true, features: ["1 compte Alpaca", "15 positions simultanées", "Tous secteurs (5)", "Alertes Telegram + Email", "Analytics avancés", "Score détaillé par trade"] },
            { plan: "premium", name: "Premium", price: "CHF 199", per: "/mois", highlight: false, features: ["3 comptes Alpaca", "Positions illimitées", "Tous secteurs + custom", "Support prioritaire", "Rapport PDF mensuel", "Accès API"] },
          ].map(p => (
            <div key={p.plan} className="card" style={{ padding: 28, border: p.highlight ? "1px solid rgba(245,158,11,0.5)" : undefined, position: "relative" }}>
              {p.highlight && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#f59e0b", color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 20 }}>POPULAIRE</div>}
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 20 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: p.highlight ? "#f59e0b" : "#e2e8f0" }}>{p.price}</span>
                <span style={{ color: "#475569", fontSize: 13 }}>{p.per}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                    <span className="green">✓</span>
                    <span style={{ color: "#94a3b8" }}>{f}</span>
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={onLogin} style={{ width: "100%", padding: "12px", borderRadius: 10, fontSize: 14, background: p.highlight ? "#f59e0b" : "rgba(245,158,11,0.15)", color: p.highlight ? "#000" : "#f59e0b" }}>
                Commencer l'essai →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>🐺</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Wolf Trading</span>
          <span style={{ color: "#1e293b", fontSize: 12 }}>by Groupe NEO · Jura, Suisse</span>
        </div>
        <div style={{ color: "#1e293b", fontSize: 11 }}>Trading implique des risques. Résultats passés ne garantissent pas les résultats futurs.</div>
      </div>
    </div>
  );
}

// ── LOGIN PAGE ─────────────────────────────────────────────────
function LoginPage({ onBack, onLogin }: { onBack: () => void; onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check URL for token (magic link callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const e = params.get("email");
    if (t && e) {
      setVerifyToken(t);
      setEmail(e);
      verify(t, e);
    }
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const r = await apiFetch("/api/auth/magic-link", { method: "POST", body: JSON.stringify({ email }) });
      const d = await r.json();
      if (d.ok) setSent(true);
      else setError(d.error || "Erreur");
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  async function verify(token: string, mail: string) {
    setLoading(true); setError("");
    try {
      const r = await apiFetch("/api/auth/verify", { method: "POST", body: JSON.stringify({ token, email: mail }) });
      const d = await r.json();
      if (d.ok) { localStorage.setItem("wolf_token", d.token); onLogin(d.token); }
      else setError(d.error || "Lien invalide ou expiré");
    } catch { setError("Erreur réseau"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ background: "#060a0e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, marginBottom: 32 }}>← Retour</button>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🐺</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#e2e8f0" }}>Wolf Trading</h1>
          <p style={{ color: "#475569", fontSize: 14 }}>Connexion par lien magique</p>
        </div>

        {loading && !sent ? (
          <div style={{ textAlign: "center", color: "#f59e0b" }}>Connexion...</div>
        ) : sent ? (
          <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📧</div>
            <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>Email envoyé !</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>Vérifiez votre boîte mail<br />Lien valide 15 minutes</div>
          </div>
        ) : (
          <form onSubmit={sendLink}>
            <input
              type="email" required placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#e2e8f0", fontSize: 15, marginBottom: 12, boxSizing: "border-box" }}
            />
            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: 14, background: "#f59e0b", color: "#000", fontWeight: 700, border: "none", borderRadius: 10, fontSize: 15, cursor: "pointer" }}>
              Recevoir le lien
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState("overview");
  const [user, setUser] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [trades, setTradesList] = useState<Trade[]>([]);
  const [botCfg, setBotCfg] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [isPaper, setIsPaper] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [me, cfg] = await Promise.all([
        apiFetch("/api/auth/me").then(r => r.json()),
        apiFetch("/api/bot/config").then(r => r.json()),
      ]);
      setUser(me);
      setBotCfg(cfg);

      if (cfg.alpacaConnected) {
        const p = await apiFetch("/api/bot/portfolio").then(r => r.json());
        if (!p.error) setPortfolio(p);
      }

      const t = await apiFetch("/api/trades?limit=20").then(r => r.json());
      if (Array.isArray(t)) setTradesList(t);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 30000); return () => clearInterval(iv); }, [fetchAll]);

  async function connectAlpaca(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    const r = await apiFetch("/api/bot/connect-alpaca", { method: "POST", body: JSON.stringify({ keyId: alpacaKey, secretKey: alpacaSecret, isPaper }) });
    const d = await r.json();
    if (d.ok) { setAlpacaKey(""); setAlpacaSecret(""); fetchAll(); }
    else alert(d.error);
    setConnecting(false);
  }

  async function toggleBot() {
    if (!botCfg) return;
    setToggling(true);
    const action = botCfg.isRunning ? "stop" : "start";
    const r = await apiFetch(`/api/bot/${action}`, { method: "POST" });
    const d = await r.json();
    if (d.ok) fetchAll();
    else alert(d.error);
    setToggling(false);
  }

  const S = {
    wrap: { background: "#060a0e", minHeight: "100vh", fontFamily: "'Syne', 'DM Sans', sans-serif", color: "#e2e8f0" },
    sidebar: { width: 220, background: "rgba(0,0,0,0.4)", borderRight: "1px solid rgba(255,255,255,0.06)", padding: "24px 0", display: "flex", flexDirection: "column" as const, gap: 4 },
    navItem: (active: boolean) => ({ padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#f59e0b" : "#475569", background: active ? "rgba(245,158,11,0.08)" : "none", border: "none", textAlign: "left" as const, borderLeft: active ? "2px solid #f59e0b" : "2px solid transparent" }),
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 },
    tag: (color: string) => ({ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: `rgba(${color},0.15)`, color: `rgb(${color})` }),
  };

  if (loading) return <div style={{ ...S.wrap, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#f59e0b", fontSize: 24 }}>🐺</span></div>;

  return (
    <div style={{ ...S.wrap, display: "flex" }}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={{ padding: "0 20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🐺</span>
            <span style={{ fontWeight: 800, fontSize: 15 }}>WOLF</span>
          </div>
          <div style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>{user?.email?.slice(0, 22)}</div>
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: user?.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", padding: "2px 10px", borderRadius: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: user?.status === "active" ? "#10b981" : "#f59e0b" }} />
            <span style={{ fontSize: 10, color: user?.status === "active" ? "#10b981" : "#f59e0b", fontWeight: 600 }}>{user?.plan?.toUpperCase() || "TRIAL"}</span>
          </div>
        </div>

        {[
          { id: "overview", label: "📊 Overview" },
          { id: "positions", label: "📈 Positions" },
          { id: "trades", label: "📋 Historique" },
          { id: "bot", label: "⚙️ Configuration" },
          { id: "billing", label: "💳 Abonnement" },
        ].map(n => (
          <button key={n.id} style={S.navItem(tab === n.id)} onClick={() => setTab(n.id)}>{n.label}</button>
        ))}

        <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {botCfg && (
            <button onClick={toggleBot} disabled={toggling} style={{
              width: "100%", padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 8,
              background: botCfg.isRunning ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
              color: botCfg.isRunning ? "#ef4444" : "#10b981",
            }}>
              {toggling ? "..." : botCfg.isRunning ? "⏹ Stop Bot" : "▶ Start Bot"}
            </button>
          )}
          <button onClick={onLogout} style={{ width: "100%", padding: "8px", background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 12 }}>
            Déconnexion
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: 32, overflowY: "auto" }}>

        {/* ⚠️ SIMULATION DISCLAIMER (CRITIQUE 2) */}
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "12px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#f59e0b" }}>Mode simulation</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Le moteur de trading est en cours d'intégration. Les données affichées proviennent de votre compte Alpaca (paper ou live) mais aucun trade automatique n'est exécuté pour le moment.</div>
          </div>
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800 }}>Dashboard</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", padding: "8px 16px", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: botCfg?.isRunning ? "#10b981" : "#64748b", animation: botCfg?.isRunning ? "pulse 2s infinite" : "none" }} />
                {botCfg?.isRunning ? "BOT ACTIF" : "BOT INACTIF"}
              </div>
            </div>

            {/* Portfolio stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
              {portfolio ? [
                { label: "Equity totale", value: fmtCurrency(portfolio.equity), sub: portfolio.isPaper ? "Paper trading" : "Live", color: "#e2e8f0" },
                { label: "Cash disponible", value: fmtCurrency(portfolio.cash), sub: "Prêt à trader", color: "#3b82f6" },
                { label: "P&L du jour", value: fmtCurrency(portfolio.dayPnl), sub: portfolio.dayPnl >= 0 ? "En progression" : "En recul", color: portfolio.dayPnl >= 0 ? "#10b981" : "#ef4444" },
                { label: "Positions ouvertes", value: String(portfolio.positions.length), sub: `/${botCfg?.maxOpenPositions || "—"} max`, color: "#f59e0b" },
              ] : [
                { label: "Equity totale", value: "—", sub: "Connectez Alpaca", color: "#334155" },
                { label: "Cash disponible", value: "—", sub: "—", color: "#334155" },
                { label: "P&L du jour", value: "—", sub: "—", color: "#334155" },
                { label: "Positions ouvertes", value: "—", sub: "—", color: "#334155" },
              ].map(s => (
                <div key={s.label} style={S.card}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Alpaca connect prompt */}
            {!botCfg?.alpacaConnected && (
              <div style={{ ...S.card, border: "1px solid rgba(245,158,11,0.3)", marginBottom: 24 }}>
                <h3 style={{ fontWeight: 700, marginBottom: 4, color: "#f59e0b" }}>⚡ Connectez votre compte Alpaca</h3>
                <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>Créez un compte gratuit sur alpaca.markets (paper trading disponible) et entrez vos clés API.</p>
                <form onSubmit={connectAlpaca} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 4 }}>API KEY ID</label>
                    <input value={alpacaKey} onChange={e => setAlpacaKey(e.target.value)} placeholder="PKXXXXXXXXXXXXXX" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 4 }}>SECRET KEY</label>
                    <input type="password" value={alpacaSecret} onChange={e => setAlpacaSecret(e.target.value)} placeholder="••••••••••••••••" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13 }} />
                  </div>
                  <button type="submit" disabled={connecting} style={{ padding: "10px 20px", background: "#f59e0b", color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                    {connecting ? "..." : "Connecter"}
                  </button>
                </form>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 12, color: "#475569" }}>
                  <input type="checkbox" checked={isPaper} onChange={e => setIsPaper(e.target.checked)} />
                  Paper trading (simulé — recommandé pour commencer)
                </label>
              </div>
            )}

            {/* Recent trades */}
            <div style={S.card}>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Trades récents</div>
              {trades.length === 0 ? (
                <div style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: 24 }}>Aucun trade pour l'instant — démarrez le bot !</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Symbol", "Side", "Prix entrée", "P&L", "Score", "Statut", "Date"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trades.slice(0, 8).map(t => (
                      <tr key={t.id}>
                        <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace" }}>{t.symbol}</td>
                        <td style={{ padding: "10px 12px", color: t.side === "buy" ? "#10b981" : "#ef4444", fontSize: 12, fontWeight: 600 }}>{t.side.toUpperCase()}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>${parseFloat(String(t.entryPrice)).toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", color: (t.pnl || 0) >= 0 ? "#10b981" : "#ef4444", fontFamily: "monospace", fontSize: 13 }}>
                          {t.pnl ? `${(t.pnl) >= 0 ? "+" : ""}$${parseFloat(String(t.pnl)).toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}><WolfScore score={t.score || 0} /></td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ ...S.tag(t.status === "open" ? "245,158,11" : t.status === "closed" ? "16,185,129" : "100,116,139") }}>{t.status}</span>
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 11, color: "#334155" }}>{new Date(t.openedAt).toLocaleDateString("fr-CH")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* POSITIONS */}
        {tab === "positions" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Positions ouvertes</h2>
            {!portfolio ? (
              <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#475569" }}>Connectez Alpaca pour voir vos positions</div>
            ) : portfolio.positions.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#475569" }}>Aucune position ouverte</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {portfolio.positions.map(p => (
                  <div key={p.symbol} style={{ ...S.card, display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr 1fr", alignItems: "center", gap: 16 }}>
                    <div style={{ fontWeight: 800, fontSize: 18, fontFamily: "monospace" }}>{p.symbol}</div>
                    <div>
                      <div style={{ fontSize: 12, color: "#475569" }}>Entrée</div>
                      <div style={{ fontFamily: "monospace" }}>${p.entryPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#475569" }}>Actuel</div>
                      <div style={{ fontFamily: "monospace" }}>${p.currentPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#475569" }}>P&L</div>
                      <div style={{ color: p.pnl >= 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                        {p.pnl >= 0 ? "+" : ""}{fmtCurrency(p.pnl)} ({fmtPct(p.pnlPercent)})
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#475569" }}>Valeur</div>
                      <div>{fmtCurrency(p.marketValue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BOT CONFIG */}
        {tab === "bot" && botCfg && (
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Configuration du bot</h2>
            <div style={{ ...S.card, marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Gestion du risque</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  { label: "Capital max/trade (USD)", key: "maxCapitalPerTrade", value: botCfg.maxCapitalPerTrade },
                  { label: "Positions max simultanées", key: "maxOpenPositions", value: botCfg.maxOpenPositions },
                  { label: "Stop-loss (%)", key: "stopLossPercent", value: botCfg.stopLossPercent },
                  { label: "Take-profit (%)", key: "takeProfitPercent", value: botCfg.takeProfitPercent },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: "#475569", display: "block", marginBottom: 4 }}>{f.label}</label>
                    <input defaultValue={String(f.value)} type="number" style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13 }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Secteurs activés</h3>
              {[
                { key: "enableDefense", label: "🛡️ Défense", value: botCfg.enableDefense },
                { key: "enableAerospace", label: "🚀 Aérospatiale", value: botCfg.enableAerospace },
                { key: "enableCyber", label: "🔐 Cybersécurité", value: botCfg.enableCyber },
                { key: "enableEnergy", label: "⚡ Énergie", value: botCfg.enableEnergy },
                { key: "enableGold", label: "🥇 Or & Métaux", value: botCfg.enableGold },
              ].map(s => (
                <label key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                  <span style={{ fontSize: 14 }}>{s.label}</span>
                  <div style={{ width: 42, height: 24, background: s.value ? "#10b981" : "#1e293b", borderRadius: 12, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 3, left: s.value ? 20 : 3, width: 18, height: 18, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* BILLING */}
        {tab === "billing" && (
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24 }}>Abonnement</h2>
            <div style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{user?.plan?.toUpperCase() || "TRIAL"}</div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>Statut: {user?.status}</div>
                  {user?.trialEndsAt && <div style={{ color: "#f59e0b", fontSize: 12 }}>Essai jusqu'au {new Date(user.trialEndsAt).toLocaleDateString("fr-CH")}</div>}
                </div>
                <button style={{ padding: "10px 20px", background: "#f59e0b", color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
                  onClick={async () => { const r = await apiFetch("/api/stripe/portal", { method: "POST" }); const d = await r.json(); if (d.url) window.open(d.url); }}>
                  Gérer l'abonnement
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 24 }}>
                {[
                  { plan: "starter", name: "Starter", price: "CHF 49/mois" },
                  { plan: "pro", name: "Pro", price: "CHF 99/mois" },
                  { plan: "premium", name: "Premium", price: "CHF 199/mois" },
                ].map(p => (
                  <div key={p.plan} style={{ padding: 16, background: user?.plan === p.plan ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${user?.plan === p.plan ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, textAlign: "center" }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>{p.price}</div>
                    {user?.plan !== p.plan && (
                      <button style={{ padding: "6px 14px", background: "#f59e0b", color: "#000", fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                        onClick={async () => { const r = await apiFetch("/api/stripe/checkout", { method: "POST", body: JSON.stringify({ plan: p.plan }) }); const d = await r.json(); if (d.url) window.location.href = d.url; }}>
                        Choisir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── APP ROOT ───────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<"landing" | "login" | "dashboard">(() => {
    const token = localStorage.getItem("wolf_token");
    if (token) {
      try { const p = JSON.parse(atob(token.split(".")[1])); if (p.exp > Date.now() / 1000) return "dashboard"; } catch {}
    }
    return "landing";
  });

  function handleLogout() { localStorage.removeItem("wolf_token"); setPage("landing"); }

  if (page === "dashboard") return <Dashboard onLogout={handleLogout} />;
  if (page === "login") return <LoginPage onBack={() => setPage("landing")} onLogin={() => setPage("dashboard")} />;
  return <Landing onLogin={() => setPage("login")} />;
}
