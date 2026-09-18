/** Browser + vitest storage. Soft FAIL SSR `typeof localStorage` shims that never write. */
export function deskStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage
    }
  } catch {
    /* private mode */
  }
  return null
}
