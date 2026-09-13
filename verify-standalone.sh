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
  HubDesk.swift \
  SizeCash.swift \
  KalshiCreds.swift \
  KalshiAuth.swift \
  KalshiTrade.swift \
  TradePanel.swift \
  MarketsSheet.swift \
  CredsSheet.swift
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

grep -q 'TF HOLD' HUB_TESTFLIGHT.md QA.md README.md || bad "TF HOLD missing from docs"
ok "TF HOLD documented"

grep -q 'searchMarkets' HubPrediction/KalshiClient.swift || bad "markets search missing"
grep -q 'func place' HubPrediction/KalshiTrade.swift || bad "trade place missing"
grep -q 'confirmationDialog' HubPrediction/TradePanel.swift || bad "trade confirm missing"
grep -q 'func retry' HubPrediction/DeskStore.swift || bad "retry missing"
grep -q 'phoneStat' HubPrediction/DeskView.swift || bad "phone stacked rest-of-day missing"
ok "browse + trade path + retry + phone cards"

if grep -R -n -E 'sk-|Bearer |Authorization:|secret_token' HubPrediction --include='*.swift' >/dev/null 2>&1; then
  bad "secret-like string in Swift"
else
  ok "no secrets in Swift"
fi
if find HubPrediction -name '*.pem' -o -name '*.p8' | grep -q .; then
  bad "PEM file in tree"
else
  ok "no PEM files in tree"
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

# Mac first-paint: signal chrome pinned; tables only inside a ScrollView
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/DeskView.swift").read_text()
for n in (
    "DESK // SIGNAL ·",
    "private var signalDesk",
    "private var wideDesk",
):
    if n not in src:
        print("FAIL:", n)
        sys.exit(2)
wide = src.split("private var wideDesk", 1)[1].split("private var signalDesk", 1)[0]
if "ScrollView" not in wide:
    print("FAIL: wideDesk has no ScrollView")
    sys.exit(2)
before, after = wide.split("ScrollView", 1)
if "restOfDay" in before:
    print("FAIL: restOfDay appears before ScrollView in wideDesk")
    sys.exit(2)
if "restOfDay" not in after:
    print("FAIL: restOfDay not inside ScrollView")
    sys.exit(2)
if "signalDesk" not in before:
    print("FAIL: signal desk not pinned above ScrollView")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "Mac first-paint pins signal desk above tables"
else
  bad "Mac first-paint layout"
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
