import Foundation

enum ChicagoTime {
    static let tz = TimeZone(identifier: "America/Chicago") ?? .current

    private static func parts(_ ms: Double) -> DateComponents {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        return cal.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .weekday],
            from: Date(timeIntervalSince1970: ms / 1000.0)
        )
    }

    static func chicagoOffsetMs(_ ms: Double) -> Double {
        let p = parts(ms)
        let asUtc = Date.utcMs(y: p.year ?? 0, m: p.month ?? 1, d: p.day ?? 1, h: p.hour ?? 0, min: p.minute ?? 0, s: p.second ?? 0)
        return asUtc - ms
    }

    static func dayKey(_ ms: Double) -> String {
        let p = parts(ms)
        return String(format: "%04d-%02d-%02d", p.year ?? 0, p.month ?? 0, p.day ?? 0)
    }

    static func weekdayName(_ ms: Double) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.dateFormat = "EEE"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000.0))
    }

    static func formatClock(_ ms: Double) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.dateFormat = "h:mm a"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000.0))
    }

    static func formatDayLabel(_ ms: Double) -> String {
        let f = DateFormatter()
        f.timeZone = tz
        f.dateFormat = "EEE MMM d"
        return f.string(from: Date(timeIntervalSince1970: ms / 1000.0))
    }

    static func startOfChicagoDay(_ ms: Double) -> Double {
        let p = parts(ms)
        let guess = Date.utcMs(y: p.year ?? 0, m: p.month ?? 1, d: p.day ?? 1, h: 6, min: 0, s: 0)
        let off = chicagoOffsetMs(guess)
        return Date.utcMs(y: p.year ?? 0, m: p.month ?? 1, d: p.day ?? 1, h: 0, min: 0, s: 0) - off
    }

    static func align15(_ ms: Double) -> Double {
        let p = parts(ms)
        let minute = ((p.minute ?? 0) / 15) * 15
        let guess = Date.utcMs(y: p.year ?? 0, m: p.month ?? 1, d: p.day ?? 1, h: p.hour ?? 0, min: minute, s: 0)
        let off = chicagoOffsetMs(guess)
        return Date.utcMs(y: p.year ?? 0, m: p.month ?? 1, d: p.day ?? 1, h: p.hour ?? 0, min: minute, s: 0) - off
    }

    static func addChicagoDays(_ ms: Double, days: Int) -> Double {
        startOfChicagoDay(ms + Double(days) * HubMs.day + 12.0 * HubMs.hour)
    }

    static func slotsForDay(_ dayMs: Double) -> [Double] {
        let start = startOfChicagoDay(dayMs)
        return (0..<96).map { start + Double($0) * 15.0 * HubMs.minute }
    }

    static func upcomingDays(now: Double = Date.nowMs, count: Int = 7) -> [(t: Double, key: String, label: String)] {
        let today = startOfChicagoDay(now)
        return (0..<count).map { i in
            let t = addChicagoDays(today, days: i)
            return (t, dayKey(t), formatDayLabel(t))
        }
    }
}

extension Date {
    static var nowMs: Double { Date().timeIntervalSince1970 * 1000.0 }

    static func utcMs(y: Int, m: Int, d: Int, h: Int, min: Int, s: Int) -> Double {
        var c = DateComponents()
        c.year = y
        c.month = m
        c.day = d
        c.hour = h
        c.minute = min
        c.second = s
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return (cal.date(from: c) ?? Date()).timeIntervalSince1970 * 1000.0
    }
}
