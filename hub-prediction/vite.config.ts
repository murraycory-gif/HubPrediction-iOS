import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const asyncHooksStub = path.resolve(here, 'src/lib/async-hooks-stub.cjs')

function stubNodeAsyncHooks(): Plugin {
  return {
    name: 'stub-async-hooks-on-client',
    enforce: 'pre',
    resolveId(id, _importer, opts) {
      if ((id === 'node:async_hooks' || id === 'async_hooks') && !opts?.ssr) {
        return asyncHooksStub
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
    include: ['@tanstack/react-query', '@tanstack/react-router', 'recharts'],
    exclude: ['@tanstack/react-start'],
    esbuildOptions: {
      alias: {
        'node:async_hooks': asyncHooksStub,
        async_hooks: asyncHooksStub,
      },
    },
  },
  plugins: [stubNodeAsyncHooks(), tailwindcss(), tanstackStart(), viteReact()],
})
