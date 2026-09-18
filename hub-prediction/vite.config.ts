import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function stubNodeAsyncHooks(): Plugin {
  return {
    name: 'stub-async-hooks-on-client',
    enforce: 'pre',
    resolveId(id, _importer, opts) {
      if ((id === 'node:async_hooks' || id === 'async_hooks') && !opts?.ssr) {
        return '\0async-hooks-stub'
      }
    },
    load(id) {
      if (id === '\0async-hooks-stub') {
        return `export class AsyncLocalStorage {
  getStore() { return undefined }
  run(_s, f) { return f() }
  enterWith() {}
  disable() {}
}
export default { AsyncLocalStorage };
`
      }
    },
  }
}

const publicPort = Number(process.env.DESK_PUBLIC_PORT || 8080)
const vitePort = Number(process.env.DESK_VITE_PORT || publicPort)

export default defineConfig({
  server: {
    port: vitePort,
    strictPort: true,
    host: process.env.DESK_VITE_HOST || true,
    allowedHosts: true,
    hmr: {
      protocol: 'ws',
      clientPort: publicPort,
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-query',
      '@tanstack/react-router',
      'recharts',
    ],
    exclude: ['@tanstack/react-start'],
  },
  plugins: [stubNodeAsyncHooks(), tailwindcss(), tanstackStart(), viteReact()],
})
