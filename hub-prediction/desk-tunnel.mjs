import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TUNNEL_NET = '10.77.0.0/24'
export const TUNNEL_DESK_IP = '10.77.0.1'
export const TUNNEL_LISTEN = 51820
export const TUNNEL_CLIENTS = [
  { id: 'phone', address: '10.77.0.2/32' },
  { id: 'ipad', address: '10.77.0.3/32' },
  { id: 'other-pc', address: '10.77.0.4/32' },
]

export function deskTunnelUrl(publicPort = 8080) {
  return `http://${TUNNEL_DESK_IP}:${publicPort}`
}

export function tunnelSecretsDir(base) {
  if (base) return resolve(base)
  const hub = dirname(fileURLToPath(import.meta.url))
  return resolve(hub, '..', '.secrets', 'wireguard')
}

export function makeWgKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('x25519')
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' })
  const pub = publicKey.export({ format: 'der', type: 'spki' })
  return {
    privateKey: Buffer.from(priv.subarray(-32)).toString('base64'),
    publicKey: Buffer.from(pub.subarray(-32)).toString('base64'),
  }
}

export function loadOrCreateKeys(dir) {
  const keyFile = resolve(dir, 'keys.json')
  if (existsSync(keyFile)) {
    const raw = JSON.parse(readFileSync(keyFile, 'utf8'))
    if (raw?.server?.privateKey && raw?.clients?.phone?.privateKey) return raw
  }
  const server = makeWgKeyPair()
  const clients = Object.fromEntries(TUNNEL_CLIENTS.map((c) => [c.id, makeWgKeyPair()]))
  const next = { server, clients }
  mkdirSync(dir, { recursive: true })
  writeFileSync(keyFile, JSON.stringify(next, null, 2))
  return next
}

export function readTunnelEndpoint(dir) {
  const env = String(process.env.DESK_TUNNEL_ENDPOINT ?? '').trim()
  if (env) return env.replace(/^https?:\/\//, '').replace(/:\d+$/, '')
  const file = resolve(dir, 'endpoint.txt')
  if (!existsSync(file)) return ''
  return String(readFileSync(file, 'utf8')).trim().split(/\s+/)[0].replace(/^https?:\/\//, '').replace(/:\d+$/, '')
}

export function serverConf(keys, clients = TUNNEL_CLIENTS) {
  const peers = clients
    .map((c) => {
      const pub = keys.clients[c.id]?.publicKey
      if (!pub) return ''
      return `[Peer]\nPublicKey = ${pub}\nAllowedIPs = ${c.address}\n`
    })
    .filter(Boolean)
    .join('\n')
  return `[Interface]
PrivateKey = ${keys.server.privateKey}
Address = ${TUNNEL_DESK_IP}/24
ListenPort = ${TUNNEL_LISTEN}

${peers}`
}

export function clientConf(keys, client, endpoint) {
  const pair = keys.clients[client.id]
  const host = endpoint || 'YOUR.HOME.PUBLIC.IP'
  return `[Interface]
PrivateKey = ${pair.privateKey}
Address = ${client.address}

[Peer]
PublicKey = ${keys.server.publicKey}
Endpoint = ${host}:${TUNNEL_LISTEN}
AllowedIPs = ${TUNNEL_NET}
PersistentKeepalive = 25
`
}

export function writeTunnelConfigs(opts = {}) {
  const dir = tunnelSecretsDir(opts.dir)
  mkdirSync(dir, { recursive: true })
  const keys = loadOrCreateKeys(dir)
  const endpoint = opts.endpoint ?? readTunnelEndpoint(dir)
  if (endpoint) writeFileSync(resolve(dir, 'endpoint.txt'), `${endpoint}\n`)
  writeFileSync(resolve(dir, 'hub-desk-server.conf'), serverConf(keys))
  const files = { server: resolve(dir, 'hub-desk-server.conf') }
  for (const client of TUNNEL_CLIENTS) {
    const name = `hub-desk-${client.id}.conf`
    writeFileSync(resolve(dir, name), clientConf(keys, client, endpoint))
    files[client.id] = resolve(dir, name)
  }
  writeFileSync(
    resolve(dir, 'README.txt'),
    `HUB Predictions — our tunnel (no Tailscale, no account, $0)
============================================================
1. On this Windows PC install WireGuard (free, open source, no sign-in):
   https://www.wireguard.com/install/
2. In WireGuard: Import tunnel from file → hub-desk-server.conf → Activate.
3. Router: forward UDP ${TUNNEL_LISTEN} to this PC. Soft FAIL forward TCP 8080.
4. Put your home public IPv4 in endpoint.txt (one line) and run
   node desk-tunnel.mjs again so phone/iPad configs get that IP.
5. AirDrop or copy hub-desk-phone.conf / hub-desk-ipad.conf / hub-desk-other-pc.conf
   onto the device. WireGuard app → Add → Create from file. Activate.
6. On the device open ${deskTunnelUrl(opts.publicPort ?? 8080)}
   Only desk traffic uses the tunnel. Phone internet stays on cellular.

Keys stay in this folder. Soft FAIL commit. Soft FAIL email the server private key.
`,
  )
  return { dir, files, endpoint, deskUrl: deskTunnelUrl(opts.publicPort ?? 8080) }
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (startedDirectly) {
  const extra = process.argv[2]
  const out = writeTunnelConfigs(extra ? { endpoint: extra } : {})
  console.log(`[desk-tunnel] ${out.deskUrl}`)
  console.log(`[desk-tunnel] configs ${out.dir}`)
  if (!out.endpoint) console.log('[desk-tunnel] set .secrets/wireguard/endpoint.txt to your home public IPv4, then run this again')
}
