# HubPrediction-iOS

Standalone iPhone app for Kalshi 15-minute BTC Up/Down (`KXBTC15M`). Display name **HUB Pred**. Bundle `com.corymurray.HubPrediction`. Team `M7FL68Q43A`.

**This is not Fulfillment Heartbeat.** There is no Heartbeat target, screen, fact ingest, or shared Fastlane lane here. The phone calls Kalshi and Coinbase itself.

## TestFlight (Mac)

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

Then Organizer → **Distribute App** → **App Store Connect** → **Upload**. First time: create the App Store Connect app with that bundle ID. Details: [HUB_TESTFLIGHT.md](HUB_TESTFLIGHT.md).

Optional: `bundle exec fastlane hub_beta`

## Open in Xcode

```bash
open HubPrediction.xcodeproj
```

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
