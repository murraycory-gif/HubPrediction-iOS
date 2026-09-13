# HUB Prediction — Soft KEEP / FAIL

Soft KEEP means the check is structurally correct in this standalone repo. Linux cloud agents cannot run `xcodebuild` or upload to App Store Connect, so archive / signing / TestFlight install stay Soft until Cory’s Mac.

This product is **HubPrediction-iOS only**. FAIL if any item still depends on Fulfillment Heartbeat sources, targets, or TestFlight.

## Checklist

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Repo is the HUB Predictions product, not a Heartbeat subtree | KEEP | `HubPrediction.xcodeproj` + `HubPrediction/` at repo root. No `FulfillmentHeartbeat/` tree. |
| 2 | Zero Heartbeat Swift / target coupling | KEEP | No `import` of Heartbeat modules. `pbxproj` lists only HubPrediction sources. |
| 3 | Bundle ID `com.corymurray.HubPrediction` | KEEP | Target + Fastlane Appfile. |
| 4 | Team `M7FL68Q43A` | KEEP | Debug + Release `DEVELOPMENT_TEAM`. |
| 5 | Xcode paths resolve standalone | KEEP | `INFOPLIST_FILE` and entitlements are `HubPrediction/…` relative to this repo. Scheme container is `HubPrediction.xcodeproj`. |
| 6 | Every on-disk Swift file is in the target | KEEP | 10 sources: App, Theme, Models, ChicagoTime, Forecast, KalshiSignal, KalshiClient, DeskStore, DeskView, ChartCanvas. |
| 7 | App icon is TestFlight-legal | KEEP | `AppIcon.png` 1024×1024, 8-bit RGB, no alpha. |
| 8 | Phone talks to Kalshi + Coinbase itself | KEEP | `KalshiClient` hits `external-api.kalshi.com` + Coinbase spot/candles. Mac not required after install. |
| 9 | Network client entitlement | KEEP | `com.apple.security.network.client` in `HubPrediction.entitlements`. |
| 10 | Export compliance | KEEP | `ITSAppUsesNonExemptEncryption` = false. |
| 11 | iPhone-only family | KEEP | `TARGETED_DEVICE_FAMILY = 1`. Portrait. Display name **HUB Pred**. |
| 12 | TF archive script is Hub-only | KEEP | `./push-hub-testflight.sh` archives scheme `HubPrediction`. Does not mention Heartbeat projects. |
| 13 | Docs / Fastlane point at this repo | KEEP | `~/Developer/HubPrediction-iOS`. Fastfile has no Heartbeat project/scheme. |
| 14 | Web desk forecast unit tests | KEEP | `hub-prediction` vitest (forecast + sizing). Not the iPhone binary. |
| 15 | `xcodebuild` archive on this machine | Soft KEEP | No Xcode in this Linux environment. Script + project settings are ready for the Mac command below. |
| 16 | App Store Connect listing exists | Soft KEEP | First-time create steps are in `HUB_TESTFLIGHT.md`. Skip if the app already exists. |
| 17 | TestFlight install on Cory’s iPhone | Soft KEEP | Human step after upload: Internal group → TestFlight → **HUB Pred**. |

## FAIL (none)

No FAIL items after the standalone path + Fastlane rewrite.

## Mac TestFlight commands

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

If signing is not set up yet:

```bash
open HubPrediction.xcodeproj
```

Xcode → Settings → Accounts → Apple ID for team `M7FL68Q43A`. Target **HubPrediction** → Signing & Capabilities → Automatically manage signing.

Optional silent upload:

```bash
bundle install
bundle exec fastlane hub_beta
```

## Re-run Linux checks

```bash
./verify-standalone.sh
cd hub-prediction && npm install && npm test
```
