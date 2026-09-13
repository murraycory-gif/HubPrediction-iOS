# HUB Prediction — Soft KEEP / FAIL (Live + Paper)

Locked product: **full desk in both modes**. Soft KEEP = path is wired in source. Linux cannot Run Catalyst or send a live Kalshi order, so device fills stay Soft until Cory’s Mac / iPhone Run.

**TestFlight HOLD** until this bar is Soft KEEP on Mac + iPhone.

No Heartbeat. No secrets in git. Live PEM is Keychain-only. Default mode is **Paper**.

## Soft KEEP bar

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Mode toggle Live vs Paper; paper never hits live Kalshi order endpoints; live requires explicit Confirm | KEEP (structural) | Trade row **PAPER** \| **LIVE** (Mac + iPhone). Persisted. Default Paper. `confirmPlace` paper branch calls only `PaperBook.place` and returns. `placeLive` also refuses unless `PaperBook.mode == .live`. Live: `requestPlace` → dialog → **Confirm LIVE** → `placeLive`. |
| 2 | Markets browse + search (not only KXBTC15M) | KEEP (structural) | **Markets** sheet: search ticker / series / title. Empty query lists open `KXBTC15M`. Default button resets to BTC15m. |
| 3 | Trade place / confirm / size / side in both modes | KEEP (structural) | Same UP / DOWN, − / +, Suggest, confirm dialog. Paper fills local $10k book. Live uses Keychain keys. |
| 4 | Empty / error + Retry | KEEP (structural) | Banner + **Retry**. Halt is an explicit last-¢ hold, not silent. Empty markets / no quote / keys needed all surface. |
| 5 | Mac first-paint signal desk; phone no forced H-scroll on rest-of-day | KEEP (structural) | Mac: call / mode / trade / tape / chart / roulette pinned (`layoutPriority(1)`). Tables only in `ScrollView`. Phone: stacked rest-of-day cards (`phoneStat`). Day chips may H-scroll; rest-of-day does not. |
| 6 | No secrets in git; live creds runtime-only | KEEP | `*.pem` / `*.p8` / `.env` gitignored. Keys sheet → Keychain `com.corymurray.HubPrediction.kalshi`. |

| Extra | Verdict | Notes |
|-------|---------|-------|
| TF HOLD | KEEP | Do not `./push-hub-testflight.sh` yet. |
| Live Mac + iPhone paper fill + live confirm | Soft KEEP | Needs Cory Run. Live also needs PEM. |

## FAIL

None in source.

## How to switch Live / Paper

Same control on Mac and iPhone: trade row **PAPER** | **LIVE**. Call bar also shows `DESK // SIGNAL · PAPER|LIVE · {series}`.

- **Paper** (default): Confirm paper writes a local fill and deducts paper cash. No Kalshi `/portfolio/orders` or `/portfolio/events/orders` POST. Reset paper returns cash to $10,000.
- **Live**: Confirm LIVE sends a real Kalshi order. **Keys** sheet (API Key ID + PEM) required first. Cancel aborts.

### Mac

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

**My Mac (Mac Catalyst)** → **Run**. Tap **PAPER** or **LIVE** on the trade row.

### iPhone — TF HOLD

Xcode → connected iPhone → **Run**. Same **PAPER** / **LIVE** toggle.

Do **not** `./push-hub-testflight.sh` until this bar is Soft KEEP on Mac and iPhone.

```bash
./verify-standalone.sh
```
