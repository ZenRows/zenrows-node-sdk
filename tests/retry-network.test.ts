// Retry decisions against a real node:http server through Node's real fetch, so each failure
// reaches the policy in the exact shape undici produces. The request mocks are off in this file.
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
import { server as mockServer } from "./_setup";

const API_URL = "https://api.zenrows.com/v1/";

let realFetch: typeof fetch;

beforeAll(() => {
  // The shared setup turns the request mocks on; turn them off here so fetch is Node's own.
  mockServer.close();
  realFetch = globalThis.fetch;
});

afterAll(() => {
  // Leave the mocks as the shared setup expects to find them when it closes them.
  mockServer.listen();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface TestServer {
  origin: string;
  /** Requests the server read in full, by method. */
  requests: string[];
  /** Sockets the server still holds open. */
  sockets: Set<Socket>;
  close: () => Promise<void>;
}

async function startServer(
  handle: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<TestServer> {
  const requests: string[] = [];
  const sockets = new Set<Socket>();
  const httpServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      requests.push(req.method ?? "");
      handle(req, res);
    });
  });
  httpServer.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    sockets,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        httpServer.close(() => resolve());
      }),
  };
}

/** A port nothing listens on: bind one, then close it. */
async function closedPortOrigin(): Promise<string> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

/**
 * Sends the client's API calls to `origin` through real fetch, with extra fetch options, and
 * counts the calls. Must run before the client is built, since the client wraps fetch then.
 */
function routeApiTo(origin: string, extra: Record<string, unknown> = {}) {
  const calls = { count: 0 };
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    calls.count += 1;
    return realFetch(String(input).replace(API_URL, `${origin}/v1/`), { ...init, ...extra });
  });
  return calls;
}

/** undici's Agent, taken from Node's own global dispatcher: Node bundles undici but does not export it. */
async function undiciAgent(origin: string): Promise<new (options: object) => object> {
  await (await realFetch(`${origin}/warm-up`)).arrayBuffer();
  const globals = globalThis as unknown as Record<symbol, { constructor: unknown } | undefined>;
  const dispatcher =
    globals[Symbol.for("undici.globalDispatcher.2")] ??
    globals[Symbol.for("undici.globalDispatcher.1")];
  if (!dispatcher) throw new Error("Node's fetch exposes no global dispatcher");
  return dispatcher.constructor as new (
    options: object,
  ) => object;
}

const fastRandom = () => vi.spyOn(Math, "random").mockReturnValue(0);

describe("failures before the request was sent are retried", () => {
  test("a refused connection is retried `retries` times, then throws", async () => {
    fastRandom();
    const calls = routeApiTo(await closedPortOrigin());

    const error = await new ZenRows("API_KEY").fetch("https://example.com").catch((e) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(error.cause.code).toBe("ECONNREFUSED");
    expect(calls.count).toBe(3);
  });

  test("a refused connection is retried for a post() with an Idempotency-Key", async () => {
    fastRandom();
    const calls = routeApiTo(await closedPortOrigin());

    const error = await new ZenRows("API_KEY", { retries: 1 })
      .post("https://example.com", {}, { headers: { "Idempotency-Key": "k1" }, data: { a: 1 } })
      .catch((e) => e);

    expect(error.cause.code).toBe("ECONNREFUSED");
    expect(calls.count).toBe(2);
  });
});

describe("failures after the request was sent are not retried", () => {
  test("a socket closed after the server read the request", async () => {
    fastRandom();
    const server = await startServer((req) => req.socket.destroy());
    routeApiTo(server.origin);

    const error = await new ZenRows("API_KEY").fetch("https://example.com").catch((e) => e);
    await server.close();

    expect(error).toBeInstanceOf(TypeError);
    expect(error.cause.code).toBe("UND_ERR_SOCKET");
    expect(server.requests).toEqual(["GET"]);
  });

  test("a socket closed after a post() with an Idempotency-Key was read", async () => {
    fastRandom();
    const server = await startServer((req) => req.socket.destroy());
    routeApiTo(server.origin);

    const error = await new ZenRows("API_KEY")
      .post("https://example.com", {}, { headers: { "Idempotency-Key": "k1" }, data: { a: 1 } })
      .catch((e) => e);
    await server.close();

    expect(error.cause.code).toBe("UND_ERR_SOCKET");
    expect(server.requests).toEqual(["POST"]);
  });

  test("headers that arrive after undici's headersTimeout", async () => {
    fastRandom();
    const server = await startServer((req, res) => {
      if (req.url === "/warm-up") return res.end();
      setTimeout(() => res.end("late"), 1000).unref();
    });
    const Agent = await undiciAgent(server.origin);
    server.requests.length = 0;
    routeApiTo(server.origin, { dispatcher: new Agent({ headersTimeout: 200 }) });

    const error = await new ZenRows("API_KEY").fetch("https://example.com").catch((e) => e);
    await server.close();

    expect(error).toBeInstanceOf(TypeError);
    expect(error.cause.code).toBe("UND_ERR_HEADERS_TIMEOUT");
    expect(server.requests).toEqual(["GET"]);
  });

  test("an invalid header value throws at once, with no retry", async () => {
    fastRandom();
    const server = await startServer((_req, res) => res.end("ok"));
    const calls = routeApiTo(server.origin);

    const error = await new ZenRows("API_KEY")
      .fetch("https://example.com", {}, { headers: { "X-Bad": "a\nb" } })
      .catch((e) => e);
    await server.close();

    expect(error).toBeInstanceOf(TypeError);
    expect(error.cause).toBeUndefined();
    expect(calls.count).toBe(1);
    expect(server.requests).toEqual([]);
  });
});

describe("retried answers", () => {
  test("free their connection: no socket stays open after retried 503s with large bodies", async () => {
    fastRandom();
    const largeBody = "x".repeat(2 * 1024 * 1024);
    const server = await startServer((_req, res) => {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end(largeBody);
    });
    routeApiTo(server.origin);

    const client = new ZenRows("API_KEY");
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => client.fetch("https://example.com")),
    );
    for (const response of responses) await response.body?.cancel();
    for (let i = 0; i < 50 && server.sockets.size > 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const open = server.sockets.size;
    await server.close();

    expect(server.requests).toHaveLength(15);
    expect(open).toBe(0);
  });
});
