// Retry decisions through Node's real fetch against a local server, so each failure reaches the
// policy in the shape Node produces. The request mocks are off in this file.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { ZenRows } from "../src";
import { server as mockServer } from "./_setup";

const realFetch = globalThis.fetch;

beforeAll(() => mockServer.close());
afterAll(() => mockServer.listen());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Starts a local server; `port` 0 picks a free port. */
async function listen(handle?: http.RequestListener) {
  const local = http.createServer(handle);
  await new Promise<void>((resolve) => local.listen(0, "127.0.0.1", resolve));
  return { local, port: (local.address() as AddressInfo).port };
}

/** Sends the client's API calls to `127.0.0.1:port` and counts them. Call before building the client. */
function routeApiTo(port: number) {
  const calls = { count: 0 };
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    calls.count += 1;
    return realFetch(input.replace("https://api.zenrows.com", `http://127.0.0.1:${port}`), init);
  });
  return calls;
}

async function refusedPort(): Promise<number> {
  const { local, port } = await listen();
  await new Promise((resolve) => local.close(resolve));
  return port;
}

describe("real network failures", () => {
  test.each([
    { retries: undefined, requests: 1 },
    { retries: 2, requests: 3 },
  ])(
    "a refused connection with retries $retries: $requests request(s), then the error",
    async ({ retries, requests }) => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const calls = routeApiTo(await refusedPort());

      const error = await new ZenRows("API_KEY", { retries })
        .fetch("https://example.com")
        .catch((e) => e);

      expect(error).toBeInstanceOf(TypeError);
      expect(error.cause.code).toBe("ECONNREFUSED");
      expect(calls.count).toBe(requests);
    },
  );

  test("a socket closed after the API read the request is not retried", async () => {
    let received = 0;
    const { local, port } = await listen((req) => {
      received += 1;
      req.socket.destroy();
    });
    routeApiTo(port);

    const error = await new ZenRows("API_KEY", { retries: 2 })
      .fetch("https://example.com")
      .catch((e) => e);
    local.close();

    expect(error.cause.code).toBe("UND_ERR_SOCKET");
    expect(received).toBe(1);
  });
});
