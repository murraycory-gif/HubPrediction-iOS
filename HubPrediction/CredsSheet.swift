import SwiftUI

struct CredsSheet: View {
    @EnvironmentObject private var store: DeskStore
    @Environment(\.dismiss) private var dismiss
    @State private var keyId = ""
    @State private var pem = ""

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Runtime only. Key ID + PEM stay on this device (Keychain). Never commit them.")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(HubTheme.mute)
                TextField("API Key ID", text: $keyId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 14, design: .monospaced))
                    .padding(10)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                TextEditor(text: $pem)
                    .font(.system(size: 11, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 140)
                    .padding(8)
                    .background(HubTheme.chip)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(alignment: .topLeading) {
                        if pem.isEmpty {
                            Text("-----BEGIN PRIVATE KEY-----")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(HubTheme.mute)
                                .padding(16)
                                .allowsHitTesting(false)
                        }
                    }
                HStack {
                    Button("Save + load cash") {
                        KalshiCreds.save(keyId: keyId, pem: pem)
                        store.credsDidChange()
                        dismiss()
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 14)
                    .frame(height: 40)
                    .background(HubTheme.up)
                    .foregroundStyle(Color(red: 0.016, green: 0.078, blue: 0.047))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    Button("Clear keys") {
                        KalshiCreds.clear()
                        keyId = ""
                        pem = ""
                        store.credsDidChange()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(HubTheme.down)
                    Spacer()
                }
                Spacer()
            }
            .padding(16)
            .background(HubTheme.surface)
            .navigationTitle("Kalshi keys")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .onAppear {
                if let c = KalshiCreds.load() {
                    keyId = c.keyId
                    pem = c.pem
                }
            }
        }
    }
}
