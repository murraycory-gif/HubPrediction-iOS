# HUB Prediction — TestFlight (iPhone)

This is its own iPhone app in **HubPrediction-iOS**. It is not Fulfillment Heartbeat. It does not share Heartbeat screens, facts, or the Heartbeat TestFlight build.

- App name: **HUB Pred**
- Bundle ID: `com.corymurray.HubPrediction`
- Team: `M7FL68Q43A`
- Project: `HubPrediction.xcodeproj`

The phone talks to Kalshi and Coinbase directly. Your Mac does not need to stay on after install.

## First time only — create the App Store Connect app

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
2. Platform **iOS**. Name **HUB Prediction**.
3. Bundle ID **com.corymurray.HubPrediction** (Xcode can create this identifier the first time you archive if it is missing).
4. SKU `hub-prediction`.

Skip this if the app already exists.

## Send a build from your Mac

```bash
cd ~/Developer/HubPrediction-iOS
git pull
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
./push-hub-testflight.sh
```

If `xcodebuild` says it needs Xcode, the Mac is still pointed at Command Line Tools. The `xcode-select` line above fixes that.

If archive fails with **No Accounts** or **no profiles for com.corymurray.HubPrediction**, sign into Xcode first (once):

1. Open **Xcode** → **Settings** → **Accounts** → **+** → add the Apple ID for team `M7FL68Q43A`.
2. `open HubPrediction.xcodeproj`
3. Target **HubPrediction** → **Signing & Capabilities** → **Automatically manage signing** → Team = your team.
4. **Product → Archive**. Organizer → **Distribute App** → **App Store Connect** → **Upload**.

When Organizer opens from the script: **Distribute App** → **App Store Connect** → **Upload**.

Or:

```bash
bundle exec fastlane hub_beta
```

Wait until App Store Connect → **HUB Prediction** → **TestFlight** says **Ready to Test**. Add yourself to an Internal group. Install **TestFlight** on the iPhone, accept, install **HUB Pred**.

Heartbeat testers do not get this app. This TestFlight listing is only HUB Prediction.
