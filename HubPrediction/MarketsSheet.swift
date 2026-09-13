import SwiftUI

struct MarketsSheet: View {
    @EnvironmentObject private var store: DeskStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    TextField("Search ticker, series, title", text: $draft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(size: 14, design: .monospaced))
                        .padding(10)
                        .background(HubTheme.chip)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onSubmit { Task { await store.searchMarkets(query: draft) } }
                    Button("Go") { Task { await store.searchMarkets(query: draft) } }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12)
                        .frame(height: 40)
                        .background(HubTheme.chip)
                        .foregroundStyle(HubTheme.ink)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                Button {
                    draft = ""
                    store.resetToBTC15m()
                } label: {
                    Text("Default · KXBTC15M")
                        .font(.system(size: 12, design: .monospaced))
                }
                .buttonStyle(.plain)
                .foregroundStyle(HubTheme.up)

                if store.marketsBusy {
                    ProgressView().tint(HubTheme.up)
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(store.marketHits) { m in
                            Button {
                                store.selectMarket(m)
                                dismiss()
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(m.ticker)
                                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(HubTheme.ink)
                                    Text(m.title)
                                        .font(.system(size: 12, design: .monospaced))
                                        .foregroundStyle(HubTheme.mute)
                                        .lineLimit(2)
                                    Text("\(m.series) · UP \(Money.cents(m.yesAsk)) / DOWN \(Money.cents(m.noAsk))")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(HubTheme.mute)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(HubTheme.panel)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(16)
            .background(HubTheme.surface)
            .navigationTitle("Markets")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .onAppear {
                draft = store.marketQuery
                if store.marketHits.isEmpty {
                    Task { await store.searchMarkets(query: draft) }
                }
            }
        }
    }
}
