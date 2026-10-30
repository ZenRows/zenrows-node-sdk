import { http, HttpResponse, type JsonBodyType } from "msw";
import { type Mock, beforeEach, describe, expect, test, vi } from "vitest"; //TODO(Nestor): Try to use globals instead of importing
import packageJson from "../package.json" with { type: "json" };
import { ZenRows } from "../src";
import { server } from "./_setup";

describe("ZenRows Client Get", () => {
  const apiKey = "API_KEY";
  const url = "https://example.com";
  const apiUrl = "https://api.zenrows.com/v1/";
  let client: ZenRows;

  beforeEach(() => {
    client = new ZenRows(apiKey);
  });

  test("should instantiate the ZenRows class correctly", () => {
    expect(client).toBeInstanceOf(ZenRows);
    expect(client.apiKey).toBe(apiKey);
  });

  test("should have custom user agent", async () => {
    const clientSpy = vi.spyOn(client, "fetchWithRetry");
    const response = await client.get(url);

    expect(clientSpy).toHaveBeenCalledWith(
      `${apiUrl}?url=${encodeURIComponent(url)}&apikey=${apiKey}`,
      expect.objectContaining({
        method: "GET",
        headers: {
          "User-Agent": `zenrows/${packageJson.version} node`,
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  test("should set optional params correctly", async () => {
    const optionalParams = {
      autoparse: true,
      css_extractor: '{"links": "a @href", "images": "img @src"}',
      js_render: true,
      premium_proxy: true,
      proxy_country: "us",
    };

    const response = await client.get(url, optionalParams);

    const requestUrl = response.url;
    const parsedUrl = new URL(requestUrl);

    for (const key in optionalParams) {
      expect(parsedUrl.searchParams.get(key)).toBe(
        optionalParams[key as keyof typeof optionalParams].toString(),
      );
    }
  });

  test("should overwrite user agent from headers", async () => {
    const clientSpy = vi.spyOn(client, "fetchWithRetry");

    const headers = { "User-Agent": "test" };
    await client.get(url, {}, { headers });

    expect(clientSpy).toHaveBeenCalledWith(
      `${apiUrl}?url=${encodeURIComponent(url)}&apikey=${apiKey}&custom_headers=true`,
      expect.objectContaining({
        method: "GET",
        headers: {
          "User-Agent": "test",
        },
      }),
    );
  });

  test("fetch() is the primary method; get() is a deprecated alias for it", async () => {
    const response = await client.fetch(url);
    expect(response.status).toBe(200);

    const viaGet = await client.get(url);
    expect(viaGet.status).toBe(200);
  });

  test("extract() sets the extract param, defaulting to auto", async () => {
    const response = await client.extract(url);

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.get("extract")).toBe("auto");
  });

  test("extract() sends Adaptive Stealth Mode by default", async () => {
    const response = await client.extract(url);

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.get("mode")).toBe("auto");
  });

  test("extract() omits mode when adaptiveStealth is disabled", async () => {
    const response = await client.extract(url, { adaptiveStealth: false });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.has("mode")).toBe(false);
  });

  test("extract() skips Adaptive Stealth Mode when js_render is set", async () => {
    const response = await client.extract(url, { js_render: true });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.has("mode")).toBe(false);
    expect(parsedUrl.searchParams.get("js_render")).toBe("true");
  });

  test("extract() skips Adaptive Stealth Mode when premium_proxy is set", async () => {
    const response = await client.extract(url, { premium_proxy: true });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.has("mode")).toBe(false);
  });

  test("extract() keeps Adaptive Stealth Mode when js_render is false", async () => {
    const response = await client.extract(url, { js_render: false });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.get("mode")).toBe("auto");
  });

  test("extract() keeps a wire mode the caller set, even with adaptiveStealth off", async () => {
    const response = await client.extract(url, { mode: "auto", adaptiveStealth: false });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.get("mode")).toBe("auto");
  });

  test("extract() accepts an explicit mode", async () => {
    const response = await client.extract(url, { extract: "native" });

    const parsedUrl = new URL(response.url);
    expect(parsedUrl.searchParams.get("extract")).toBe("native");
  });

  describe("extract() never falls back to autoparse", () => {
    // Counts every request to the API and answers each one from `responses` in order.
    const answer = (responses: Array<{ status: number; body: JsonBodyType }>) => {
      const urls: URL[] = [];
      server.use(
        http.get("https://api.zenrows.com/v1/", ({ request }) => {
          urls.push(new URL(request.url));
          const next = responses[Math.min(urls.length, responses.length) - 1];
          return HttpResponse.json(next?.body, { status: next?.status });
        }),
      );
      return urls;
    };

    const notReady = [
      {
        name: "REQS007",
        status: 403,
        body: { code: "REQS007", reason: "domain_not_prepared", title: "Domain not prepared" },
      },
      {
        name: "the legacy AUTH010",
        status: 402,
        body: { code: "AUTH010", title: "Domain not enabled" },
      },
    ];

    // First in the block: the warning is emitted once per process.
    test("fallbackToAutoparse: true emits one DeprecationWarning per process", async () => {
      const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
      answer([{ status: 403, body: { code: "REQS007" } }]);

      await client.extract(url, { fallbackToAutoparse: true });
      await client.extract(url, { fallbackToAutoparse: true });

      expect(emit).toHaveBeenCalledTimes(1);
      const [message, options] = emit.mock.calls[0] ?? [];
      expect(String(message)).toContain("prepareDomain()");
      expect(options).toMatchObject({ type: "DeprecationWarning" });
      emit.mockRestore();
    });

    for (const { name, status, body } of notReady) {
      test(`returns ${name} as is, in one request`, async () => {
        const emit = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
        const urls = answer([
          { status, body },
          { status: 200, body: [{ found: "via autoparse" }] },
        ]);

        const response = await client.extract(url);

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual(body);
        expect(urls).toHaveLength(1);
        expect(urls[0]?.searchParams.has("autoparse")).toBe(false);
        expect(emit).not.toHaveBeenCalled();
        emit.mockRestore();
      });

      test(`returns ${name} as is, in one request, with the deprecated fallbackToAutoparse`, async () => {
        const urls = answer([
          { status, body },
          { status: 200, body: [{ found: "via autoparse" }] },
        ]);

        const response = await client.extract(url, { fallbackToAutoparse: true });

        expect(response.status).toBe(status);
        expect(urls).toHaveLength(1);
        expect(urls[0]?.searchParams.has("autoparse")).toBe(false);
      });
    }

    test("the REQS007 reason is readable from the response body", async () => {
      answer([{ status: 403, body: { code: "REQS007", reason: "page_not_recognised" } }]);

      const response = await client.extract(url);

      expect(((await response.json()) as { reason?: string }).reason).toBe("page_not_recognised");
    });
  });

  test("should check response status on POST request", async () => {
    const response = await client.post(url);

    expect(response.status).toBe(200);
  });

  test("should check data on POST request", async () => {
    const clientSpy = vi.spyOn(client, "fetchWithRetry");
    const data = "key1=value1&key2=value2";
    const response = await client.post(
      url,
      {},
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data,
      },
    );

    expect(clientSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: data,
      }),
    );
  });

  test("preserves a non-Content-Type custom header on POST alongside the default Content-Type", async () => {
    // normalizedHeaders' fallback branch (any header key other than content-type) was never
    // exercised before — every existing POST test only overrode Content-Type itself.
    const clientSpy = vi.spyOn(client, "fetchWithRetry");

    await client.post(url, {}, { headers: { "X-Custom-Header": "custom-value" } });

    expect(clientSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Custom-Header": "custom-value",
        }),
      }),
    );
  });
});
