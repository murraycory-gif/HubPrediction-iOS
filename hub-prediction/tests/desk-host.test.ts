import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createDeskHost, splashHtml } from '../desk-host.mjs'

describe('desk-host Soft FAIL refresh refused', () => {
  it('serves a self-reloading splash when Vite is down so Chrome does not refuse 8080', async () => {
    const html = splashHtml()
    expect(html).toMatch(/http-equiv="refresh"/)
    expect(html).toMatch(/HUB Predictions/)
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
})
