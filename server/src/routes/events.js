/**
 * SSE endpoint: GET /api/events
 * Auth required. Streams JSON events on mutations.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { addClient } from "../utils/sse.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: {\"type\":\"connected\"}\n\n");
  addClient(res);

  // Keep-alive every 25s
  const keepAlive = setInterval(() => {
    try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); }
  }, 25000);
  res.on("close", () => clearInterval(keepAlive));
});

export default router;
