import { describe, test, expect, vi, beforeEach, type Mock } from "vitest"; //TODO(Nestor): Try to use globals instead of importing
import { ZenRows } from "../src";
import packageJson from "../package.json" assert { type: "json" };

describe("ZenRows Client Get", () => {
	const apiKey = "API_KEY";
	const url = "https://example.com";
	const apiUrl = "https://api.zenrows.com/v1/";
	let client: ZenRows;

	beforeEach(() => {
		client = new ZenRows(apiKey);
		vi.mock("node-fetch");
	});

	test("should instantiate the ZenRows class correctly", () => {
		expect(client).toBeInstanceOf(ZenRows);
		expect(client.apiKey).toBe(apiKey);
	});

	test("should have custom user agent", async () => {
		// @ts-ignore (Nestor): TS complains but this works totally fine.
		fetch.mockReturnValue(
			Promise.resolve(
				new Response(JSON.stringify({ data: "mockData" }), {
					status: 200,
					headers: { "Content-type": "application/json" },
				}),
			),
		);

		await client.get(url);

		expect(fetch).toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledWith(
			`${apiUrl}?url=${encodeURIComponent(url)}&apikey=${apiKey}`,
			{
				method: "GET",
				headers: {
					"User-Agent": `zenrows/${packageJson.version} node`,
				},
			},
		);
	});

	test("should set optional params correctly", async () => {
		const optionalParams = {
			autoparse: true,
			css_extractor: '{"links": "a @href", "images": "img @src"}',
			js_render: true,
			premium_proxy: true,
			proxy_country: "us",
		};

		await client.get(url, optionalParams);

		const requestUrl = (fetch as Mock).mock.lastCall[0];
		const parsedUrl = new URL(requestUrl);

		for (const key in optionalParams) {
			expect(parsedUrl.searchParams.get(key)).toBe(
				optionalParams[key].toString(),
			);
		}
	});

	test("should overwrite user agent from headers", async () => {
		const headers = { "User-Agent": "test" };
		await client.get(url, {}, { headers });

		const lastFetch = (fetch as Mock).mock.lastCall;

		expect(lastFetch[1].headers).toStrictEqual(headers);
	});

	test("should check response status on POST request", async () => {
		const response = await client.post(url);

		expect(response.status).toBe(200);
	});

	test("should check data on POST request", async () => {
		const data = "key1=value1&key2=value2";
		await client.post(
			url,
			{},
			{
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				data,
			},
		);

		const lastFetch = (fetch as Mock).mock.lastCall;

		expect(lastFetch[1].method).toBe("POST");
		// Remove trialing and leading quotes
		const body = lastFetch[1].body.slice(1, -1);
		expect(body).toBe(data);
		expect(lastFetch[1].headers["Content-Type"]).toBe(
			"application/x-www-form-urlencoded",
		);
	});
});
