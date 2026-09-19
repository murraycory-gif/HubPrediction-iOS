import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TUNNEL_DESK_IP,
  TUNNEL_LISTEN,
  TUNNEL_NET,
  clientConf,
  deskTunnelUrl,
  loadOrCreateKeys,
  makeWgKeyPair,
  serverConf,
  writeTunnelConfigs,
} from '../desk-tunnel.mjs'

describe('our desk tunnel Soft FAIL Tailscale / paid relay', () => {
  it('mints WireGuard keys and a phone config that only routes the desk net', () => {
    const a = makeWgKeyPair()
    const b = makeWgKeyPair()
    expect(a.publicKey).not.toBe(b.publicKey)
    expect(Buffer.from(a.privateKey, 'base64')).toHaveLength(32)
    expect(Buffer.from(a.publicKey, 'base64')).toHaveLength(32)
    const dir = mkdtempSync(join(tmpdir(), 'hub-tunnel-'))
    const keys = loadOrCreateKeys(dir)
    const again = loadOrCreateKeys(dir)
    expect(again.server.privateKey).toBe(keys.server.privateKey)
    const server = serverConf(keys)
    expect(server).toMatch(`ListenPort = ${TUNNEL_LISTEN}`)
    expect(server).toMatch(`Address = ${TUNNEL_DESK_IP}/24`)
    expect(server).not.toMatch(/ListenPort = 8080/)
    const phone = clientConf(keys, { id: 'phone', address: '10.77.0.2/32' }, '203.0.113.9')
    expect(phone).toMatch(`Endpoint = 203.0.113.9:${TUNNEL_LISTEN}`)
    expect(phone).toMatch(`AllowedIPs = ${TUNNEL_NET}`)
    expect(phone).toMatch(/PersistentKeepalive = 25/)
    expect(deskTunnelUrl(8080)).toBe(`http://${TUNNEL_DESK_IP}:8080`)
  })

  it('writes server + phone + iPad + other-pc files and keeps the same keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-tunnel-w-'))
    writeFileSync(join(dir, 'endpoint.txt'), '198.51.100.20\n')
    const first = writeTunnelConfigs({ dir, publicPort: 8080 })
    const second = writeTunnelConfigs({ dir })
    expect(first.deskUrl).toBe('http://10.77.0.1:8080')
    expect(first.endpoint).toBe('198.51.100.20')
    expect(readFileSync(first.files.server, 'utf8')).toBe(readFileSync(second.files.server, 'utf8'))
    expect(readFileSync(first.files.phone, 'utf8')).toMatch('198.51.100.20:51820')
    expect(readFileSync(first.files.ipad, 'utf8')).toMatch('Address = 10.77.0.3/32')
    expect(readFileSync(first.files['other-pc'], 'utf8')).toMatch('Address = 10.77.0.4/32')
    expect(readFileSync(join(dir, 'README.txt'), 'utf8')).toMatch(/no Tailscale/)
    expect(readFileSync(join(dir, 'README.txt'), 'utf8')).not.toMatch(/tailscale up/i)
  })
})
