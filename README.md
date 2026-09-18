# HUB Predictions

Windows-local Kalshi desk. Host is the Vite app in `hub-prediction/`. This is not grok.me, not Grok Build Publish, and not TestFlight.

Same desk on the house PC and on iPhone. Settings and contract sizes persist on the device that edits them.

## Windows house PC (host)

Machine hostname **HUB**. Needs Node.js 20+ and Edge or Chrome.

```bat
cd hub-prediction
npm install
npm run dev
```

Open **http://localhost:8080** in Edge or Chrome on the machine named **HUB**. Leave that tab **open** — sends do not run from a hidden-only tab. Soft FAIL grok.me as the host.

The dev server binds all interfaces (`--host`) so a phone on the same LAN can reach it.

### Find the LAN URL

Command Prompt:

```bat
ipconfig
```

Use the IPv4 address of the Wi-Fi / Ethernet adapter (example `192.168.1.42`). Phone URL:

```
http://192.168.1.42:8080
```

If the phone cannot connect, allow Node.js on port **8080** in Windows Defender Firewall.

Kalshi API Key ID + PEM are pasted in Settings at runtime. They stay in that browser’s localStorage. Never commit `.env`, `.pem`, or keys.

Default: **Live bets OFF**, **all bots OFF**, paper only.

## iPhone (same desk)

1. Join the same Wi-Fi as the Windows PC.
2. Open Safari to `http://<windows-lan-ip>:8080` (from `ipconfig` above).
3. Edit contracts / bots / live cash / arm windows / through $ / ¢ bands in **Settings** on that page — not a desktop-only screen.
4. Safari → Share → Add to Home Screen if you want an icon. Optional.

Changing Bitcoin / NG / Copper / Gold contracts on the phone writes `localStorage`. Refresh keeps the new size.

The existing HubPrediction iOS target is not required to run the first desk. If you later open that app, point it at the same LAN URL. Soft FAIL grok.me as the host. No TestFlight.

## Soft KEEP

- Header **HUB PREDICTIONS**, sticky
- Tapes BTC / NG / CU / GLD 15m
- Each tape: Hit % (Kalshi-settled W–L), WAIT/UP/DOWN, clock, BEAT/LINE, live $
- TTL 24H one latch across all four tapes
- Pulse: live ticket only (green / red). No bet = quiet card
- Ticket on the dashboard only after a real Kalshi order id
- UP ¢ = Kalshi YES ask, DOWN ¢ = Kalshi NO ask (same snapshot)
- live $ from Kalshi `live_data` / timeseries last print
- Recipes: BTC 8:00–3:00 / $40 / 69–89¢ · NG 8:00–0:45 / $0.002 / 34–89¢ · CU 9:00–0:45 / $0.002 / 34–89¢ · GLD 10:00–3:00 / $2 / 34–89¢
