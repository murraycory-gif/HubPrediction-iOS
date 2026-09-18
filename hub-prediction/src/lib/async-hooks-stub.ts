export class AsyncLocalStorage<T = unknown> {
  getStore(): T | undefined {
    return undefined
  }
  run(_store: T, fn: () => unknown) {
    return fn()
  }
  enterWith(_store?: T) {}
  disable() {}
}

const api = { AsyncLocalStorage }
export default api
