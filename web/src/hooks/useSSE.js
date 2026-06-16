import { useEffect, useRef } from "react";

/**
 * useSSE — subscribe to SSE events and refetch on mutation, with 30s polling fallback.
 * @param {Function} refetch - callback to reload data
 * @param {string|string[]} [entities] - only refetch if event.entity matches (optional; refetch on all if omitted)
 */
export function useSSE(refetch, entities) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const entSet = entities
      ? new Set(Array.isArray(entities) ? entities : [entities])
      : null;

    let es;
    let pollTimer;
    let reconnectTimer;

    function connect() {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "connected") return;
          if (!entSet || entSet.has(d.entity)) {
            refetchRef.current();
          }
        } catch {
          refetchRef.current();
        }
      };
      es.onerror = () => {
        // SSE dropped — start polling fallback, try reconnect in 5s
        es.close();
        if (!pollTimer) {
          pollTimer = setInterval(() => refetchRef.current(), 30000);
        }
        reconnectTimer = setTimeout(connect, 5000);
      };
      // Clear polling when reconnected (next onmessage proves connection)
      es.onopen = () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      };
    }

    connect();
    // Always have a baseline poll as fallback
    pollTimer = setInterval(() => refetchRef.current(), 30000);

    return () => {
      es?.close();
      clearInterval(pollTimer);
      clearTimeout(reconnectTimer);
    };
  }, [entities]);
}
