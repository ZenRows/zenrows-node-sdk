/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { ZenRows } = require('zenrows');

const apiKey = 'YOUR-API-KEY';
const urlLinks = 'https://www.zenrows.com/';
const urlPremium = 'https://www.google.com/search?q=Ariana+Grande';

(async () => {
    const client = new ZenRows(apiKey, { retries: 1 });

    try {
        const { data } = await client.get(urlLinks, {
            // autoparse: true,
            css_extractor: '{"links": "a @href"}',
            // js_render: true,
            // premium_proxy: true,
            // proxy_country: 'us',
        });

        console.log(data.links);
        /*
            [
                'https://www.zenrows.com',
                'https://www.zenrows.com/blog',
                ...
            ]
        */
    } catch (error) {
        console.error(error.message);
        if (error.response) {
            console.error(error.response.data);
        }
    }

    try {
        const { data } = await client.get(urlPremium, {
            // autoparse: true,
            css_extractor: '{"aproximate_results": "#result-stats", "headers": "#search a > h3"}',
            // js_render: true,
            premium_proxy: true,
            proxy_country: 'us',
        });

        console.log(data);
        /*
            {
                aproximate_results: 'About 10,700,000 results (0.48 seconds)',
                headers: [
                    'Ariana Grande | Home',
                    'Ariana Grande | Facebook',
                    'Best Ariana Grande Songs: 20 Essential Tracks - uDiscover ...',
                    ...
                ]
            }
        */
    } catch (error) {
        console.error(error.message);
        if (error.response) {
            console.error(error.response.data);
        }
    }
})();
