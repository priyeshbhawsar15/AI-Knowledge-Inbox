import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface ValidatedDestination {
  url: URL;
  resolvedIp: string;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;

  // Normalize IPv4-mapped IPv6
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '0.0.0.0' || ip === '::') {
    return true;
  }

  // IPv4 check
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;

    const [p0, p1] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 127.0.0.0/8 Loopback
    if (p0 === 127) return true;
    // 10.0.0.0/8 Private
    if (p0 === 10) return true;
    // 172.16.0.0/12 Private
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16 Private
    if (p0 === 192 && p1 === 168) return true;
    // 169.254.0.0/16 Link-local
    if (p0 === 169 && p1 === 254) return true;
    // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved
    if (p0 >= 224) return true;
    // 0.0.0.0/8
    if (p0 === 0) return true;

    return false;
  }

  // IPv6 check
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    // fe80::/10 Link-local
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return true;
    }
    // fc00::/7 Unique local
    if (lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    // ff00::/8 Multicast
    if (lower.startsWith('ff')) {
      return true;
    }
    return false;
  }

  return true;
}

export async function validateUrlAndResolveIp(
  urlStr: string,
  options?: { allowLocalhostInTests?: boolean }
): Promise<ValidatedDestination> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('URL_POLICY_VIOLATION: Invalid URL format');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL_POLICY_VIOLATION: Only HTTP and HTTPS protocols are allowed');
  }

  if (url.username || url.password) {
    throw new Error('URL_POLICY_VIOLATION: Credentials in URL are forbidden');
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  // Standard ports allowed unless test mode explicitly overrides
  if (!options?.allowLocalhostInTests && port !== 80 && port !== 443) {
    throw new Error(`URL_POLICY_VIOLATION: Non-standard port ${port} is forbidden`);
  }

  const hostname = url.hostname.toLowerCase();
  if (!options?.allowLocalhostInTests) {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new Error('URL_PRIVATE_ADDRESS: Localhost target forbidden');
    }
  }

  let ip: string;
  if (isIP(hostname)) {
    ip = hostname;
  } else {
    try {
      const addresses = await lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        throw new Error('URL_FETCH_FAILED: DNS resolution failed');
      }
      const first = addresses[0];
      if (!first) {
        throw new Error('URL_FETCH_FAILED: DNS resolution failed');
      }
      ip = first.address;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('URL_')) throw err;
      throw new Error(`URL_FETCH_FAILED: Could not resolve domain ${hostname}`);
    }
  }

  if (!options?.allowLocalhostInTests && isPrivateOrReservedIp(ip)) {
    throw new Error(`URL_PRIVATE_ADDRESS: Destination IP ${ip} is in a private/reserved range`);
  }

  return { url, resolvedIp: ip };
}
