import fastq from "fastq";
import fetchRetry from "fetch-retry";
import packageJson from "../package.json" assert { type: "json" };

const API_URL = "https://api.zenrows.com/v1/";

type HttpMethods = "GET" | "POST" | "PUT";

interface ClientConfig {
  concurrency?: number;
  retries?: number;
}
export interface ZenRowsConfig {
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
    const retries = this.clientConfig.retries ?? 0;

    this.queue = fastq.promise(
      this,
      this.worker,
      this.clientConfig.concurrency ?? 5,
    );

    this.fetchWithRetry = fetchRetry(fetch, {
      retryDelay: (attempt) => 2 ** attempt * 1000,
      // retryOn: [422, 503, 504],
      retryOn: (attempt, error, response) => {
        if (attempt > retries) {
          return false;
        }

        if (
          error !== null ||
          response?.status === 422 ||
          response?.status === 503 ||
          response?.status === 504
        ) {
          return true;
        }

        return false;
      },
    });
  }

  public get(
    url: string,
    config?: ZenRowsConfig,
    { headers = {} }: { headers?: Headers } = {},
  ): Promise<Response> {
    return this.queue.push({ url, config, headers });
  }

  public post(
    url: string,
    config?: ZenRowsConfig,
    { headers = {}, data = {} }: { headers?: Headers; data?: unknown } = {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  ): Promise<Response> {
    const normalizedHeaders = Object.keys(headers).reduce(
      (acc: { [key: string]: string }, key: string) => {
        const value = headers[key];
        if (value !== undefined) {
          if (key.toLowerCase() === "content-type") {
            acc["Content-Type"] = value;
          } else {
            acc[key] = value;
          }
        }
        return acc;
      },
      {},
    );

    return this.queue.push({
      url,
      method: "POST",
      config,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...normalizedHeaders,
      },
      data,
    });
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
    config?: ZenRowsConfig;
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
      if (typeof data === "object") {
        fetchOptions.body = JSON.stringify(data);
      } else {
        fetchOptions.body = String(data);
      }
    }

    const response = await this.fetchWithRetry(
      `${API_URL}?${params.toString()}`,
      fetchOptions,
    );

    return response;
  }
}
