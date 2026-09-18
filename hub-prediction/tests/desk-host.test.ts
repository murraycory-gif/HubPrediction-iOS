import { createServer, request as httpRequest } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  ALIAS_PORTS,
  DESK_URL,
  PUBLIC_PORT,
  VITE_PORT,
  createAliasHost,
  createDeskHost,
  listTailscaleDeskUrls,
  publicDeskUrl,
  reclaimDeskPort,
  reclaimDeskPortCommand,
  rewritePublicLocation,
  splashHtml,
} from '../desk-host.mjs'

describe('desk-host Soft FAIL refresh refused', () => {
  it('serves a self-reloading splash when Vite is down so Chrome does not refuse 8080', async () => {
    const html = splashHtml()
    expect(html).toMatch(/http-equiv="refresh"/)
    expect(html).toMatch(/HUB Predictions/)
    expect(html).toMatch(/http:\/\/127\.0\.0\.1:8080/)
    const { server, publicPort } = createDeskHost({ publicPort: 0, vitePort: 1 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : publicPort
    const res = await fetch(`http://127.0.0.1:${port}/`)
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).toMatch(/http-equiv="refresh"/)
    expect(body).toMatch(/HUB Predictions/)
    server.close()
    expect(port).toBeGreaterThan(0)
  })

  it('proxies to Vite when the inner desk is up', async () => {
    const vite = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`ok ${req.url}`)
    })
    await new Promise<void>((resolve) => vite.listen(0, '127.0.0.1', () => resolve()))
    const viteAddr = vite.address()
    const vitePort = typeof viteAddr === 'object' && viteAddr ? viteAddr.port : 0
    const { server } = createDeskHost({ vitePort })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const res = await fetch(`http://127.0.0.1:${port}/desk`)
    expect(await res.text()).toBe('ok /desk')
    server.close()
    vite.close()
  })

  it('reclaims 8080 on Windows so an old desk window cannot block the only address', () => {
    const cmd = reclaimDeskPortCommand(8080, 'win32')
    expect(cmd.bin).toBe('powershell')
    expect(cmd.args.join(' ')).toMatch(/LocalPort 8080/)
    expect(cmd.args.join(' ')).toMatch(/Stop-Process/)
    const ran: string[] = []
    reclaimDeskPort(8080, (bin, args) => {
      ran.push([bin, ...args].join(' '))
      return ''
    }, 'win32')
    expect(ran.join(' ')).toMatch(/LocalPort 8080/)
  })

  it('pins one desk address at 8080 and keeps Vite off 1808x', () => {
    expect(PUBLIC_PORT).toBe(8080)
    expect(DESK_URL).toBe('http://127.0.0.1:8080')
    expect(String(VITE_PORT)).not.toMatch(/^1808/)
    expect(ALIAS_PORTS).toEqual(
      expect.arrayContaining([18080, 18081, 18082, 18083, 18084, 18085, 18086, 18087, 18088, 18089]),
    )
  })

  it('rewrites Vite Location hops off 18080 back to 8080', () => {
    expect(rewritePublicLocation('http://127.0.0.1:18080/desk')).toBe('http://127.0.0.1:8080/desk')
    expect(rewritePublicLocation('http://localhost:18081/')).toBe('http://127.0.0.1:8080/')
    expect(rewritePublicLocation('http://127.0.0.1:18082/')).toBe('http://127.0.0.1:8080/')
    expect(rewritePublicLocation(`http://127.0.0.1:${VITE_PORT}/desk`)).toBe('http://127.0.0.1:8080/desk')
  })

  it('keeps a Tailscale / phone host instead of bouncing to 127.0.0.1', () => {
    expect(rewritePublicLocation('http://127.0.0.1:18081/desk', 8080, '100.64.1.20:8080')).toBe(
      'http://100.64.1.20:8080/desk',
    )
    expect(publicDeskUrl('/tape', 8080, '100.64.1.20:18080')).toBe('http://100.64.1.20:8080/tape')
    expect(listTailscaleDeskUrls(8080, () => '100.64.1.20\n')).toEqual(['http://100.64.1.20:8080'])
    expect(listTailscaleDeskUrls(8080, () => { throw new Error('missing') })).toEqual([])
  })

  it('keeps our tunnel host 10.77.0.1 instead of bouncing to 127.0.0.1', () => {
    expect(rewritePublicLocation('http://127.0.0.1:18081/desk', 8080, '10.77.0.1:8080')).toBe(
      'http://10.77.0.1:8080/desk',
    )
    expect(publicDeskUrl('/tape', 8080, '10.77.0.1:18080')).toBe('http://10.77.0.1:8080/tape')
  })

  it('answers 18080 with a redirect so Chrome refresh cannot refuse that tab', async () => {
    const { server, publicPort } = createAliasHost({ publicPort: 8080, aliasPort: 0 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const res = await fetch(`http://127.0.0.1:${port}/tape`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(new RegExp(`http://127\\.0\\.0\\.1:${publicPort}/tape`))
    expect(await res.text()).toMatch(/HUB Predictions/)
    server.close()
    expect(port).toBeGreaterThan(0)
  })

  it('redirects a Tailscale 18080 tab to the same host on 8080', async () => {
    const { server } = createAliasHost({ publicPort: 8080, aliasPort: 0 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const loc = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port, path: '/', headers: { host: '100.64.1.20:18080' } },
        (res) => {
          resolve(String(res.headers.location || ''))
          res.resume()
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(loc).toBe('http://100.64.1.20:8080/')
    server.close()
  })

  it('redirects our-tunnel 18080 tab to 10.77.0.1:8080', async () => {
    const { server } = createAliasHost({ publicPort: 8080, aliasPort: 0 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const loc = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port, path: '/', headers: { host: '10.77.0.1:18080' } },
        (res) => {
          resolve(String(res.headers.location || ''))
          res.resume()
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(loc).toBe('http://10.77.0.1:8080/')
    server.close()
  })

  it('redirects a 18081 refresh to 8080 — Soft FAIL CONNECTION_REFUSED', async () => {
    const { server } = createAliasHost({ publicPort: 8080, aliasPort: 0 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const loc = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port, path: '/', headers: { host: '127.0.0.1:18081' } },
        (res) => {
          resolve(String(res.headers.location || ''))
          res.resume()
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(loc).toBe('http://127.0.0.1:8080/')
    server.close()
  })

  it('redirects a 18082 refresh to 8080 — Soft FAIL CONNECTION_REFUSED', async () => {
    const { server } = createAliasHost({ publicPort: 8080, aliasPort: 0 })
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve())
      server.once('error', reject)
    })
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const loc = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        { hostname: '127.0.0.1', port, path: '/', headers: { host: '127.0.0.1:18082' } },
        (res) => {
          resolve(String(res.headers.location || ''))
          res.resume()
        },
      )
      req.on('error', reject)
      req.end()
    })
    expect(loc).toBe('http://127.0.0.1:8080/')
    server.close()
  })
})
