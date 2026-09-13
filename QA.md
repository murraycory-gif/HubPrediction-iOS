# HUB Prediction — Soft KEEP / FAIL (full product)

Locked product: **full desk**. Signal-only is Soft FAIL. Soft KEEP = every checklist item is wired in **native** HubPrediction SwiftUI (not web-only). Linux cannot Run Catalyst, so device fills stay Soft until Cory’s Mac / iPhone Run.

**TestFlight HOLD** until this bar is Soft KEEP on Mac + iPhone.

No Heartbeat. No secrets in git. Live PEM is Keychain-only. Default mode is **Paper**.

## Checklist (ALL required)

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Buy call in last 6–4 minutes before settle | KEEP (structural) | `BuyWindow`: WAIT / BUY UP / BUY DOWN / NO BUY / WINDOW CLOSED. Countdown on call bar. |
| 2 | AI bots execute all buying (live + paper) | KEEP (structural) | Visible **BOTS // EXECUTE** lane (Strike / Tape / Path). Paper auto in window. LIVE Confirm. |
| 3 | Show cash; size for profit | KEEP (structural) | `CashStrip` + quarter-Kelly `SizeCash` + expected profit EV. |
| 4 | Beat-the-trend forecast; visible next-15m dash | KEEP (structural) | `chartWindow` + mint dash past now. |
| 5 | Live updating tick | KEEP (structural) | Combine `.common` pulse (not `scheduledTimer`). Quote **1s**, dash **5s**, board **10s**. Chart uses wall-clock `clockNow`. |
| 6 | Main chart: last week + theory + actual + current/upcoming | KEEP (structural) | `ChartCanvas` draws gray last week, blue theory, green actual/live, upcoming dash. |
| 7 | Second chart: theory vs actual difference | KEEP (structural) | `VarianceChart` under TREND on Mac + iPhone. |
| 8 | Markets browse + trade place/confirm + error/retry | KEEP (structural) | Markets sheet, PAPER/LIVE trade, banner Retry. |
| 9 | Mac Catalyst + iPhone | KEEP (structural) | Same target. Mac pins desk above tables. Phone stacked, no forced H-scroll on rest-of-day. |
| 10 | No secrets in git; no Heartbeat | KEEP | Keychain-only creds. |

| Extra | Verdict | Notes |
|-------|---------|-------|
| TF HOLD | KEEP | Do not `./push-hub-testflight.sh` yet. |
| Device Run (window/bots/charts/fills) | Soft KEEP | Needs Cory Run on Mac + iPhone. Live needs PEM. |

## FAIL

None in source. Prior Soft FAILs (signal-only desk, clipped dash) are closed in this revision.

## How to switch Live / Paper

Trade row **PAPER** | **LIVE**. Call bar: `BUY WINDOW 6–4m · PAPER|LIVE`.

- **Paper** (default): Confirm paper or arm **BOTS ON** — bots fill locally in the 6–4m window. No Kalshi order POST.
- **Live**: Confirm LIVE (including bot-driven). **Keys** required. Cancel aborts.

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
