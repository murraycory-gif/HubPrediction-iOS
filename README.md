# HubPrediction-iOS

Standalone **view-only** desk for Kalshi 15-minute BTC Up/Down (`KXBTC15M`). Display name **HUB Pred**. Bundle `com.corymurray.HubPrediction`. Team `M7FL68Q43A`.

iPhone + Mac Catalyst (same SwiftUI target). **This is not Fulfillment Heartbeat.**

The phone and the Mac both call Kalshi and Coinbase themselves. After a TestFlight install, the Mac does not need to stay on.

## Mac — Xcode Run

```bash
cd ~/Developer/HubPrediction-iOS
git pull
open HubPrediction.xcodeproj
```

Destination **My Mac (Mac Catalyst)** → **Run**. Local signed window. Not TestFlight.

## iPhone — TestFlight

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

Organizer → **Distribute App** → **App Store Connect** → **Upload**. Details: [HUB_TESTFLIGHT.md](HUB_TESTFLIGHT.md).

Optional: `bundle exec fastlane hub_beta`

Or Xcode destination = connected iPhone → **Run**.

## Web desk (optional)

`hub-prediction/` is the local / Grok web desk on port 8080. Same product, not the TestFlight binary.

```bash
cd hub-prediction
npm install
npm run dev
npm test
```

## QA

Soft KEEP / FAIL: [QA.md](QA.md)
