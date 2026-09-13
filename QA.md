# HUB Prediction — Soft KEEP / FAIL (full desk bar)

Soft KEEP = path is wired in this repo. Linux cannot run Xcode or hit Kalshi with Cory’s PEM, so live place/browse on device stay Soft until his Mac Run.

**TestFlight is on HOLD** until this bar is Soft KEEP on Mac + iPhone.

No Fulfillment Heartbeat coupling. No secrets in git. PEM/Key ID are Keychain-only at runtime.

## Checklist

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Hub-only, no Heartbeat | KEEP | |
| 2 | Bundle `com.corymurray.HubPrediction` + team `M7FL68Q43A` | KEEP | Same ID on Catalyst. |
| 3 | No secrets in git | KEEP | Keychain `KalshiCreds`. `.gitignore` has `*.pem`. |
| 4 | Trade path: side / size / confirm → Kalshi | KEEP (structural) | `TradePanel` + `KalshiTrade.place` (limit buy yes/no, fallback events/orders). Safe defaults: count 1…25, suggest from quarter-Kelly, confirm dialog. Live fill Soft KEEP until Cory pastes keys and confirms. |
| 5 | Markets browse / search | KEEP (structural) | `MarketsSheet` + `KalshiClient.searchMarkets`. Default series `KXBTC15M`. Live list Soft KEEP until Run. |
| 6 | Empty / error + Retry | KEEP (structural) | `DeskBanner` + Retry. Halt is an explicit hold with a control — not silent last-¢. |
| 7 | Mac first-paint: signal desk above fold | KEEP (structural) | `signalDesk` pinned (call / trade / tape / chart / roulette). Tables only in ScrollView. Was Soft FAIL on tables-only Run. Live Soft KEEP until re-Run. |
| 8 | Phone rest-of-day | KEEP (structural) | Stacked cards, no horizontal table scroll. |
| 9 | Mac Catalyst + iPhone kept | KEEP | |
| 10 | TF HOLD | KEEP | Docs say do not upload until this bar is Soft KEEP on both. |
| 11 | Web desk unit tests | KEEP | Prior vitest 6/6. |
| 12 | Live Mac+iPhone browse + place + retry | Soft KEEP | Needs Cory’s Run + Kalshi PEM. |

## FAIL

None remaining in source for this bar. Previous Soft FAIL (Mac tables-only first paint) is tipped.

## How Cory Runs

### Mac

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

**My Mac (Mac Catalyst)** → **Run**. Cold open: call bar, Markets/Keys, trade row, tape, chart, roulette. Tables below.

Keys: paste Kalshi API Key ID + PEM (device Keychain). Markets: search beyond BTC15m. Place: side + size + Confirm.

### iPhone — TF HOLD

Do **not** run `./push-hub-testflight.sh` until this bar is Soft KEEP on Mac and a device Run. Then:

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

Until then: Xcode destination = iPhone → **Run** for local QA.

## Re-run Linux checks

```bash
./verify-standalone.sh
```
