import { describe, test, expect, vi, beforeEach, type Mock } from "vitest"; //TODO(Nestor): Try to use globals instead of importing
import { ZenRows } from "../src";
import packageJson from "../package.json" assert { type: "json" };
import { server } from "./_setup";
import { http } from "msw";

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
			{
				method: "GET",
				headers: {
					"User-Agent": `zenrows/${packageJson.version} node`,
				},
			},
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
				optionalParams[key].toString(),
			);
		}
	});

	test("should overwrite user agent from headers", async () => {
		const clientSpy = vi.spyOn(client, "fetchWithRetry");

		const headers = { "User-Agent": "test" };
		await client.get(url, {}, { headers });

		expect(clientSpy).toHaveBeenCalledWith(
			`${apiUrl}?url=${encodeURIComponent(url)}&apikey=${apiKey}&custom_headers=true`,
			{
				method: "GET",
				headers: {
					"User-Agent": "test",
				},
			},
		);
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
				body: `"${data}"`,
			}),
		);
	});
});
