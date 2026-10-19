/* Runs the exact optimizer off the main UI thread. */
importScripts("solver.js");

self.addEventListener("message", function (event) {
  const payload = event.data || {};
  const requestId = payload.requestId;
  try {
    const exact = self.DeliveryOptimizer.solveExact(payload.input || {});
    const greedy = self.DeliveryOptimizer.solveGreedy(payload.input || {});
    self.postMessage({ requestId, exact, greedy });
  } catch (error) {
    self.postMessage({ requestId, error: error && error.message ? error.message : String(error) });
  }
});
