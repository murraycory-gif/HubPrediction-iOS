# HUB Prediction

Standalone iPhone-first desk for Kalshi 15-minute BTC Up/Down (`KXBTC15M`).

**This is its own app.** It is not Fulfillment Heartbeat, FamilyHub, or any other iOS project. It does not share Swift sources, Xcode targets, Fastlane lanes, or Heartbeat data. Run it from this folder only.

One page: sticky call, Kalshi tape, trend chart, roulette, rest-of-day table, optional API trading.

```bash
cd hub-prediction
npm install
npx playwright install chromium
npm run dev
```

The iPhone app is the native target `HubPrediction.xcodeproj` at the repo root (bundle `com.corymurray.HubPrediction`). Ship it from **HubPrediction-iOS** with `./push-hub-testflight.sh` on your Mac — see `HUB_TESTFLIGHT.md`. That build does not run through the Mac after install.

This folder is the web desk for local `npm run dev` / Grok webview. It is not Heartbeat.

Standalone home-screen mode uses the iPhone safe-area inset instead of the 56px Grok overlay gap.

```bash
npm test          # forecast + sizing
npm run qc        # Playwright iPhone QC
```

Quote path is Kalshi open markets + BRTI (Coinbase fallback). Exchange status is checked in the background so a halt holds last ¢. Candles, last week, and settled 24 warm in the background. No splash, no second Tape page, no Google fonts. We do not ingest the rest of the Kalshi docs catalog.
