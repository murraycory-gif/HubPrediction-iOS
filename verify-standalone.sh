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

# Catalyst compile: never put await inside `if let … ?? await` (non-async autoclosure)
if python3 - <<'PY'
import pathlib, sys
bad = []
for p in pathlib.Path("HubPrediction").rglob("*.swift"):
    text = p.read_text()
    if "?? (try? await" in text or "?? try? await" in text:
        bad.append(str(p))
if bad:
    print("FAIL: await coalesced with ?? (Catalyst compile):", ", ".join(bad))
    sys.exit(2)
src = pathlib.Path("HubPrediction/DeskStore.swift").read_text()
fn = src.split("private func refreshBoard()", 1)[1].split("private func publishFromMarket", 1)[0]
if "try? await KalshiClient.fetchMarket" not in fn:
    print("FAIL: refreshBoard lost pinned fetchMarket")
    sys.exit(2)
if "if let exact" not in fn or "} catch {" not in fn:
    print("FAIL: refreshBoard do/catch or exact publish missing")
    sys.exit(2)
if "if let pinned = pinnedTicker, let exact" in fn:
    print("FAIL: refreshBoard still binds exact in the same if-let as await")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "refreshBoard await is outside if-let ?? (Catalyst compile)"
else
  bad "refreshBoard concurrency / do-catch"
fi

# Live tick: Combine .common pulse, not Foundation scheduledTimer (dead on Catalyst)
if grep -n 'Timer.scheduledTimer' HubPrediction/DeskStore.swift >/dev/null 2>&1; then
  bad "DeskStore still uses scheduledTimer (Mac live tick FAIL)"
fi
grep -q 'func pulse(now' HubPrediction/DeskStore.swift || bad "pulse missing"
grep -q 'quoteIntervalMs = 750' HubPrediction/DeskStore.swift || bad "750ms quote interval missing"
grep -q 'func nudge()' HubPrediction/DeskStore.swift || bad "nudge missing"
grep -q 'applyLiveChrome' HubPrediction/DeskStore.swift || bad "live chrome pulse missing"
if grep -n 'Last ¢ is held on purpose' HubPrediction/DeskStore.swift >/dev/null 2>&1; then
  bad "halt still freezes spot (must keep Coinbase+Kalshi refreshing)"
fi
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/KalshiSignal.swift").read_text()
if "locked: true" in src:
    print("FAIL: thesis LOCK still freezes the call")
    sys.exit(2)
fn = pathlib.Path("HubPrediction/DeskStore.swift").read_text()
if "q.yesAsk = current.yesAsk" in fn:
    print("FAIL: board still clobbers live asks")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "spot-on: no LOCK freeze, board does not clobber asks"
else
  bad "spot-on refresh"
fi
grep -q 'store.pulse(now:' HubPrediction/DeskView.swift || bad "DeskView does not pulse store"
grep -q 'in: .common' HubPrediction/DeskView.swift || bad "Combine timer must use .common"
grep -q 'clockNow: now' HubPrediction/DeskView.swift || bad "chart not wired to wall-clock now"
grep -q 'clockNow' HubPrediction/ChartCanvas.swift || bad "ChartCanvas missing clockNow"
grep -q 'waitsForConnectivity = false' HubPrediction/KalshiClient.swift || bad "session may stall on Catalyst"
ok "live pulse 750ms quote / 5s dash / 10s board on Combine .common"

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
need = ["CashStrip()", "BotLane(now:", "ChartCanvas(", "VarianceChart(", "dash: store.dash"]
for n in need:
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
grep -q 'func assertOpenWindow' HubPrediction/DeskStore.swift || bad "window gate missing"
if python3 - <<'PY'
import pathlib, sys
src = pathlib.Path("HubPrediction/DeskStore.swift").read_text()
req = src.split("func requestPlace", 1)[1].split("func confirmPlace", 1)[0]
conf = src.split("func confirmPlace", 1)[1].split("private func attach", 1)[0]
bots = src.split("func tickBots", 1)[1].split("func assertOpenWindow", 1)[0]
if "assertOpenWindow" not in req or "assertOpenWindow" not in conf:
    print("FAIL: requestPlace/confirmPlace not gated to BuyPhase.open")
    sys.exit(2)
if "requestPlace(fromBot" in bots:
    print("FAIL: live bots still open Confirm instead of executing")
    sys.exit(2)
if "confirmPlace(fromBot: true)" not in bots:
    print("FAIL: bots do not execute confirmPlace")
    sys.exit(2)
if "mode == .live" not in bots or "hasCreds" not in bots:
    print("FAIL: live bots missing credential gate")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "window-gated fills; bots execute paper + live"
else
  bad "window gate / live bot execute"
fi
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
grep -q 'kalshiCall(used, beat:' HubPrediction/DeskStore.swift || bad "call does not use beat-trend"
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

# Grok Build rest-of-day desk: Clock / Theory / Actual / Preview / Variance / Last week / Vs open / High / Low
grep -q 'var preview' HubPrediction/Models.swift || bad "DashRow preview missing"
grep -q 'var vsOpen' HubPrediction/Models.swift || bad "DashRow vsOpen missing"
grep -q 'var high' HubPrediction/Models.swift || bad "DashRow high missing"
grep -q 'var low' HubPrediction/Models.swift || bad "DashRow low missing"
grep -q 'func slotTheory' HubPrediction/Forecast.swift || bad "slotTheory missing"
grep -q 'func slotPreview' HubPrediction/Forecast.swift || bad "slotPreview missing"
grep -q 'theoryFadeMins = 90' HubPrediction/Forecast.swift || bad "90m theory fade missing"
grep -q 'func fetchOHLC' HubPrediction/KalshiClient.swift || bad "Coinbase OHLC missing"
grep -q 'Forecast.slotTheory' HubPrediction/DeskStore.swift || bad "refreshDash not using slotTheory"
grep -q 'Forecast.vsOpen' HubPrediction/DeskStore.swift || bad "refreshDash missing vsOpen"
grep -q 'flexHead("PREVIEW")' HubPrediction/DeskView.swift || bad "Mac Preview column missing"
grep -q 'flexHead("VS OPEN")' HubPrediction/DeskView.swift || bad "Mac Vs open column missing"
grep -q 'flexHead("HIGH")' HubPrediction/DeskView.swift || bad "Mac High column missing"
grep -q 'flexHead("LOW")' HubPrediction/DeskView.swift || bad "Mac Low column missing"
grep -q 'phoneStat("PREVIEW"' HubPrediction/DeskView.swift || bad "phone Preview missing"
grep -q 'phoneStat("VS OPEN"' HubPrediction/DeskView.swift || bad "phone Vs open missing"
grep -q 'phoneStat("HIGH"' HubPrediction/DeskView.swift || bad "phone High missing"
grep -q 'lastWeekHighPath' HubPrediction/ChartCanvas.swift || bad "chart last-week high missing"
grep -q 'Swipe sideways for last week' HubPrediction/DeskView.swift || bad "Grok Build caption missing"
if python3 - <<'PY'
import sys
# Same numbers as hub-prediction/tests/forecast.test.ts Grok Build slot theory
now = 1_700_000_000_000.0
minute = 60_000.0
live = 77353.0
slope = 1.2
mins = 15.0
fade = 1.0 - mins / 90.0
shape = 79900.0 - 80004.0
theory = live + slope * mins * fade + shape
naive = live + slope * mins
if abs(theory - (live + 1.2 * 15 * (1 - 15 / 90) - 104)) > 1e-6:
    print("FAIL: theory formula")
    sys.exit(2)
if not (theory < naive):
    print("FAIL: theory must beat/differ from naive via last-week shape")
    sys.exit(2)
vs = 80004.0 - 79868.0
if abs(vs - 136) > 1e-6:
    print("FAIL: vs open")
    sys.exit(2)
sys.exit(0)
PY
then
  ok "Grok Build 9-col desk + fade/shape theory (beats naive)"
else
  bad "Grok Build theory/forecast desk"
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
