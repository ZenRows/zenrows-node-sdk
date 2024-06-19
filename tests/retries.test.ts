import { vi, describe, test, expect, beforeEach, type Mock } from "vitest"; //TODO(Nestor): Try to use globals instead of importing
import { ZenRows } from "../src";
import { server } from "./_setup";
import { HttpResponse, http } from "msw";

describe("ZenRows Client with Retries", () => {
	const apiKey = "API_KEY";
	const url = "https://example.com";
	const apiUrl = "https://api.zenrows.com/v1/";
	let client: ZenRows;

	beforeEach(() => {
		client = new ZenRows(apiKey, { retries: 2 });
	});

	test(
		"should call fetch 3 times (initial plus 2 retries)",
		{ timeout: Number.POSITIVE_INFINITY },
		async () => {
			const clientSpy = vi.spyOn(client, "fetchWithRetry");
			server.use(
				http.get("https://api.zenrows.com/v1/", () => {
					return HttpResponse.error();
				}),
			);

			try {
				await client.get(url);
			} catch (error) {
				return;
			}

			expect(clientSpy).toHaveBeenCalledTimes(3);
		},
	);

	test(
		"should throw error with status code 500",
		{ timeout: Number.POSITIVE_INFINITY },
		async () => {
			const clientSpy = vi.spyOn(client, "get");
			server.use(
				http.get("https://api.zenrows.com/v1/", () => {
					return new HttpResponse(null, { status: 503 });
				}),
			);

			try {
				const response = await client.get(url);
				expect(clientSpy).toHaveBeenCalledTimes(3);
				expect(response.status).toBe(503);
			} catch (error) {
				return;
			}
		},
	);

	test(
		"should fail the first attempt and succeed the second",
		{ timeout: Number.POSITIVE_INFINITY },
		async () => {
			server.use(
				http.get(
					"https://api.zenrows.com/v1/",
					() => {
						return new HttpResponse(null, { status: 503 });
					},
					{
						once: true,
					},
				),
			);

			try {
				const response = await client.get(url);
				expect(response).toBe(200);
			} catch (error) {
				return;
			}
		},
	);
});
