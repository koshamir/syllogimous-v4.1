class Stub {}
module.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : Stub) });
