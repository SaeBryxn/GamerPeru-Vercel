import { createServer } from "node:http";

const port = Number(process.env.MEDIA_TEST_S3_PORT ?? 9000);
const objects = new Map<string, { body: Buffer; contentType: string; cacheControl: string }>();
const origins = new Set(["http://localhost:3000", "http://localhost:3001"]);
const server = createServer((request, response) => {
  const key = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
  const origin = request.headers.origin;
  if (origin && !origins.has(origin)) {
    response.writeHead(403).end();
    return;
  }
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "PUT, HEAD, GET, DELETE, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,cache-control,content-length,range"
  );
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method === "PUT") {
    const chunks: Buffer[] = [];
    let length = 0;
    request.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > 30 * 1024 * 1024) {
        response.writeHead(413).end();
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      objects.set(key, {
        body: Buffer.concat(chunks),
        contentType: request.headers["content-type"] ?? "application/octet-stream",
        cacheControl: String(request.headers["cache-control"] ?? ""),
      });
      response.writeHead(200).end();
    });
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  const object = objects.get(key);
  if (!object) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("Content-Type", object.contentType);
  response.setHeader("Cache-Control", object.cacheControl);
  if (request.method === "HEAD") {
    response.setHeader("Content-Length", object.body.length);
    response.writeHead(200).end();
    return;
  }
  if (request.method === "GET") {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    if (match) {
      const start = Number(match[1]),
        end = Math.min(Number(match[2]), object.body.length - 1);
      if (start > end) {
        response.writeHead(416).end();
        return;
      }
      response.setHeader("Content-Range", `bytes ${start}-${end}/${object.body.length}`);
      response.writeHead(206).end(object.body.subarray(start, end + 1));
    } else response.writeHead(200).end(object.body);
    return;
  }
  response.writeHead(405).end();
});
server.on("error", (error: NodeJS.ErrnoException) => {
  process.stderr.write(`Fixture S3 local no disponible: ${error.code ?? "ERROR"}\n`);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Fixture S3 local en 127.0.0.1:${port}; PID ${process.pid}\n`)
);
