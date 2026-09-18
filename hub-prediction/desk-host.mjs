import http from 'node:http'
import net from 'node:net'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The only desk address. Soft FAIL changing this or printing another URL. */
export const PUBLIC_PORT = Number(process.env.DESK_PUBLIC_PORT || 8080)
export const DESK_URL = `http://127.0.0.1:${PUBLIC_PORT}`
/** Old Vite tabs. Silent 302 to 8080. Soft FAIL advertising these. */
export const ALIAS_PORT = Number(process.env.DESK_ALIAS_PORT || 18080)
export const ALIAS_PORT_B = Number(process.env.DESK_ALIAS_PORT_B || 18081)
export const ALIAS_PORTS = [
  ...new Set([
    ALIAS_PORT,
    ALIAS_PORT_B,
    18080, 18081, 18082, 18083, 18084, 18085, 18086, 18087, 18088, 18089,
  ]),
]
/** Inner Vite only — never a browser URL. Soft FAIL printing this. */
export const VITE_PORT = Number(process.env.DESK_VITE_PORT || 12783)
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
  <p>HUB Predictions is starting on this PC. Leave the desk window open. The only address is ${DESK_URL}. This page reloads itself — Chrome refresh cannot bring a stopped server back.</p>
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
export function rewritePublicLocation(loc, publicPort = PUBLIC_PORT, reqHost, vitePort = VITE_PORT) {
  if (typeof loc !== 'string' || !loc) return loc
  const dest = `http://${hostNamePort(reqHost, publicPort)}`
  const inner = Number(vitePort)
  return loc
    .replace(/https?:\/\/127\.0\.0\.1:1808\d\b/g, dest)
    .replace(/https?:\/\/localhost:1808\d\b/g, dest)
    .replace(/https?:\/\/\[::1\]:1808\d\b/g, dest)
    .replace(new RegExp(`https?:\\/\\/127\\.0\\.0\\.1:${inner}\\b`, 'g'), dest)
    .replace(new RegExp(`https?:\\/\\/localhost:${inner}\\b`, 'g'), dest)
    .replace(new RegExp(`https?:\\/\\/\\[::1\\]:${inner}\\b`, 'g'), dest)
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

function hushViteLog(stream, dest) {
  stream.on('data', (buf) => {
    const text = String(buf)
    if (/(Local|Network):\s+https?:\/\//.test(text)) return
    if (new RegExp(`:${VITE_PORT}\\b`).test(text) && /https?:\/\//.test(text)) return
    dest.write(buf)
  })
}

function bootVite() {
  if (stopping) return null
  const child = spawn(
    viteBin(),
    ['dev', '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
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
  if (child.stdout) hushViteLog(child.stdout, process.stdout)
  if (child.stderr) hushViteLog(child.stderr, process.stderr)
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

/** Soft FAIL leaving 8080 held by an old desk window. */
export function reclaimDeskPortCommand(port = PUBLIC_PORT, platform = process.platform) {
  const n = Number(port)
  if (platform === 'win32') {
    return {
      bin: 'powershell',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${n} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ],
    }
  }
  return { bin: 'sh', args: ['-c', `fuser -k ${n}/tcp >/dev/null 2>&1 || true`] }
}

export function reclaimDeskPort(port = PUBLIC_PORT, run = execFileSync, platform = process.platform) {
  const { bin, args } = reclaimDeskPortCommand(port, platform)
  try {
    run(bin, args, { stdio: 'ignore' })
  } catch {
    /* nothing listening, or no fuser */
  }
}

async function bindPublicRetry(create, port) {
  try {
    return await bindPublic(create, port)
  } catch (e) {
    if (e?.code !== 'EADDRINUSE') throw e
    console.log(`[desk-host] ${port} busy - taking it back so ${DESK_URL} stays the only address`)
    reclaimDeskPort(port)
    await new Promise((r) => setTimeout(r, 400))
    return await bindPublic(create, port)
  }
}

export async function startDeskHost() {
  const server = await bindPublicRetry(() => createDeskHost(), PUBLIC_PORT)
  for (const alias of ALIAS_PORTS) {
    try {
      await bindPublic(() => createAliasHost({ aliasPort: alias }), alias)
    } catch (e) {
      console.error(`[desk-host] could not bind ${alias} — 8080 still up`, e)
    }
  }
  console.log(`[desk-host] Desk: ${DESK_URL}`)
  console.log(`[desk-host] Our tunnel (phone / iPad / other PC): http://10.77.0.1:${PUBLIC_PORT}`)
  console.log('[desk-host] Leave this window open. One address. Refresh stays on 8080.')
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
    console.error(`[desk-host] could not take ${DESK_URL}. Close the other desk window, then run update-desk.bat again.`)
    if (e?.code !== 'EADDRINUSE') console.error(e)
    process.exit(1)
  })
}
