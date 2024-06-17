import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { describe, test, expect } from "vitest"; //TODO(Nestor): Try to use globals instead of importing

import { ZenRows } from "../src";

const mock = new MockAdapter(axios);

describe("ZenRows Client Get", () => {
	const apiKey = "API_KEY";
	const url = "https://zenrows.com";
	const client = new ZenRows(apiKey);
	mock.onGet().reply(200);
	mock.onPost().reply(200);

	test("should check response status and add custom user agent", async () => {
		const response = await client.get(url);

		expect(response.status).toBe(200);
		expect(response.config.headers["User-Agent"]).toMatch(/zenrows\/(.*) node/);
	});

	test("should set mandatory params api key and url correctly", async () => {
		const response = await client.get(url);

		expect(response.config.params.apikey).toBe(apiKey);
		expect(response.config.params.url).toBe(url);
	});

	test("should set optional params correctly", async () => {
		const customCssExtractor = '{"links": "a @href", "images": "img @src"}';
		const response = await client.get(url, {
			autoparse: true,
			css_extractor: customCssExtractor,
			js_render: true,
			premium_proxy: true,
			proxy_country: "us",
		});

		expect(response.config.params.autoparse).toBe(true);
		expect(response.config.params.css_extractor).toBe(customCssExtractor);
		expect(response.config.params.js_render).toBe(true);
		expect(response.config.params.premium_proxy).toBe(true);
		expect(response.config.params.proxy_country).toBe("us");
	});

	test("should overwrite user agent from parameters", async () => {
		const headers = { "User-Agent": "test" };
		const response = await client.get(url, {}, { headers });

		expect(response.config.headers["User-Agent"]).toBe("test");
		expect(response.config.params.custom_headers).toBe(true);
	});

	test("should check response status on POST request", async () => {
		const response = await client.post(url);

		expect(response.status).toBe(200);
	});

	test("should check data on POST request", async () => {
		const data = "key1=value1&key2=value2";
		const response = await client.post(url, {}, { data });

		expect(response.config.method).toBe("post");
		expect(response.config.data).toBe(data);
		expect(response.config.headers["Content-Type"]).toBe(
			"application/x-www-form-urlencoded",
		);
	});
});
