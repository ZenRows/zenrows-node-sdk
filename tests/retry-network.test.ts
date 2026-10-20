// Retry decisions against a real node:http server through Node's real fetch, so each failure
// reaches the policy in the exact shape undici produces. The request mocks are off in this file.
import { lookup } from "node:dns/promises";
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

/** True when `localhost` resolves to an IPv4 and an IPv6 address, as Node's fetch looks it up. */
const localhostHasBothFamilies = await lookup("localhost", { all: true }).then(
  (addresses) => new Set(addresses.map((each) => each.family)).size === 2,
  () => false,
);

describe("failures before the request was sent are retried", () => {
  test("a refused connection is retried `retries` times, then throws", async () => {
    fastRandom();
    const calls = routeApiTo(await closedPortOrigin());

    const error = await new ZenRows("API_KEY").fetch("https://example.com").catch((e) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(error.cause.code).toBe("ECONNREFUSED");
    expect(calls.count).toBe(3);
  });

  // `localhost` resolves to ::1 and 127.0.0.1 on most hosts. Node then tries both (happy
  // eyeballs) and the cause is an AggregateError with one ECONNREFUSED per address.
  test.skipIf(!localhostHasBothFamilies)(
    "a refused connection to localhost, on both address families, is retried",
    async () => {
      fastRandom();
      const port = new URL(await closedPortOrigin()).port;
      const calls = routeApiTo(`http://localhost:${port}`);

      const error = await new ZenRows("API_KEY", { retries: 2 })
        .fetch("https://example.com")
        .catch((e) => e);

      expect(error).toBeInstanceOf(TypeError);
      expect(error.cause).toBeInstanceOf(AggregateError);
      const innerCodes = error.cause.errors.map((inner: { code: string }) => inner.code);
      expect(innerCodes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(innerCodes)).toEqual(new Set(["ECONNREFUSED"]));
      expect(calls.count).toBe(3);
    },
  );
});

describe("original_status: true", () => {
  test("a refused connection is still retried", async () => {
    fastRandom();
    const calls = routeApiTo(await closedPortOrigin());

    const error = await new ZenRows("API_KEY")
      .fetch("https://example.com", { original_status: true })
      .catch((e) => e);

    expect(error.cause.code).toBe("ECONNREFUSED");
    expect(calls.count).toBe(3);
  });

  test("a 503 from the server is sent once", async () => {
    fastRandom();
    const server = await startServer((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    routeApiTo(server.origin);

    const response = await new ZenRows("API_KEY").fetch("https://example.com", {
      original_status: true,
    });
    await server.close();

    expect(response.status).toBe(503);
    expect(server.requests).toEqual(["GET"]);
  });
});

describe("post() is sent once, even on a refused connection", () => {
  test.each([
    ["without an Idempotency-Key", {}],
    ["with an Idempotency-Key", { "Idempotency-Key": "k1" }],
  ])("%s", async (_label, headers: Record<string, string>) => {
    fastRandom();
    const calls = routeApiTo(await closedPortOrigin());

    const error = await new ZenRows("API_KEY", { retries: 3 })
      .post("https://example.com", {}, { headers, data: { a: 1 } })
      .catch((e) => e);

    expect(error.cause.code).toBe("ECONNREFUSED");
    expect(calls.count).toBe(1);
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
  // An answer the client drops without reading holds its connection until garbage collection.
  // The server counts answers that have neither finished nor lost their connection. That count
  // does not depend on the Node version, unlike open sockets. Node 20 and 22 drain a cancelled
  // body and keep the socket for undici's keep-alive window, and buffer a small body in full.
  test("release their connection: no answer stays held after retried 503s with large bodies", async () => {
    fastRandom();
    // Larger than undici buffers on its own, so an unread body really holds the connection.
    const largeBody = Buffer.alloc(8 * 1024 * 1024, "x");
    let held = 0;
    const server = await startServer((_req, res) => {
      held += 1;
      res.on("close", () => {
        held -= 1;
      });
      res.writeHead(503, { "Content-Type": "text/plain", "Content-Length": largeBody.length });
      res.end(largeBody);
    });
    routeApiTo(server.origin);

    const client = new ZenRows("API_KEY");
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => client.fetch("https://example.com")),
    );
    for (const response of responses) await response.body?.cancel();
    const deadline = Date.now() + 2000;
    while (held > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const stillHeld = held;
    await server.close();

    expect(server.requests).toHaveLength(15);
    expect(stillHeld).toBe(0);
  });
});
