function AsyncLocalStorage() {}
AsyncLocalStorage.prototype.getStore = function getStore() {
  return undefined
}
AsyncLocalStorage.prototype.run = function run(_store, fn) {
  return fn()
}
AsyncLocalStorage.prototype.enterWith = function enterWith() {}
AsyncLocalStorage.prototype.disable = function disable() {}

module.exports = { AsyncLocalStorage }
module.exports.AsyncLocalStorage = AsyncLocalStorage
module.exports.default = module.exports
