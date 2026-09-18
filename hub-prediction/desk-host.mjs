import http from 'node:http'
import net from 'node:net'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PUBLIC_PORT = Number(process.env.DESK_PUBLIC_PORT || 8080)
/** Old Vite port. Always answers so a Chrome refresh on 18080 cannot refuse. */
export const ALIAS_PORT = Number(process.env.DESK_ALIAS_PORT || 18080)
/** Inner Vite only. The browser stays on 8080. */
export const VITE_PORT = Number(process.env.DESK_VITE_PORT || 18081)
const DIR = path.dirname(fileURLToPath(import.meta.url))

export function splashHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="1">
  <title>HUB PREDICTIONS</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050607; color: #9fe7c4; font-family: Segoe UI, sans-serif; }
    p { max-width: 28rem; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <p>HUB Predictions is starting on this PC. Leave the desk window open. This page reloads itself — Chrome refresh cannot bring a stopped server back, so this host stays on port ${PUBLIC_PORT}.</p>
</body>
</html>`
}

export function hostNamePort(reqHost, publicPort = PUBLIC_PORT) {
  const raw = String(reqHost || `127.0.0.1:${publicPort}`).replace(/^https?:\/\//, '')
  const hostname = raw.replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1') || '127.0.0.1'
  if (hostname.includes(':') && !hostname.startsWith('[')) return `[${hostname}]:${publicPort}`
  return `${hostname}:${publicPort}`
}

export function publicDeskUrl(pathName = '/', publicPort = PUBLIC_PORT, reqHost) {
  const p = pathName.startsWith('/') ? pathName : `/${pathName}`
  return `http://${hostNamePort(reqHost, publicPort)}${p}`
}

/** Soft FAIL leaking Vite's inner port. Keep the phone on our tunnel / LAN host. */
export function rewritePublicLocation(loc, publicPort = PUBLIC_PORT, reqHost) {
  if (typeof loc !== 'string' || !loc) return loc
  const dest = `http://${hostNamePort(reqHost, publicPort)}`
  return loc
    .replace(/https?:\/\/127\.0\.0\.1:1808\d\b/g, dest)
    .replace(/https?:\/\/localhost:1808\d\b/g, dest)
    .replace(/https?:\/\/\[::1\]:1808\d\b/g, dest)
}

export function listTailscaleDeskUrls(publicPort = PUBLIC_PORT, run = execFileSync) {
  try {
    const ip = String(run('tailscale', ['ip', '-4'], { encoding: 'utf8' })).trim().split(/\s+/)[0]
    if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return []
    return [`http://${ip}:${publicPort}`]
  } catch {
    return []
  }
}

function viteBin() {
  return path.join(DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
}

export function forwardUpgrade(req, socket, head, port = VITE_PORT) {
  const ws = net.connect(port, '127.0.0.1', () => {
    const hdrs = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n')
    ws.write(`${req.method} ${req.url} HTTP/1.1\r\n${hdrs}\r\n\r\n`)
    if (head?.length) ws.write(head)
    ws.pipe(socket)
    socket.pipe(ws)
  })
  ws.on('error', () => socket.destroy())
  socket.on('error', () => ws.destroy())
  return ws
}

let stopping = false
let viteChild = null

function bootVite() {
  if (stopping) return null
  const child = spawn(
    viteBin(),
    ['dev', '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        DESK_PUBLIC_PORT: String(PUBLIC_PORT),
        DESK_VITE_PORT: String(VITE_PORT),
        DESK_VITE_HOST: '127.0.0.1',
      },
    },
  )
  viteChild = child
  child.on('exit', (code) => {
    if (viteChild === child) viteChild = null
    if (stopping) return
    console.log(`[desk-host] Vite exited ${code ?? ''} — restarting`)
    setTimeout(bootVite, 1200)
  })
  child.on('error', (e) => {
    console.error('[desk-host] Vite spawn failed — host stays on 8080', e)
  })
  return child
}

export function createDeskHost(opts = {}) {
  const publicPort = opts.publicPort ?? PUBLIC_PORT
  const vitePort = opts.vitePort ?? VITE_PORT
  const server = http.createServer((req, res) => {
    const incomingHost = String(req.headers.host || `127.0.0.1:${publicPort}`)
    const publicHost = /:1808\d\b/.test(incomingHost) ? hostNamePort(incomingHost, publicPort) : incomingHost
    const p = http.request(
      {
        host: '127.0.0.1',
        port: vitePort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: publicHost },
      },
      (pr) => {
        const headers = { ...pr.headers }
        if (typeof headers.location === 'string') {
          headers.location = rewritePublicLocation(headers.location, publicPort, publicHost)
        }
        res.writeHead(pr.statusCode || 502, headers)
        pr.pipe(res)
      },
    )
    p.on('error', () => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(splashHtml())
    })
    req.pipe(p)
  })
  server.on('upgrade', (req, socket, head) => {
    forwardUpgrade(req, socket, head, vitePort)
  })
  return { server, publicPort, vitePort }
}

/** Chrome refresh on the old Vite port must 302 to 8080, never CONNECTION_REFUSED. */
export function createAliasHost(opts = {}) {
  const publicPort = opts.publicPort ?? PUBLIC_PORT
  const aliasPort = opts.aliasPort ?? ALIAS_PORT
  const server = http.createServer((req, res) => {
    const dest = publicDeskUrl(req.url || '/', publicPort, req.headers.host)
    res.writeHead(302, {
      location: dest,
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    })
    res.end(
      `<!doctype html><meta http-equiv="refresh" content="0;url=${dest}"><a href="${dest}">HUB Predictions</a>`,
    )
  })
  server.on('upgrade', (_req, socket) => socket.destroy())
  return { server, publicPort, aliasPort }
}

function listenOn(server, port, host) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e)
    server.once('error', onErr)
    server.listen({ port, host, ipv6Only: false }, () => {
      server.removeListener('error', onErr)
      resolve(server)
    })
  })
}

async function bindPublic(create, port) {
  let { server } = create()
  try {
    await listenOn(server, port, '::')
    return server
  } catch {
    server.close()
    server = create().server
    await listenOn(server, port, '0.0.0.0')
    return server
  }
}

export async function startDeskHost() {
  const server = await bindPublic(() => createDeskHost(), PUBLIC_PORT)
  try {
    await bindPublic(() => createAliasHost(), ALIAS_PORT)
    console.log(`[desk-host] ${ALIAS_PORT} redirects to port ${PUBLIC_PORT} on the same host`)
  } catch (e) {
    console.error(`[desk-host] could not bind ${ALIAS_PORT} (old Vite still there?) — 8080 still up`, e)
  }
  console.log(`[desk-host] This PC: http://127.0.0.1:${PUBLIC_PORT}`)
  console.log(`[desk-host] Our tunnel (phone / iPad / other PC): http://10.77.0.1:${PUBLIC_PORT}`)
  console.log('[desk-host] Leave this window open. Browser refresh cannot refuse 8080 or 18080.')
  process.on('uncaughtException', (e) => {
    console.error('[desk-host] kept 8080 alive after error', e)
  })
  process.on('unhandledRejection', (e) => {
    console.error('[desk-host] kept 8080 alive after rejection', e)
  })
  const stop = () => {
    stopping = true
    try {
      viteChild?.kill()
    } catch {
      /* already gone */
    }
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  bootVite()
  return server
}

const startedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (startedDirectly) {
  startDeskHost().catch((e) => {
    console.error('[desk-host] failed to bind 8080', e)
    process.exit(1)
  })
}
