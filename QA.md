# HUB Prediction — Soft KEEP / FAIL (Live + Paper)

Soft KEEP = path is wired. Linux cannot Run Catalyst or send a live Kalshi order, so device fills stay Soft until Cory’s Mac.

**TestFlight HOLD** until this bar is Soft KEEP on Mac + iPhone.

No Heartbeat. No secrets in git. Live PEM is Keychain-only. Default mode is **Paper**.

## Checklist

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Live vs Paper toggle | KEEP (structural) | `PAPER` / `LIVE` on the trade row (Mac + iPhone). Persisted. Default Paper. |
| 2 | Paper never hits live order endpoints | KEEP (structural) | `confirmPlace` paper branch calls only `PaperBook.place`. `KalshiTrade.placeLive` is live-only. Paper does not call `/portfolio/orders`. |
| 3 | Live requires explicit Confirm | KEEP (structural) | `requestPlace` → dialog → `Confirm LIVE` → `placeLive`. |
| 4 | Markets browse / search; BTC15m default | KEEP (structural) | |
| 5 | Place / confirm / size / side in both modes | KEEP (structural) | Same UI. Paper fills local $10k book. Live uses Keychain keys. |
| 6 | Empty / error + Retry | KEEP (structural) | Banner + Retry. Halt is explicit. |
| 7 | Mac first-paint signal desk | KEEP (structural) | Call / mode / trade / tape / chart / roulette pinned. Tables scroll. |
| 8 | Phone rest-of-day stacked cards | KEEP (structural) | No forced H-scroll. |
| 9 | No secrets in git | KEEP | |
| 10 | TF HOLD | KEEP | |
| 11 | Live Mac+iPhone paper fill + live confirm | Soft KEEP | Needs Cory Run. Live also needs PEM. |

## FAIL

None in source.

## How to switch Live / Paper

Same control on Mac and iPhone: trade row **PAPER** | **LIVE**.

- **Paper** (default): Confirm paper writes a local fill and deducts paper cash. No Kalshi order POST. Reset paper returns cash to $10,000.
- **Live**: Confirm LIVE sends a real Kalshi order. Keys sheet required. Cancel aborts.

### Mac

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

**My Mac (Mac Catalyst)** → **Run**. Tap PAPER or LIVE on the trade row.

### iPhone — TF HOLD

Xcode → iPhone → **Run**. Same PAPER / LIVE toggle.

Do **not** `./push-hub-testflight.sh` until this bar is Soft KEEP on Mac and iPhone.

```bash
./verify-standalone.sh
```
