# HUB Prediction — Soft KEEP / FAIL

Soft KEEP means the check is structurally correct in this standalone repo. Linux cloud agents cannot run `xcodebuild` or upload to App Store Connect, so archive / signing / TestFlight install / live Mac window stay Soft until Cory’s Mac.

This product is **HubPrediction-iOS only** — view-only BTC15m desk (`KXBTC15M`). FAIL if any item still depends on Fulfillment Heartbeat sources, targets, or TestFlight.

## Checklist

| # | Check | Verdict | Notes |
|---|--------|---------|-------|
| 1 | Repo is the HUB Predictions product, not a Heartbeat subtree | KEEP | `HubPrediction.xcodeproj` + `HubPrediction/` at repo root. No `FulfillmentHeartbeat/` tree. |
| 2 | Zero Heartbeat Swift / target coupling | KEEP | No `import` of Heartbeat modules. `pbxproj` lists only HubPrediction sources. |
| 3 | Bundle ID `com.corymurray.HubPrediction` | KEEP | Target + Fastlane Appfile. Same ID on iPhone and Mac Catalyst (`DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = NO`). |
| 4 | Team `M7FL68Q43A` | KEEP | Debug + Release `DEVELOPMENT_TEAM`. |
| 5 | Xcode paths resolve standalone | KEEP | `INFOPLIST_FILE` and entitlements are `HubPrediction/…` relative to this repo. |
| 6 | Every on-disk Swift file is in the target | KEEP | 11 sources including `HubDesk.swift`. |
| 7 | App icon is TestFlight-legal | KEEP | `AppIcon.png` 1024×1024, 8-bit RGB, no alpha. |
| 8 | Kalshi + Coinbase paths, no secrets | KEEP | Public `external-api.kalshi.com` + Coinbase spot/candles. No API keys or tokens in the tree. |
| 9 | Network client entitlement | KEEP | Sandbox + `network.client` — required for Catalyst and iPhone. |
| 10 | Export compliance | KEEP | `ITSAppUsesNonExemptEncryption` = false. |
| 11 | iPhone kept | KEEP | `TARGETED_DEVICE_FAMILY = 1,2` (iPhone + iPad size class). iPhone orientations stay portrait. |
| 12 | Mac destination is Catalyst, not stretched phone | KEEP | `SUPPORTS_MACCATALYST = YES`. `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO` so Xcode offers **My Mac (Mac Catalyst)**, not Designed-for-iPhone. Wide desk: call bar + two columns + full-width table. |
| 13 | Cold open starts the desk | KEEP | `HubPredictionApp` `.onAppear { store.start() }` on both destinations. |
| 14 | TF archive script is iOS-only Hub | KEEP | `./push-hub-testflight.sh` uses `generic/platform=iOS`. Mac view is Xcode Run, not TestFlight. |
| 15 | Docs / Fastlane point at this repo | KEEP | `~/Developer/HubPrediction-iOS`. Fastfile has no Heartbeat project/scheme. |
| 16 | Web desk forecast unit tests | KEEP | `hub-prediction` vitest: 6/6 passed. |
| 17 | Web desk production build | KEEP | `npm run build` succeeded. |
| 18 | `xcodebuild` iOS archive / Mac Catalyst run | Soft KEEP | No Xcode in this Linux environment. Settings are ready for the Mac commands below. |
| 19 | App Store Connect listing | Soft KEEP | First-time create steps in `HUB_TESTFLIGHT.md`. iOS only. |
| 20 | TestFlight install on Cory’s iPhone | Soft KEEP | Internal group → TestFlight → **HUB Pred**. |
| 21 | Live Mac window + live quotes | Soft KEEP | Human: Xcode → **My Mac (Mac Catalyst)** → Run. |

## FAIL (none)

No FAIL items after the Catalyst + wide-desk change.

## How Cory runs it

### Mac (local window)

Same team and bundle. Not TestFlight. First Run may auto-create a Mac Catalyst profile.

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

Xcode destination **My Mac (Mac Catalyst)** → **Run** (⌘R).

If that destination is missing: target **HubPrediction** → General → **Mac** (Catalyst) checked; **Designed for iPhone** unchecked. Signing → Automatically manage signing → team `M7FL68Q43A`.

Optional: `bundle exec fastlane mac_build`

### iPhone (TestFlight or device)

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

Organizer → **Distribute App** → **App Store Connect** → **Upload**. Then TestFlight → **HUB Pred**.

Or Xcode destination = the connected iPhone → **Run**.

## Re-run Linux checks

```bash
./verify-standalone.sh
cd hub-prediction && npm install && npm test
```
