/* eslint-disable @typescript-eslint/no-var-requires, no-console */
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const urlLinks = "https://www.scrapingcourse.com/";
const urlPremium = "https://www.google.com/search?q=Ariana+Grande";
const testPost = "https://httpbin.org/anything";

(async () => {
  const client = new ZenRows(apiKey, { concurrency: 5, retries: 1 });

  try {
    const response = await client.get(urlLinks, {
      css_extractor: '{"links": "a @href"}',
      js_render: true,
      premium_proxy: true,
    });

    const data = await response.json();

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
    const response = await client.get(urlPremium, {
      // autoparse: true,
      css_extractor:
        '{"aproximate_results": "#result-stats", "headers": "#search a > h3"}',
      // js_render: true,
      premium_proxy: true,
      proxy_country: "us",
    });

    const data = await response.json();

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

  try {
    const urls = [
      "https://api.ipify.org",
      "https://httpbin.org/ip",
      "https://httpbin.org/anything",
      "https://ident.me",
    ];

    const promises = urls.map((url) => client.get(url));

    const results = await Promise.allSettled(promises);
    const rejected = results.filter(({ status }) => status === "rejected");
    const fulfilled = results.filter(({ status }) => status === "fulfilled");

    console.log(rejected);
    console.log(fulfilled);
  } catch (error) {
    console.error(error.message);
    if (error.response) {
      console.error(error.response.data);
    }
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
    console.error(error.message);
    if (error.response) {
      console.error(error.response.data);
    }
  }
})();
