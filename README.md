# ZenRows Node.js SDK
SDK to access [ZenRows](https://www.zenrows.com/) API directly from Node.js. We handle proxies rotation, headless browsers, and CAPTCHAs for you.

## Installation
Install the SDK with npm.

```bash
npm install zenrows
```

## Usage
Start using the API by [creating your API Key](https://app.zenrows.com/register?p=free).

The SDK uses [axios](https://axios-http.com/) for HTTP requests. The client's response will be an `AxiosPromise` if using TypeScript, a regular `Promise` otherwise.

```javascript
const { ZenRows } = require('zenrows');

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
