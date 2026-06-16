/**
 * Server-Sent Events broadcast utility.
 * Keeps a Set of response objects; broadcasts JSON events to all connected clients.
 */
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

export function clientCount() { return clients.size; }
