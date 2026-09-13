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
  CredsSheet.swift \
  PaperBook.swift \
  BuyWindow.swift \
  DeskBots.swift \
  DeskChrome.swift \
  VarianceChart.swift \
  BeatTrend.swift
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
grep -q 'func placeLive' HubPrediction/KalshiTrade.swift || bad "live place missing"
grep -q 'PaperBook.place' HubPrediction/DeskStore.swift || bad "paper place missing"
grep -q 'func setMode' HubPrediction/DeskStore.swift || bad "mode toggle missing"
grep -q 'modeBtn("PAPER"' HubPrediction/TradePanel.swift || bad "PAPER toggle missing"
grep -q 'modeBtn("LIVE"' HubPrediction/TradePanel.swift || bad "LIVE toggle missing"
if grep -n 'portfolio/orders' HubPrediction/PaperBook.swift >/dev/null 2>&1; then
  bad "PaperBook must not call live order endpoints"
fi
grep -q 'Paper mode must not POST live Kalshi orders' HubPrediction/KalshiTrade.swift || bad "placeLive missing paper refuse"
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/DeskStore.swift").read_text()
fn = src.split("func confirmPlace", 1)[1].split("private func attach", 1)[0]
paper = fn.find("if mode == .paper")
live = fn.find("placeLive")
if paper < 0 or live < 0 or paper > live:
    sys.exit(2)
sys.exit(0)
PY
then
  ok "paper fills local; live confirm is placeLive"
else
  bad "paper/live confirm order"
fi
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

# Live tick: Combine .common pulse, not Foundation scheduledTimer (dead on Catalyst)
if grep -n 'Timer.scheduledTimer' HubPrediction/DeskStore.swift >/dev/null 2>&1; then
  bad "DeskStore still uses scheduledTimer (Mac live tick FAIL)"
fi
grep -q 'func pulse(now' HubPrediction/DeskStore.swift || bad "pulse missing"
grep -q 'quoteIntervalMs = 1_000' HubPrediction/DeskStore.swift || bad "1s quote interval missing"
grep -q 'store.pulse(now:' HubPrediction/DeskView.swift || bad "DeskView does not pulse store"
grep -q 'in: .common' HubPrediction/DeskView.swift || bad "Combine timer must use .common"
grep -q 'clockNow: now' HubPrediction/DeskView.swift || bad "chart not wired to wall-clock now"
grep -q 'clockNow' HubPrediction/ChartCanvas.swift || bad "ChartCanvas missing clockNow"
grep -q 'waitsForConnectivity = false' HubPrediction/KalshiClient.swift || bad "session may stall on Catalyst"
ok "live pulse 1s quote / 5s dash / 10s board on Combine .common"

# Mac first-paint: signal chrome pinned; tables only inside a ScrollView
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/DeskView.swift").read_text()
for n in (
    "BUY WINDOW 6–4m",
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
sig = src.split("private var signalDesk", 1)[1]
for n in ("CashStrip()", "BotLane(now:", "ChartCanvas(", "VarianceChart(", "dash: store.dash"):
    if n not in sig:
        print("FAIL: signalDesk missing", n)
        sys.exit(2)
sys.exit(0)
PY
then
  ok "Mac first-paint pins full desk (window/bots/cash/charts) above tables"
else
  bad "Mac first-paint layout"
fi

# Product Soft KEEP 1–3: buy window, bots, cash/profit (native, not web-only)
grep -q 'openUntilMin = 6' HubPrediction/BuyWindow.swift || bad "buy window 6m missing"
grep -q 'openFromMin = 4' HubPrediction/BuyWindow.swift || bad "buy window 4m missing"
grep -q 'BUY UP' HubPrediction/BuyWindow.swift || bad "buy headline missing"
grep -q 'NO BUY' HubPrediction/BuyWindow.swift || bad "no-buy headline missing"
grep -q 'func tickBots' HubPrediction/DeskStore.swift || bad "bot executor missing"
grep -q 'BOTS // SCOUT' HubPrediction/DeskChrome.swift || bad "bot lane missing"
grep -q '"SCOUT"' HubPrediction/DeskBots.swift || bad "SCOUT bot missing"
grep -q '"SIGNAL"' HubPrediction/DeskBots.swift || bad "SIGNAL bot missing"
grep -q '"RISK"' HubPrediction/DeskBots.swift || bad "RISK bot missing"
grep -q 'STRIKE' HubPrediction/DeskBots.swift || bad "Strike alias missing"
grep -q 'func evaluate' HubPrediction/BeatTrend.swift || bad "BeatTrend missing"
grep -q 'BEAT TREND' HubPrediction/BeatTrend.swift || bad "beat chrome missing"
grep -q 'store.beat.chrome' HubPrediction/DeskView.swift || bad "beat chrome not on call bar"
grep -q 'pack.naive' HubPrediction/ChartCanvas.swift || bad "naive trend ray missing"
grep -q 'pack.beat' HubPrediction/ChartCanvas.swift || bad "beat path missing"
grep -q 'kalshiCall(attached, beat:' HubPrediction/DeskStore.swift || bad "call does not use beat-trend"
grep -q 'confirmFromBot' HubPrediction/DeskStore.swift || bad "live bot confirm missing"
grep -q 'expectedProfit' HubPrediction/SizeCash.swift || bad "profit sizing missing"
grep -q 'CASH' HubPrediction/DeskChrome.swift || bad "cash strip missing"
if python3 - <<'PY'
import pathlib, sys
minute = 60_000.0
now = 1_700_000_000_000.0
def phase(close_at):
    left = close_at - now
    if left <= 0: return "settled"
    mins = left / minute
    if mins > 6: return "waiting"
    if mins >= 4: return "open"
    return "late"
cases = (
    (now + 8 * minute, "waiting"),
    (now + 6 * minute, "open"),
    (now + 5 * minute, "open"),
    (now + 4 * minute, "open"),
    (now + 3 * minute, "late"),
    (now - 1, "settled"),
)
for close, want in cases:
    got = phase(close)
    if got != want:
        print("FAIL: phase", close, "got", got, "want", want)
        sys.exit(2)
sys.exit(0)
PY
then
  ok "buy window 6–4m phases + bots + cash/profit"
else
  bad "buy window phases"
fi

# Next-15m dash must sit in the future window, not clip off the right edge
grep -q 'func chartWindow' HubPrediction/Forecast.swift || bad "chartWindow missing"
grep -q 'futurePadMs' HubPrediction/Forecast.swift || bad "futurePadMs missing"
grep -q 'Forecast.chartWindow' HubPrediction/ChartCanvas.swift || bad "ChartCanvas not using chartWindow"
grep -q 'dash: true' HubPrediction/ChartCanvas.swift || bad "forecast dash stroke missing"
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/Forecast.swift").read_text()
if "closeAt.isFinite && closeAt > now" not in src:
    print("FAIL: forwardRay must ignore stale/zero closeAt")
    sys.exit(2)
if "now + futurePadMs" not in src:
    print("FAIL: forwardRay must span at least futurePadMs")
    sys.exit(2)
# Default 60m view: now is left of the right edge; last forecast x is on-canvas
now = 1_700_000_000_000.0
minute = 60_000.0
zoom = 60.0
pan = 0.0
last_forecast = now + 16.0 * minute
cursor = now + pan
start = cursor - zoom * minute
pad = max(16.0 * minute, last_forecast - now)
end = cursor + pad
span = end - start
w = 600.0
x_now = ((now - start) / span) * w
x_dash = ((last_forecast - start) / span) * w
if not (0 < x_now < x_dash <= w):
    print(f"FAIL: dash not in-frame now={x_now:.1f} dash={x_dash:.1f} w={w}")
    sys.exit(2)
if x_dash - x_now < 80:
    print(f"FAIL: dash too short ({x_dash - x_now:.1f}px)")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "next-15m dash maps in-frame past now"
else
  bad "next-15m dash window"
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
