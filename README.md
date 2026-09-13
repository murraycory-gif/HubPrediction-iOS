# HubPrediction-iOS

Full Kalshi desk: buy window (last **6–4 minutes**), **bots** that execute paper/live buys, cash + profit size, TREND + variance charts. **Paper** (local fills) and **Live** (confirmed Kalshi orders). Default series `KXBTC15M`. Display name **HUB Pred**. Bundle `com.corymurray.HubPrediction`. Team `M7FL68Q43A`.

Switch mode on the trade row: **PAPER** | **LIVE**. Fills only in the last **6–4 minutes**. Arm **BOTS ON** to execute ALL buys in that window (paper local; LIVE Kalshi with Keys). Paper never posts to Kalshi order endpoints.

iPhone + Mac Catalyst. **Not Fulfillment Heartbeat.**

**TestFlight HOLD** until Soft KEEP on the full-desk bar (see `QA.md`).

Keys (API Key ID + PEM) are pasted at runtime into Keychain. Nothing secret is in git.

## Mac — Xcode Run

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

Destination **My Mac (Mac Catalyst)** → **Run**.

## iPhone — TF HOLD

Local: Xcode destination = iPhone → **Run**.

Do not upload TestFlight until QA Soft KEEP on Mac + iPhone. Then `./push-hub-testflight.sh` — [HUB_TESTFLIGHT.md](HUB_TESTFLIGHT.md).

## QA

[QA.md](QA.md)
