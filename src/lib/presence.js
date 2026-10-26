// In-memory "online" tracking: a user counts as online when they made an
// authenticated request within the last ONLINE_WINDOW_MS. In-memory is fine
// for a single-instance deployment; the map is pruned on each touch.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const lastSeen = new Map();

function prune(now) {
  const cutoff = now - ONLINE_WINDOW_MS;
  for (const [userId, seenAt] of lastSeen) {
    if (seenAt < cutoff) lastSeen.delete(userId);
  }
}

export function touchPresence(userId) {
  lastSeen.set(userId, Date.now());
  if (lastSeen.size > 1000) prune(Date.now());
}

export function onlineCount() {
  const now = Date.now();
  prune(now);
  return lastSeen.size;
}
