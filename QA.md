# HUB Prediction — Soft KEEP / FAIL (full product)

Locked product: **full desk**. Signal-only is Soft FAIL. Soft KEEP = every checklist item is wired in **native** HubPrediction SwiftUI (not web-only). Linux cannot Run Catalyst, so device fills stay Soft until Cory’s Mac / iPhone Run.

**TestFlight HOLD** until this bar is Soft KEEP on Mac + iPhone.

No Heartbeat. No secrets in git. Live PEM is Keychain-only. Default mode is **Paper**.

## Checklist (ALL required)

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Buy call in last 6–4 minutes before settle | KEEP (structural) | Gold desk hero: **BUY UP** / **BUY DOWN** / **SIT** + `Desk will buy` + `to close`. Fills still 6–4m gated. |
| 2 | AI bots execute ALL buying (live + paper) in 6–4m | KEEP (structural) | SCOUT/SIGNAL/RISK. Armed bots call `confirmPlace` for paper and LIVE (keys required). Humans also gated to `BuyPhase.open`. |
| 3 | Show cash; size for profit | KEEP (structural) | `CashStrip` + quarter-Kelly `SizeCash` + expected profit EV. |
| 4 | Beat-the-trend forecast; visible next-15m dash | KEEP (structural) | Mint DASH = beat path (gap/tape/bots/shape). Orange dotted = naive last-6m. Not a last-week replot. Call bar shows BEAT/FADE/WITH TREND. |
| 5 | Live spot-on refresh | KEEP (structural) | Combine `.common` pulse **200ms**. Spot/asks **200ms**. Call is `kalshiCall` + `holdThesis`. Halt does not freeze spot. Board cannot clobber fresher asks. |
| 6 | Main chart: last week + theory + actual + current/upcoming | KEEP (structural) | `ChartCanvas` draws gray last week, blue theory, green actual/live, upcoming dash. |
| 7 | Second chart: theory vs actual difference | KEEP (structural) | `VarianceChart` under TREND on Mac + iPhone. |
| 8 | Markets browse + trade place/confirm + error/retry | KEEP (structural) | Markets sheet, PAPER/LIVE trade, banner Retry. |
| 9 | Mac Catalyst + iPhone | KEEP (structural) | Same target. Mac window movable + resizable (visible titlebar, `maximumSize` set, titlebar spacer `allowsHitTesting(false)`). |
| 10 | No secrets in git; no Heartbeat | KEEP | Keychain-only creds. |
| 11 | Grok Build Now + rest of day · 15 min desk | KEEP (structural) | Native table+charts: Clock / Theory / Actual / Preview / Variance / Last week / Vs open / High / Low. Theory = hub-prediction `buildDashboard` (last-6m slope × 90m fade + last-week shape). Preview = naive slope (empty after Actual prints). Vs open / High / Low from Coinbase 15m OHLC last week. |

| Extra | Verdict | Notes |
|-------|---------|-------|
| TF HOLD | HOLD | Do not `./push-hub-testflight.sh`. |
| Mac visual Soft KEEP PASS | **not claimed** | Cory Run is the only visual PASS. Linux cannot Run Catalyst. |
| Top BUY call | KEEP (source) | Gold hero pill + POSTED / THEORY CLOSE / LIVE VS POSTED + KALSHI POSTED / THEORY AT CLOSE + huge UP/DOWN ¢ + Trend. `kalshiCall` + `holdThesis`. |
| Mac window | KEEP (source) | Heartbeat Mac: `.defaultSize(1280, 860)` + `sizeRestrictions.minimumSize` 1100×720. Expand fills; gold desk `maxWidth` infinity. No UIWindow CGRect fill. |
| First-paint theory | KEEP (source) | Gold Trend card first; rest-of-day 9-col table stays in the scroll below. |
| Device Run | Soft until Cory Run | Mac + iPhone. |

## FAIL

None in source. Prior Soft FAILs (signal-only desk, clipped dash, Catalyst `if let ?? await`) are closed in this revision.

## How to switch Live / Paper

Trade row **PAPER** | **LIVE** (below the Grok Build call-bar). Call bar: `Desk // signal` + BUY UP / BUY DOWN / SIT.

- **Paper** (default): Human confirm or **BOTS ON** auto-fill — only in the 6–4m window. No Kalshi order POST.
- **Live**: Human Confirm LIVE only in the 6–4m window. **BOTS ON** executes LIVE Kalshi orders in that window (Keys required). Cancel aborts a human dialog.

### Mac

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

**My Mac (Mac Catalyst)** → **Run**.

### iPhone — TF HOLD

Xcode → connected iPhone → **Run**. Same desk.

Do **not** `./push-hub-testflight.sh` until this bar is Soft KEEP on Mac and iPhone.

```bash
./verify-standalone.sh
```
