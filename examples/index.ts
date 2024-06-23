/* eslint-disable no-console */

import { ZenRows } from "zenrows";

const apiKey = "YOUR-API-KEY";
const urlLinks = "https://www.scrapingcourse.com/";
const urlPremium = "https://www.google.com/search?q=Ariana+Grande";
const testPost = "https://httpbin.org/anything";

(async () => {
  const client = new ZenRows(apiKey, { concurrency: 5, retries: 1 });

  try {
    const response = await client.get(urlLinks, {
      // autoparse: true,
      js_render: true,
      premium_proxy: true,
      css_extractor: '{"links": "a @href"}',
      // proxy_country: 'us',
    });

    const data = await response.json();

    console.log(data);
  } catch (error) {
    console.error((error as Error).message);
  }

  try {
    const response = await client.get(urlPremium, {
      // autoparse: true,
      css_extractor: '{"stats": "#result-stats", "headers": "#search a > h3"}',
      // js_render: true,
      premium_proxy: true,
      proxy_country: "us",
    });

    const data = await response.json();

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
  } catch (error) {
    console.error((error as Error).message);
  }

  try {
    const urls = [
      "https://httpbin.org/ip",
      "https://httpbin.org/anything",
      "https://ident.me",
    ];

    const promises = urls.map((url) => client.get(url));

    const results = await Promise.allSettled(promises);
    const rejected = results.filter(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    const fulfilled = results.filter(
      (item): item is PromiseFulfilledResult<Response> =>
        item.status === "fulfilled",
    );

    console.log(rejected);
    console.log(fulfilled);
  } catch (error) {
    console.error((error as Error).message);
  }

  try {
    const response = await client.post(
      testPost,
      {},
      {
        data: new URLSearchParams({
          key1: "value1",
          key2: "value2",
        }).toString(),
      },
    );

    const data = await response.json();

    console.log(data);
    /*
            ...
            form: { key1: 'value1', key2: 'value2' },
            ...
        */
  } catch (error) {
    console.error((error as Error).message);
  }
})();
