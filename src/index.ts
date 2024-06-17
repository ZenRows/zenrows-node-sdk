import axios, {
	type AxiosPromise,
	type AxiosRequestConfig,
	type Method,
} from "axios";
import axiosRetry from "axios-retry";
import * as fastq from "fastq";

import { version } from "../package.json" assert { type: "json" };

const API_URL = "https://api.zenrows.com/v1/";

interface ClientConfig {
	concurrency?: number;
	retries?: number;
}
interface Config {
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

class ZenRows {
	readonly apiKey: string;
	readonly clientConfig: ClientConfig;
	readonly queue;

	constructor(apiKey: string, clientConfig: ClientConfig = {}) {
		this.apiKey = apiKey;
		this.clientConfig = clientConfig;

		this.queue = fastq.promise(
			this,
			this.worker,
			this.clientConfig.concurrency ?? 5,
		);

		this.applyRetries();
	}

	public get(
		url: string,
		config?: Config,
		{ headers = {} }: { headers?: Headers } = {},
	): AxiosPromise {
		return this.queue.push({ url, config, headers });
	}

	public post(
		url: string,
		config?: Config,
		{ headers = {}, data = {} }: { headers?: Headers; data?: unknown } = {},
	): AxiosPromise {
		return this.queue.push({ url, method: "POST", config, headers, data });
	}

	private worker({
		url,
		method = "GET",
		config,
		headers,
		data,
	}: {
		url: string;
		method?: Method;
		config?: Config;
		headers: Headers;
		data?: unknown;
	}): AxiosPromise {
		const params = {
			...config,
			url,
			apikey: this.apiKey,
		};

		const finalHeaders = {
			"User-Agent": `zenrows/${version} node`,
			...headers,
		};

		const axiosRequestConfig: AxiosRequestConfig = {
			baseURL: API_URL,
			method,
			params,
			headers: finalHeaders,
			data,
		};

		if (headers && Object.keys(headers).length) {
			params.custom_headers = true;
		}

		return axios(axiosRequestConfig);
	}

	private applyRetries() {
		const retries = this.clientConfig.retries ?? 0;
		if (retries > 0) {
			axiosRetry(axios, {
				retries,
				retryDelay: axiosRetry.exponentialDelay,
				retryCondition: (error) => {
					if (error.response?.status === 429) {
						return true;
					}

					return axiosRetry.isNetworkOrIdempotentRequestError(error);
				},
			});
		}
	}
}

export { ZenRows };
