import axios from "axios";
import MockAdapter from "axios-mock-adapter";

import { ZenRows } from "../src";

describe("ZenRows Client with Concurrency", () => {
	const apiKey = "API_KEY";
	const url = "https://zenrows.com";
	const client = new ZenRows(apiKey, { concurrency: 2 });

	test("should send and wait for two successful requests", async () => {
		const mock = new MockAdapter(axios);
		mock.onGet().reply(200);

		const promises = [client.get(url), client.get(url)];

		const responses = await Promise.all(promises);
		const [response1, response2] = responses;

		expect(responses.length).toBe(2);
		expect(response1.status).toBe(200);
		expect(response2.status).toBe(200);
	});
});
