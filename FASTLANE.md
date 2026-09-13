# HUB Prediction — Fastlane

Automates the **simulator smoke build** and **TestFlight upload** for this app only. There is no Fulfillment Heartbeat lane in this repo.

## One-time setup

```bash
cd ~/Developer/HubPrediction-iOS
git pull
bundle install
```

If `bundle` is missing:

```bash
sudo gem install bundler
bundle install
```

## Lanes

| Command | What it does |
|---------|----------------|
| `bundle exec fastlane build` | Compile `HubPrediction` for iOS Simulator |
| `bundle exec fastlane build_clean` | Clean + compile |
| `bundle exec fastlane hub_beta` | Archive + upload to TestFlight (`com.corymurray.HubPrediction`) |
| `bundle exec fastlane beta` | Same as `hub_beta` |
| `bundle exec fastlane sims` | List simulators |

Prefer the archive script if you want Organizer instead of a silent upload:

```bash
./push-hub-testflight.sh
```

## Troubleshooting

- **No scheme HubPrediction** → open `HubPrediction.xcodeproj` once in Xcode, then re-run
- **Signing / No Accounts** → Xcode → Settings → Accounts → add the Apple ID for team `M7FL68Q43A`
- **xcodebuild wants full Xcode** → `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
