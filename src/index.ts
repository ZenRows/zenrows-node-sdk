import axios, { AxiosPromise, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';

import { VERSION } from './version';

const API_URL = 'https://api.zenrows.com/v1/';

interface ClientConfig {
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

    constructor(apiKey: string, clientConfig: ClientConfig = {}) {
        this.apiKey = apiKey;
        this.clientConfig = clientConfig;
    }

    public get(url: string, config?: Config, { headers = {} }: { headers?: Headers } = {}): AxiosPromise {
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
            params,
            headers: finalHeaders,
        };

        if (headers && Object.keys(headers).length) {
            params.custom_headers = true;
        }

        this.applyRetries();

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
