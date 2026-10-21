/* Run the exhaustive scheduling search away from the interface thread. */
importScripts("solver.js");

self.addEventListener("message", function (event) {
  const payload = event.data || {};
  const requestId = payload.requestId;
  try {
    const result = self.ProductionScheduler.solve(payload.input || {});
    self.postMessage({ requestId, result });
  } catch (error) {
    self.postMessage({ requestId, error: error && error.message ? error.message : String(error) });
  }
});
