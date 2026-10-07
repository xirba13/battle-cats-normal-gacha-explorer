// Runs the path search off the main thread so the page never freezes, even on
// slow phones. The page terminates this worker when the inputs change.
import { findPaths } from "./search.js";

self.onmessage = (e) => {
  const { id, input, options } = e.data;
  try {
    const result = findPaths(input, {
      ...options,
      onUpdate: (partial) => self.postMessage({ id, type: "progress", result: partial }),
    });
    self.postMessage({ id, type: "done", result });
  } catch (err) {
    self.postMessage({ id, type: "error", message: String(err?.message || err) });
  }
};
