#!/bin/sh
# Linux-safe product QA. Does not run Xcode.
set -eu
cd "$(dirname "$0")"

fail=0
note() { printf '%s\n' "$*"; }
bad() { note "FAIL: $*"; fail=1; }
ok() { note "KEEP: $*"; }

# Heartbeat product must not be here
for p in \
  FulfillmentHeartbeat \
  FulfillmentHeartbeat.xcodeproj \
  FulfillmentHeartbeat.xcworkspace \
  FulfillmentHeartbeatTests \
  ingest-heartbeat.sh \
  install-ipad.sh \
  push-testflight.sh
do
  if [ -e "$p" ]; then
    bad "Heartbeat leftover present: $p"
  fi
done
ok "no Heartbeat product tree"

[ -f HubPrediction.xcodeproj/project.pbxproj ] || bad "missing HubPrediction.xcodeproj"
[ -f HubPrediction/HubPredictionApp.swift ] || bad "missing HubPredictionApp.swift"
[ -x push-hub-testflight.sh ] || bad "push-hub-testflight.sh not executable"
[ -f HUB_TESTFLIGHT.md ] || bad "missing HUB_TESTFLIGHT.md"
[ -f fastlane/Fastfile ] || bad "missing fastlane/Fastfile"
ok "required product files present"

pbx=HubPrediction.xcodeproj/project.pbxproj
grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.corymurray.HubPrediction' "$pbx" || bad "bundle id"
grep -q 'DEVELOPMENT_TEAM = M7FL68Q43A' "$pbx" || bad "team"
grep -q 'INFOPLIST_FILE = HubPrediction/Info.plist' "$pbx" || bad "Info.plist path"
grep -q 'CODE_SIGN_ENTITLEMENTS = HubPrediction/HubPrediction.entitlements' "$pbx" || bad "entitlements path"
grep -q FulfillmentHeartbeat "$pbx" && bad "Heartbeat string in pbxproj"
ok "pbxproj bundle/team/paths"

grep -q 'SUPPORTS_MACCATALYST = YES' "$pbx" || bad "Mac Catalyst not enabled"
grep -q 'TARGETED_DEVICE_FAMILY = "1,2"' "$pbx" || bad "device family should keep iPhone and add iPad/Catalyst size class"
grep -q 'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO' "$pbx" || bad "Designed-for-iPhone Mac dest should be off"
grep -q 'DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER = NO' "$pbx" || bad "Catalyst must keep same bundle id"
ok "Mac Catalyst + iPhone family"

for f in \
  HubPredictionApp.swift \
  Theme.swift \
  Models.swift \
  ChicagoTime.swift \
  Forecast.swift \
  KalshiSignal.swift \
  KalshiClient.swift \
  DeskStore.swift \
  DeskView.swift \
  ChartCanvas.swift \
  HubDesk.swift
do
  [ -f "HubPrediction/$f" ] || bad "missing HubPrediction/$f"
  grep -q "$f" "$pbx" || bad "$f not in pbxproj"
done
ok "Swift sources match target"

if grep -R -n -E 'FulfillmentHeartbeat|import Heartbeat' HubPrediction --include='*.swift' >/dev/null 2>&1; then
  bad "Heartbeat reference in Swift"
else
  ok "Swift has no Heartbeat imports"
fi

if grep -n FulfillmentHeartbeat fastlane/Fastfile fastlane/Appfile push-hub-testflight.sh >/dev/null 2>&1; then
  bad "Heartbeat reference in TF/Fastlane"
else
  ok "TF script + Fastlane are Hub-only"
fi

if grep -q 'FulfillmentHeartbeat-iOS' HUB_TESTFLIGHT.md TESTFLIGHT.md README.md FASTLANE.md; then
  bad "docs still point at FulfillmentHeartbeat-iOS"
else
  ok "docs point at HubPrediction-iOS"
fi

if grep -R -n -E 'api[_-]?key|sk-|Bearer |Authorization:|secret_token' HubPrediction --include='*.swift' >/dev/null 2>&1; then
  bad "secret-like string in Swift"
else
  ok "no secrets in Swift"
fi

if grep -q 'external-api.kalshi.com' HubPrediction/KalshiClient.swift \
  && grep -q 'api.coinbase.com' HubPrediction/KalshiClient.swift; then
  ok "Kalshi + Coinbase paths"
else
  bad "missing Kalshi or Coinbase URL"
fi

if grep -q 'store.start()' HubPrediction/HubPredictionApp.swift; then
  ok "cold open starts desk"
else
  bad "cold open missing store.start"
fi

icon=HubPrediction/Assets.xcassets/AppIcon.appiconset/AppIcon.png
if [ -f "$icon" ]; then
  info=$(file "$icon")
  echo "$info" | grep -q '1024 x 1024' || bad "AppIcon not 1024x1024: $info"
  echo "$info" | grep -q 'RGB' || bad "AppIcon not RGB: $info"
  ok "AppIcon 1024 RGB"
else
  bad "missing AppIcon.png"
fi

if [ "$fail" -ne 0 ]; then
  note "verify-standalone: FAIL"
  exit 1
fi
note "verify-standalone: KEEP"
