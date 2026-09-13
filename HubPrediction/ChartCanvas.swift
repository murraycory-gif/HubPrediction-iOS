import SwiftUI

struct ChartCanvas: View {
    let live: Double
    let closeAt: Double
    let points: [Point]
    let prior: [Point]
    let lean: DeskSide
    var chartHeight: CGFloat = HubDesk.phoneChartHeight

    @State private var zoom: Double = 60
    @State private var pan: Double = 0
    @State private var ema: Double?

    var body: some View {
        let now = points.last?.t ?? Date.nowMs
        let raw = Forecast.slopeFromPoints(points, now: now)
        let slope = Forecast.emaSlope(prev: ema, raw: raw)
        let rebased = Forecast.rebasePrior(prior, live: live)
        let forecast = Forecast.forwardRay(now: now, closeAt: closeAt, live: live, slopePerMin: slope, lean: lean)
        let end = now + pan
        let start = end - zoom * HubMs.minute
        let ys = points.map(\.px) + rebased.map(\.px) + forecast.map(\.px) + [live]
        let domain = Forecast.yDomain(live: live, values: ys)

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("TREND // PATH")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.6)
                Spacer()
                HStack(spacing: 4) {
                    zoomBtn("<") { pan -= zoom * 30.0 * HubMs.second }
                    ForEach([60.0, 30.0, 15.0], id: \.self) { z in
                        zoomBtn("\(Int(z))m", on: zoom == z) {
                            zoom = z
                            pan = 0
                        }
                    }
                    zoomBtn(">") { pan += zoom * 30.0 * HubMs.second }
                }
            }
            .onAppear { ema = slope }
            .onChange(of: raw) { _, _ in ema = slope }

            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .fill(HubTheme.panel)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.16)))
                Canvas { ctx, size in
                    let left: CGFloat = 44
                    let top: CGFloat = 8
                    let w = size.width - left - 8
                    let h = size.height - 28
                    let lo = domain.0
                    let hi = domain.1
                    func pt(_ p: Point) -> CGPoint {
                        let span = max(1, end - start)
                        let range = max(1, hi - lo)
                        let x = left + CGFloat((p.t - start) / span) * w
                        let y = top + h - CGFloat((p.px - lo) / range) * h
                        return CGPoint(x: x, y: y)
                    }
                    func line(_ list: [Point], color: Color, width: CGFloat, dash: Bool) {
                        let vis = list.filter { $0.t >= start - 2.0 * HubMs.second && $0.t <= end + (dash ? 16.0 * HubMs.minute : 2.0 * HubMs.second) }
                        guard vis.count >= 2 else { return }
                        var path = Path()
                        path.move(to: pt(vis[0]))
                        for p in vis.dropFirst() { path.addLine(to: pt(p)) }
                        ctx.stroke(
                            path,
                            with: .color(color),
                            style: StrokeStyle(lineWidth: width, dash: dash ? [5, 4] : [])
                        )
                    }
                    for frac in [1.0 / 3.0, 0.5, 2.0 / 3.0] {
                        var grid = Path()
                        grid.move(to: CGPoint(x: left, y: top + h * frac))
                        grid.addLine(to: CGPoint(x: left + w, y: top + h * frac))
                        ctx.stroke(grid, with: .color(HubTheme.line), lineWidth: 1)
                    }
                    line(rebased, color: Color(red: 0.30, green: 0.36, blue: 0.33), width: 1.5, dash: false)
                    line(points, color: HubTheme.up, width: 2.2, dash: false)
                    line(forecast, color: HubTheme.up, width: 1.6, dash: true)

                    func label(_ text: String, y: CGFloat, color: Color) {
                        ctx.draw(
                            Text(text).font(.system(size: 10, design: .monospaced)).foregroundColor(color),
                            at: CGPoint(x: 4, y: y),
                            anchor: .topLeading
                        )
                    }
                    label("\(Int(hi.rounded()))", y: 4, color: HubTheme.mute)
                    label("\(Int(live.rounded()))", y: size.height / 2 - 8, color: HubTheme.up)
                    label("\(Int(lo.rounded()))", y: size.height - 24, color: HubTheme.mute)
                }
                .frame(height: chartHeight)
            }
            Text("GREEN this week · GRAY last week rebased · DASH next 15m")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
                .tracking(0.8)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func zoomBtn(_ title: String, on: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, design: .monospaced))
                .frame(minWidth: 36, minHeight: 36)
                .background(on ? HubTheme.up : HubTheme.chip)
                .foregroundStyle(on ? Color(red: 0.016, green: 0.078, blue: 0.047) : HubTheme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}
