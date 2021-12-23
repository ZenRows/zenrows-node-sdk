# ZenRows Node.js SDK
SDK to access [ZenRows](https://www.zenrows.com/) API directly from Node.js. ZenRows handles proxies rotation, headless browsers, and CAPTCHAs for you.

## Installation
Install the SDK with npm.

```bash
npm install zenrows
```

## Usage
Start using the API by [creating your API Key](https://app.zenrows.com/register?p=free).

The SDK uses [axios](https://axios-http.com/) for HTTP requests. The client's response will be an `AxiosPromise` if using TypeScript, a regular `Promise` otherwise.

It also uses [axios-retry](https://github.com/softonic/axios-retry) to automatically retry failed requests (status code 429 and 5XX). Retries are not active by default; you need to specify the number of retries, as shown below. It already includes an exponential back-off retry delay between failed requests.

```javascript
const { ZenRows } = require('zenrows', { retries: 1 });

const apiKey = 'YOUR-API-KEY';
const url = 'https://www.zenrows.com/';

(async () => {
    const client = new ZenRows(apiKey);

    const { data } = await client.get(url, {
        // Our algorithm allows to automatically extract content from any website
        autoparse: false,

        // CSS Selectors for data extraction (i.e. {"links":"a @href"} to get href attributes from links)
        css_extractor: '',

        // Enable Javascript with a headless browser (5 credits)
        js_render: false,

        // Use residential proxies (10 credits)
        premium_proxy: false,

        // Make your request from a given country. Requires premium_proxy
        proxy_country: '',

        // Wait for a given CSS Selector to load in the DOM. Requires js_render
        wait_for: '.content',

        // Wait a fixed amount of time in milliseconds. Requires js_render
        wait: 2500,

        // Block specific resources from loading, check docs for the full list. Requires js_render
        block_resources: 'image,media,font',

        // Change the browser's window width and height. Requires js_render
        window_width: 1920,
        window_height: 1080,

        // Will automatically use either desktop or mobile user agents in the headers
        device: 'desktop',

        // Will return the status code returned by the website
        original_status: false,
    }, {
        headers: {
            Referrer: 'https://www.google.com',
            'User-Agent': 'MyCustomUserAgent',
        },
    });

    console.log(data);

    /* <!doctype html> <html... */

    // With the CSS selector {"links":"a @href"}
    /*
        {
            links: [
                'https://www.zenrows.com',
                'https://www.zenrows.com/blog',
                ...
            ]
        }
    */
})();
```

You can also pass optional parameters and headers; the list above is a reference. For more info, check out [the documentation page](https://www.zenrows.com/documentation).

Sending headers to the target URL will overwrite our defaults. Be careful when doing it and contact us if there is any problem.

## Examples

Take a look at the [examples directory](./examples) for Javascript and TypeScript files using the SDK.
It has its own package.json file and includes `zenrows` SDK ready to use.
Each file makes two requests, the first with CSS selectors and the second with CSS selectors and premium proxies in the US.

```bash
cd examples
npm install
node index.js # JS example
npx ts-node index.ts # TS example
```

## Contributing
Pull requests are welcome. For significant changes, please open an issue first to discuss what you would like to change.

## License
[MIT](./LICENSE)
