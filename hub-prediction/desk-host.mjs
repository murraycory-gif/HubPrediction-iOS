import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PUBLIC_PORT = Number(process.env.DESK_PUBLIC_PORT || 8080)
export const VITE_PORT = Number(process.env.DESK_VITE_PORT || 18080)
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

function bootVite() {
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
  child.on('exit', (code) => {
    console.log(`[desk-host] Vite exited ${code ?? ''} — restarting`)
    setTimeout(bootVite, 1200)
  })
  return child
}

export function createDeskHost(opts = {}) {
  const publicPort = opts.publicPort ?? PUBLIC_PORT
  const vitePort = opts.vitePort ?? VITE_PORT
  const server = http.createServer((req, res) => {
    const p = http.request(
      {
        host: '127.0.0.1',
        port: vitePort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${vitePort}` },
      },
      (pr) => {
        res.writeHead(pr.statusCode || 502, pr.headers)
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

function listenOn(server, host) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e)
    server.once('error', onErr)
    server.listen({ port: PUBLIC_PORT, host, ipv6Only: false }, () => {
      server.removeListener('error', onErr)
      resolve(server)
    })
  })
}

export async function startDeskHost() {
  let { server } = createDeskHost()
  try {
    await listenOn(server, '::')
  } catch {
    server.close()
    server = createDeskHost().server
    await listenOn(server, '0.0.0.0')
  }
  console.log(`[desk-host] http://127.0.0.1:${PUBLIC_PORT}  and  http://localhost:${PUBLIC_PORT}`)
  console.log('[desk-host] Leave this window open. Refresh is safe — this host stays up.')
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
