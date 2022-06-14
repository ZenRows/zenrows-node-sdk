/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosPromise, AxiosRequestConfig, Method } from 'axios';
import axiosRetry from 'axios-retry';
import * as fastq from 'fastq';

import { VERSION } from './version';

const API_URL = 'https://api.zenrows.com/v1/';

interface ClientConfig {
    concurrency?: number;
    retries?: number;
}
interface Config {
    autoparse?: boolean;
    /* eslint-disable camelcase */
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
    /* eslint-enable camelcase */
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

        this.queue = fastq.promise(this, this.worker, this.clientConfig.concurrency ?? 5);

        this.applyRetries();
    }

    public get(url: string, config?: Config, { headers = {} }: { headers?: Headers } = {}): AxiosPromise {
        return this.queue.push({ url, config, headers });
    }

    public post(url: string, config?: Config, { headers = {}, data = {} }: { headers?: Headers, data?: any } = {}): AxiosPromise {
        return this.queue.push({ url, method: 'POST', config, headers, data });
    }

    private worker({ url, method = 'GET', config, headers, data }: { url: string; method?: Method; config?: Config; headers: Headers, data?: any }): AxiosPromise {
        const params = {
            ...config,
            url,
            apikey: this.apiKey,
        };

        const finalHeaders = {
            'User-Agent': `zenrows/${VERSION} node`,
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
