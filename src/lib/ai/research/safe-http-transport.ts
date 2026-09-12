import "server-only";

import http from "node:http";
import https from "node:https";
import type { RequestOptions } from "node:https";
import { AI_RESEARCH_LIMITS } from "./config";
import { ResearchExecutionError } from "./types";
import type { ValidatedUrlTarget } from "./url-security";

export interface SafeHttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

export interface SafeHttpTransport {
  get(
    target: ValidatedUrlTarget,
    options: { userAgent: string; maxBytes: number; signal?: AbortSignal }
  ): Promise<SafeHttpResponse>;
}

function requestOptions(target: ValidatedUrlTarget, userAgent: string): RequestOptions {
  const selected = target.addresses[0]!;
  return {
    protocol: target.url.protocol,
    hostname: selected.address,
    port: target.url.port || (target.url.protocol === "https:" ? 443 : 80),
    path: `${target.url.pathname}${target.url.search}`,
    method: "GET",
    agent: false,
    servername: target.hostname,
    headers: {
      host: target.url.host,
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      "accept-encoding": "identity",
      connection: "close",
    },
  };
}

export const nodeSafeHttpTransport: SafeHttpTransport = {
  async get(target, options) {
    if (options.signal?.aborted) {
      throw new ResearchExecutionError("AI_FETCH_FAILED", "Destination fetch was cancelled.");
    }
    return await new Promise<SafeHttpResponse>((resolve, reject) => {
      const requester = target.url.protocol === "https:" ? https : http;
      const request = requester.request(requestOptions(target, options.userAgent));
      let settled = false;
      const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        request.destroy();
        reject(error);
      };
      const headersTimer = setTimeout(
        () => finishReject(new Error("HEADERS_TIMEOUT")),
        AI_RESEARCH_LIMITS.headersTimeoutMs
      );
      const abort = () => finishReject(new Error("ABORTED"));
      options.signal?.addEventListener("abort", abort, { once: true });

      request.once("socket", (socket) => {
        if (!socket.connecting) return;
        const connectTimer = setTimeout(
          () => finishReject(new Error("CONNECT_TIMEOUT")),
          AI_RESEARCH_LIMITS.connectTimeoutMs
        );
        socket.once(target.url.protocol === "https:" ? "secureConnect" : "connect", () => {
          clearTimeout(connectTimer);
        });
      });
      request.once("error", (error) => finishReject(error));
      request.once("response", (response) => {
        clearTimeout(headersTimer);
        const chunks: Buffer[] = [];
        let received = 0;
        response.setTimeout(AI_RESEARCH_LIMITS.bodyTimeoutMs, () => {
          response.destroy(new Error("BODY_TIMEOUT"));
        });
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > options.maxBytes) {
            response.destroy(new Error("RESPONSE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", (error) => finishReject(error));
        response.once("end", () => {
          if (settled) return;
          settled = true;
          options.signal?.removeEventListener("abort", abort);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      });
      request.end();
    }).catch(() => {
      throw new ResearchExecutionError("AI_FETCH_FAILED", "Destination fetch failed.");
    });
  },
};
