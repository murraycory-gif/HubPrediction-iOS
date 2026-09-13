import SwiftUI

struct VarianceChart: View {
    let rows: [DashRow]
    var chartHeight: CGFloat = HubDesk.phoneVarianceHeight

    var body: some View {
        let pts = rows.compactMap { r -> Point? in
            guard let v = r.variance, v.isFinite else { return nil }
            return Point(t: r.t, px: v)
        }
        let nowRow = rows.first(where: { $0.isNow })
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("VARIANCE // THEORY vs ACTUAL")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                    .tracking(1.6)
                Spacer()
                Text(pts.isEmpty ? "warming" : "now \(Money.signed(nowRow?.variance ?? pts.last?.px))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
            }
            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .fill(HubTheme.panel)
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(HubTheme.up.opacity(0.16)))
                Canvas { ctx, size in
                    let left: CGFloat = 44
                    let top: CGFloat = 8
                    let w = size.width - left - 8
                    let h = size.height - 28
                    let values = pts.map(\.px) + [0]
                    let hi = max(8, values.map { abs($0) }.max() ?? 8)
                    let lo = -hi
                    let start = pts.first?.t ?? 0
                    let end = max(start + HubMs.hour, pts.last?.t ?? start + HubMs.hour)
                    func pt(_ p: Point) -> CGPoint {
                        let span = max(1, end - start)
                        let range = max(1, hi - lo)
                        let x = left + CGFloat((p.t - start) / span) * w
                        let y = top + h - CGFloat((p.px - lo) / range) * h
                        return CGPoint(x: x, y: y)
                    }
                    var zero = Path()
                    let zy = pt(Point(t: start, px: 0)).y
                    zero.move(to: CGPoint(x: left, y: zy))
                    zero.addLine(to: CGPoint(x: left + w, y: zy))
                    ctx.stroke(zero, with: .color(HubTheme.ink.opacity(0.28)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))

                    if pts.count >= 2 {
                        var path = Path()
                        path.move(to: pt(pts[0]))
                        for p in pts.dropFirst() { path.addLine(to: pt(p)) }
                        ctx.stroke(path, with: .color(HubTheme.ink), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
                    }
                    for p in pts {
                        let c = pt(p)
                        ctx.fill(
                            Path(ellipseIn: CGRect(x: c.x - 2.5, y: c.y - 2.5, width: 5, height: 5)),
                            with: .color(p.px >= 0 ? HubTheme.up : HubTheme.down)
                        )
                    }

                    func label(_ text: String, y: CGFloat) {
                        ctx.draw(
                            Text(text).font(.system(size: 10, design: .monospaced)).foregroundColor(HubTheme.mute),
                            at: CGPoint(x: 4, y: y),
                            anchor: .topLeading
                        )
                    }
                    label(Money.signed(hi), y: 4)
                    label("0", y: size.height / 2 - 8)
                    label(Money.signed(lo), y: size.height - 24)
                }
                .frame(height: chartHeight)
                if pts.isEmpty {
                    Text("Waiting on elapsed actual vs theory")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(HubTheme.mute)
                }
            }
            Text("Difference path · actual − theory · same day window as TREND")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(HubTheme.mute)
                .tracking(0.8)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}
