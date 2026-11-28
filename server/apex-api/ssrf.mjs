// SSRF defence for admin-configured provider endpoints.
// Rules: https only, no URL credentials, standard port, hostname must resolve ONLY to public addresses, the connection is
// pinned to the address we validated (no DNS rebinding between check and use), redirects are never followed, and the
// provider credential is attached only to that single validated host. Tests may relax this with ALLOW_PRIVATE_UPSTREAMS=1.
import dns from "node:dns/promises";
import net from "node:net";
import https from "node:https";
import http from "node:http";

const envAllow = () => process.env.ALLOW_PRIVATE_UPSTREAMS === "1";

export function isPublicIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false; // IETF protocol / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && p[2] === 100) return false;
  if (a === 203 && b === 0 && p[2] === 113) return false;
  if (a >= 224) return false; // multicast + reserved + broadcast
  return true;
}
export function isPublicIPv6(ip) {
  const s = ip.toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIPv4(mapped[1]);
  // WHATWG URL / dns normalise ::ffff:a.b.c.d to hex groups (::ffff:7f00:1): decode those too, and IPv4-compatible ::a:b
  const hex = s.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
    return isPublicIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (s === "::" || s === "::1") return false;
  if (/^f[cd]/.test(s)) return false; // unique local fc00::/7
  if (/^fe[89ab]/.test(s)) return false; // link-local fe80::/10
  if (/^ff/.test(s)) return false; // multicast
  if (s.startsWith("2001:db8")) return false; // documentation
  if (s.startsWith("64:ff9b")) return false; // NAT64
  return true;
}
export const isPublicIp = (ip) => (net.isIPv4(ip) ? isPublicIPv4(ip) : net.isIPv6(ip) ? isPublicIPv6(ip) : false);

/** Throws a user-readable Error unless the URL is safe. Returns { url, address, family }. */
export async function assertSafeUrl(raw, allow = envAllow()) {
  const allowPrivate = () => allow;
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error("Endpoint is not a valid URL.");
  }
  if (url.username || url.password) throw new Error("Endpoint must not contain credentials.");
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) throw new Error("Endpoint must use HTTPS.");
  if (!allowPrivate() && url.port && url.port !== "443") throw new Error("Endpoint must use the standard HTTPS port.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Endpoint has no host.");
  if (!allowPrivate() && (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))) throw new Error("Endpoint host is not public.");
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIPv4(host) ? 4 : 6 }];
  else {
    try {
      addrs = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error("Endpoint host could not be resolved.");
    }
  }
  if (!addrs.length) throw new Error("Endpoint host could not be resolved.");
  if (!allowPrivate() && addrs.some((a) => !isPublicIp(a.address))) throw new Error("Endpoint resolves to a private or reserved address.");
  return { url, address: addrs[0].address, family: addrs[0].family };
}

/**
 * One validated request. Never follows redirects (a 3xx is returned as-is and treated as failure by callers), pins the TCP
 * connection to the validated IP, enforces a timeout, and sends headers only to this one host.
 */
export async function safeRequest(rawUrl, { method = "POST", headers = {}, body, timeoutMs = 20000, allowPrivate = envAllow() } = {}) {
  const { url, address, family } = await assertSafeUrl(rawUrl, allowPrivate);
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: { ...headers, host: url.host, "content-length": body ? Buffer.byteLength(body) : 0 },
        servername: net.isIP(url.hostname) ? undefined : url.hostname,
        lookup: (_h, _o, cb) => cb(null, address, family), // pinned: no second DNS resolution
        timeout: timeoutMs,
      },
      (res) => resolve(res),
    );
    req.on("timeout", () => req.destroy(new Error("Upstream timed out.")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
