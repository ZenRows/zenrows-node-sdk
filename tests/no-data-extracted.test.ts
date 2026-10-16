import { http, HttpResponse } from "msw";
import { describe, expect, test } from "vitest";
import { ZenRows, isNoDataExtracted } from "../src";
import { server } from "./_setup";

const noData = { code: "no_data_extracted", title: "No data extracted" };

describe("422 no_data_extracted", () => {
  test("extract() returns it after one request, even with retries set", async () => {
    let fetchCount = 0;
    server.use(
      http.get("https://api.zenrows.com/v1/", () => {
        fetchCount++;
        return HttpResponse.json(noData, { status: 422 });
      }),
    );

    const client = new ZenRows("API_KEY", { retries: 2 });
    const response = await client.extract("https://example.com");

    expect(response.status).toBe(422);
    expect(fetchCount).toBe(1);
    expect(await response.json()).toEqual(noData);
  });

  test("any other 422 is not retried either", async () => {
    let fetchCount = 0;
    server.use(
      http.get("https://api.zenrows.com/v1/", () => {
        fetchCount++;
        return HttpResponse.json({ code: "RESP001" }, { status: 422 });
      }),
    );

    const client = new ZenRows("API_KEY", { retries: 1 });
    const response = await client.fetch("https://example.com");

    expect(response.status).toBe(422);
    expect(fetchCount).toBe(1);
  });

  test("isNoDataExtracted matches only a 422 with that code, in any case", async () => {
    expect(await isNoDataExtracted(Response.json(noData, { status: 422 }))).toBe(true);
    expect(
      await isNoDataExtracted(Response.json({ code: "NO_DATA_EXTRACTED" }, { status: 422 })),
    ).toBe(true);
    expect(await isNoDataExtracted(Response.json({ code: "RESP001" }, { status: 422 }))).toBe(
      false,
    );
    expect(await isNoDataExtracted(Response.json(noData, { status: 400 }))).toBe(false);
    expect(await isNoDataExtracted(new Response("not json", { status: 422 }))).toBe(false);
  });
});
