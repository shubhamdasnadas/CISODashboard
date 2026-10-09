const os = require('os');

/**
 * Automatically determine the local machine's IPv4 address.
 * Prioritizes standard physical LAN adapters (Wi-Fi, Ethernet)
 * and filters out virtual adapters (Docker, WSL, VMWare, VirtualBox, Hyper-V).
 */
function getMachineIp() {
  if (process.env.HOST_IP && process.env.HOST_IP.trim()) {
    return process.env.HOST_IP.trim();
  }
  if (process.env.MACHINE_IP && process.env.MACHINE_IP.trim()) {
    return process.env.MACHINE_IP.trim();
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!Array.isArray(addrs)) continue;

    for (const net of addrs) {
      // Must be IPv4 and not loopback/internal
      const isIpv4 = net.family === 'IPv4' || net.family === 4;
      if (isIpv4 && !net.internal && net.address && net.address !== '127.0.0.1') {
        const isVirtual = /virtual|vbox|vmnet|vethernet|docker|wsl|hyper-v|loopback|pseudo/i.test(name);
        const isPreferred = /wi-?fi|wireless|ethernet|eth|en|lan|local area/i.test(name);
        candidates.push({
          name,
          address: net.address,
          isVirtual,
          isPreferred,
        });
      }
    }
  }

  // 1. Preferred physical adapters first (non-virtual + preferred name)
  const best = candidates.find((c) => !c.isVirtual && c.isPreferred);
  if (best) return best.address;

  // 2. Any non-virtual adapter
  const nonVirtual = candidates.find((c) => !c.isVirtual);
  if (nonVirtual) return nonVirtual.address;

  // 3. Any non-internal IP found
  if (candidates.length > 0) return candidates[0].address;

  // 4. Fallback
  return 'localhost';
}

/**
 * Resolves the appropriate Frontend / App Base URL.
 * Automatically replaces 'localhost' or '127.0.0.1' with the host machine IP.
 * Optionally uses the request origin if the client is connected over LAN.
 */
function getAppUrl(req) {
  // If request origin is provided and not localhost, we can use it
  if (req && req.headers) {
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      try {
        const u = new URL(origin);
        if (u.hostname && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          return `${u.protocol}//${u.host}`.replace(/\/+$/, '');
        }
      } catch {}
    }
  }

  const machineIp = getMachineIp();
  const configuredUrl = process.env.APP_URL || 'http://localhost:5173';

  // Replace localhost or 127.0.0.1 with machine IP
  const resolvedUrl = configuredUrl
    .replace(/\b(localhost|127\.0\.0\.1)\b/g, machineIp)
    .replace(/\/+$/, '');

  return resolvedUrl;
}

module.exports = {
  getMachineIp,
  getAppUrl,
};
