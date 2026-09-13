# TestFlight

HUB Prediction lives in this repo. Follow **[HUB_TESTFLIGHT.md](HUB_TESTFLIGHT.md)**.

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

Optional: `bundle exec fastlane hub_beta`

Mac desk is **Xcode → My Mac (Mac Catalyst) → Run**, not this upload. Same team and bundle; no extra App Store Connect Mac app.
