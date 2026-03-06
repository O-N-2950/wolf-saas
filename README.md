# 🐺 Wolf Trading — SaaS

**Bot de trading automatisé focalisé défense, aérospatiale & cybersécurité**

> Built by Groupe NEO · Courgenay, Canton du Jura, Suisse

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL (Railway) + Drizzle ORM |
| Frontend | React 18 + Vite + CSS-in-JS |
| Auth | Magic Link + JWT |
| Payments | Stripe (subscriptions) |
| Broker | Alpaca Markets API |
| Email | Resend |
| Deploy | Railway |

## Plans

| Plan | Prix | Positions | Secteurs |
|------|------|-----------|---------|
| Starter | CHF 49/mois | 5 | Défense + Aéro |
| Pro | CHF 99/mois | 15 | Tous (5) |
| Premium | CHF 199/mois | Illimitées | Tous + custom |

## Algorithme Wolf — Score 6 facteurs

1. **Tendance** — EMA 20/50/200 alignées
2. **Volume** — > moyenne 20j × 1.5
3. **RSI** — Entre 40 et 65
4. **MACD** — Croisement haussier confirmé
5. **Secteur** — Filtre selon config utilisateur
6. **Sentiment** — Actualités neutres ou positives

**Règle d'or : Aucun trade en dessous de 4/6**

## Installation locale

```bash
npm install
cp .env.example .env
# Remplir .env
npm run dev
```

## Déploiement Railway

```bash
railway up
```

## Variables d'environnement requises

Voir `.env.example`

## Roadmap

- [ ] Intégration engine Wolf local complet
- [ ] Alertes Telegram par trade
- [ ] Rapport PDF mensuel (Premium)
- [ ] Multi-compte Alpaca (Premium)
- [ ] API publique (Premium)
- [ ] Mobile app (React Native)

---

*Groupe NEO · WW Finance Group Sàrl · FINMA F01042365*
