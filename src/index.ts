import axios, { AxiosPromise, AxiosRequestConfig } from 'axios';

import { VERSION } from './version';

const API_URL = 'https://api.zenrows.com/v1/';

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

    constructor(apiKey: string) {
        this.apiKey = apiKey;
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

        return axios(axiosRequestConfig);
    }
}

export { ZenRows };
