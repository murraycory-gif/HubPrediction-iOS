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
`
      }
    },
  }
}

export default defineConfig({
  server: {
    port: 8080,
    host: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: [
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/react-start',
      'recharts',
    ],
  },
  plugins: [stubNodeAsyncHooks(), tailwindcss(), tanstackStart(), viteReact()],
})
