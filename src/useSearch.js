import { useEffect, useRef, useState } from "react";

// Runs the path search in a Web Worker whenever `input` changes (debounced).
// A newer input terminates the running search, so stale results never land.
export function useSearch(input) {
  const key = input ? JSON.stringify(input) : "";
  const [state, setState] = useState({ key: "", status: "idle", result: null, error: null });
  const worker = useRef(null);

  useEffect(() => {
    if (!input) {
      setState({ key, status: "idle", result: null, error: null });
      return undefined;
    }
    setState({ key, status: "searching", result: null, error: null });
    const timer = setTimeout(() => {
      const w = new Worker(new URL("./engine/search.worker.js", import.meta.url), { type: "module" });
      worker.current = w;
      w.onmessage = (e) => {
        const { type, result, message } = e.data;
        if (type === "progress") setState({ key, status: "searching", result, error: null });
        else if (type === "done") setState({ key, status: "done", result, error: null });
        else setState({ key, status: "error", result: null, error: message });
        if (type !== "progress") w.terminate();
      };
      w.onerror = (e) => setState({ key, status: "error", result: null, error: e.message || "search failed" });
      w.postMessage({ id: 1, input });
    }, 200);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [key]); // `key` captures everything in `input`.

  return state;
}
