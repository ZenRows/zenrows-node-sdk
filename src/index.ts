import fastq from "fastq";
import fetchRetry from "fetch-retry";
import packageJson from "../package.json" assert { type: "json" };

const API_URL = "https://api.zenrows.com/v1/";

type HttpMethods = "GET" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ClientConfig {
	concurrency?: number;
	retries?: number;
}
export interface ZenrowsConfig {
	autoparse?: boolean;
	css_extractor?: string;
	js_render?: boolean;
	premium_proxy?: boolean;
	proxy_country?: string;
	wait_for?: string;
	wait?: number;
	block_resources?: string;
	window_width?: number;
	window_height?: number;
	device?: string;
	original_status?: boolean;
	custom_headers?: boolean;
	[x: string]: unknown;
}

interface Headers {
	[x: string]: string;
}

export class ZenRows {
	readonly apiKey: string;
	readonly clientConfig: ClientConfig;
	readonly queue;
	readonly fetchWithRetry;

	constructor(apiKey: string, clientConfig: ClientConfig = {}) {
		this.apiKey = apiKey;
		this.clientConfig = clientConfig;

		this.queue = fastq.promise(
			this,
			this.worker,
			this.clientConfig.concurrency ?? 5,
		);

		this.fetchWithRetry = fetchRetry(fetch, {
			retries: this.clientConfig.retries ?? 0,
			retryDelay: (attempt) => 2 ** attempt * 1000,
			retryOn: [429, 503, 504],
		});
	}

	public get(
		url: string,
		config?: ZenrowsConfig,
		{ headers = {} }: { headers?: Headers } = {},
	): Promise<Response> {
		return this.queue.push({ url, config, headers });
	}

	public post(
		url: string,
		config?: ZenrowsConfig,
		{ headers = {}, data = {} }: { headers?: Headers; data?: unknown } = {},
	): Promise<Response> {
		return this.queue.push({ url, method: "POST", config, headers, data });
	}

	private async worker({
		url,
		method = "GET",
		config,
		headers,
		data,
	}: {
		url: string;
		method?: HttpMethods;
		config?: ZenrowsConfig;
		headers: Headers;
		data?: unknown;
	}): Promise<Response> {
		const params = new URLSearchParams({
			url,
			apikey: this.apiKey,
		});

		if (config) {
			for (const [key, value] of Object.entries(config)) {
				if (value !== undefined) {
					params.append(key, String(value));
				}
			}
		}

		if (headers && Object.keys(headers).length) {
			params.append("custom_headers", "true");
		}

		const finalHeaders = {
			"User-Agent": `zenrows/${packageJson.version} node`,
			...headers,
		};

		const fetchOptions: RequestInit = {
			method,
			headers: finalHeaders,
		};

		if (method === "POST" && data) {
			fetchOptions.body = JSON.stringify(data);
		}

		const response = await this.fetchWithRetry(
			`${API_URL}?${params.toString()}`,
			fetchOptions,
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		return response;
	}
}
