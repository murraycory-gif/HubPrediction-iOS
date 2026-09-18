# HUB Predictions — Windows local desk

Vite + TanStack Start host. Run this folder on the Windows house PC. Soft FAIL grok.me / Grok Build Publish.

```bat
cd hub-prediction
npm install
npm run dev
```

Open http://localhost:8080 in Edge or Chrome. Keep the tab visible.

Phone on the same LAN: `http://<windows-ipv4>:8080` in Safari. Contract sizes persist in the phone's localStorage. Kalshi cash and last-24h settlements paint from Windows-host keys — Safari does not need a PEM.

On the Windows PC, set `KALSHI_KEY_ID` + `KALSHI_PRIVATE_KEY` in `hub-prediction/.env.local`, or put gitignored files at `.secrets/kalshi_key_id.txt` and `.secrets/kalshi_key.pem` next to the repo (or at `../.secrets` from this folder). Soft FAIL commit those files. Soft FAIL paste PEM on the phone.

```bat
npm test
```

Live bets and bots default OFF. Kalshi keys stay on the Windows host. Stable stylesheet is `/desk.css` — no hashed `/assets/index-*.css` refresh loop.
