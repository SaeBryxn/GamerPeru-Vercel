import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { ResearchExecutionError } from "./types";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface ValidatedUrlTarget {
  url: URL;
  hostname: string;
  addresses: ResolvedAddress[];
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function ipv4InCidr(address: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function parseIpv6(address: string): bigint | null {
  let input = address.toLowerCase().split("%")[0]!;
  const ipv4Tail = input.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4Tail) {
    const value = ipv4Number(ipv4Tail);
    if (value === null) return null;
    input = input.replace(
      ipv4Tail,
      `${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`
    );
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }
  return value;
}

function ipv6InCidr(address: bigint, base: bigint, prefix: number): boolean {
  const shift = 128n - BigInt(prefix);
  return address >> shift === base >> shift;
}

export function isUnsafeIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value === null) return true;
    const ranges: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return ranges.some(([base, prefix]) => ipv4InCidr(value, ipv4Number(base)!, prefix));
  }
  if (family === 6) {
    const value = parseIpv6(address);
    if (value === null) return true;
    const mappedPrefix = 0xffffn;
    if (value >> 32n === mappedPrefix) {
      const mapped = Number(value & 0xffffffffn);
      return isUnsafeIpAddress(
        [mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join(".")
      );
    }
    const globalBase = parseIpv6("2000::")!;
    if (!ipv6InCidr(value, globalBase, 3)) return true;
    return (
      ipv6InCidr(value, parseIpv6("2001::")!, 23) ||
      ipv6InCidr(value, parseIpv6("2001:db8::")!, 32) ||
      ipv6InCidr(value, parseIpv6("2001:2::")!, 48) ||
      ipv6InCidr(value, parseIpv6("2002::")!, 16) ||
      ipv6InCidr(value, parseIpv6("3fff::")!, 20) ||
      ipv6InCidr(value, parseIpv6("5f00::")!, 16)
    );
  }
  return true;
}

export function canonicalizeHostname(hostname: string): string {
  const withoutBrackets = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (isIP(withoutBrackets)) return withoutBrackets;
  const ascii = domainToASCII(withoutBrackets);
  if (!ascii || ascii.length > 253) {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Destination hostname is invalid.");
  }
  return ascii;
}

export function isOfficialHostname(hostname: string, canonicalHostname: string): boolean {
  const host = canonicalizeHostname(hostname);
  const canonical = canonicalizeHostname(canonicalHostname);
  if (isIP(host) || isIP(canonical)) return false;
  return host === canonical || host.endsWith(`.${canonical}`);
}

const defaultResolver: DnsResolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));
};

export async function validateExternalUrl(
  rawUrl: string | URL,
  resolver: DnsResolver = defaultResolver
): Promise<ValidatedUrlTarget> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
  } catch {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Destination URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Destination protocol is blocked.");
  }
  if (url.username || url.password) {
    throw new ResearchExecutionError(
      "AI_FETCH_POLICY_BLOCKED",
      "Destination credentials are blocked."
    );
  }
  const effectivePort = url.port || (url.protocol === "https:" ? "443" : "80");
  if (effectivePort !== "80" && effectivePort !== "443") {
    throw new ResearchExecutionError("AI_FETCH_POLICY_BLOCKED", "Destination port is blocked.");
  }

  const hostname = canonicalizeHostname(url.hostname);
  url.hostname = hostname;
  let addresses: ResolvedAddress[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  } else {
    try {
      addresses = await resolver(hostname);
    } catch {
      throw new ResearchExecutionError("AI_FETCH_FAILED", "Destination DNS resolution failed.");
    }
  }
  if (addresses.length === 0 || addresses.some((entry) => isUnsafeIpAddress(entry.address))) {
    throw new ResearchExecutionError(
      "AI_FETCH_POLICY_BLOCKED",
      "Destination resolved to a blocked address."
    );
  }
  return { url, hostname, addresses };
}
