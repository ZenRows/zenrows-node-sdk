import { describe, test, expect, beforeEach, vi } from "vitest"; //TODO(Nestor): Try to use globals instead of importing
import { ZenRows } from "../src";

vi.mock("fetch-retry", () => {
	return {
		__esModule: true,
		default: vi.fn((fetch) => fetch),
	};
});

describe("ZenRows Client with Concurrency", () => {
	const apiKey = "API_KEY";
	const url = "https://zenrows.com";
	let client: ZenRows;

	beforeEach(() => {
		client = new ZenRows(apiKey, { concurrency: 2 });
	});

	test("should send and wait for two successful requests", async () => {
		const promises = [client.get(url), client.get(url)];

		const responses = await Promise.all(promises);
		const [response1, response2] = responses;

		expect(responses.length).toBe(2);
		expect(response1.status).toBe(200);
		expect(response2.status).toBe(200);
	});
});
