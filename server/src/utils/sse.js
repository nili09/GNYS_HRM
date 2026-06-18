/**
 * Server-Sent Events broadcast utility.
 * Keeps a Map of userId → Set<response> for targeted delivery,
 * plus a Set of all clients for untargeted broadcasts.
 */
const allClients = new Set();
const userClients = new Map();

export function addClient(res, userId) {
  allClients.add(res);
  if (userId) {
    if (!userClients.has(userId)) userClients.set(userId, new Set());
    userClients.get(userId).add(res);
  }
  res.on("close", () => {
    allClients.delete(res);
    if (userId && userClients.has(userId)) {
      userClients.get(userId).delete(res);
      if (userClients.get(userId).size === 0) userClients.delete(userId);
    }
  });
}

export function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of allClients) {
    try { res.write(payload); } catch { allClients.delete(res); }
  }
}

export function sendToUser(userId, data) {
  const clients = userClients.get(userId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

export function clientCount() { return allClients.size; }
