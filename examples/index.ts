/* eslint-disable no-console */
import axios, { AxiosError } from 'axios';

import { ZenRows } from 'zenrows';

const apiKey = 'YOUR-API-KEY';
const urlLinks = 'https://www.zenrows.com/';
const urlPremium = 'https://www.google.com/search?q=Ariana+Grande';

(async () => {
    const client = new ZenRows(apiKey);

    try {
        const { data } = await client.get(urlLinks, {
            // autoparse: true,
            css_extractor: '{"links": "a @href"}',
            // js_render: true,
            // premium_proxy: true,
            // proxy_country: 'us',
        });

        console.log(data);
    } catch (error: unknown | AxiosError) {
        console.error((error as Error).message);
        if (axios.isAxiosError(error)) {
            console.error(error.response?.data);
        }
    }

    try {
        const { data } = await client.get(urlPremium, {
            // autoparse: true,
            css_extractor: '{"stats": "#result-stats", "headers": "#search a > h3"}',
            // js_render: true,
            premium_proxy: true,
            proxy_country: 'us',
        });

        console.log(data);
        /*
            {
                headers: [
                    'Ariana Grande | Home',
                    'Ariana Grande | Facebook',
                    'Best Ariana Grande Songs: 20 Essential Tracks - uDiscover ...',
                    ...
                ],
                stats: 'About 10,700,000 results (0.48 seconds)'
            }
        */
    } catch (error: unknown | AxiosError) {
        console.error((error as Error).message);
        if (axios.isAxiosError(error)) {
            console.error(error.response?.data);
        }
    }
})();
