# ZenRows Node.js SDK

SDK to access [ZenRows](https://www.zenrows.com/) API directly from Node.js. ZenRows handles proxies rotation, headless browsers, and CAPTCHAs for you.

## Installation

Install the SDK with your package manager of choice.

```bash
npm install zenrows
yarn add zenrows
pnpm install zenrows
bun install zenrows
```

## Usage

Start using the API by [creating your API Key](https://app.zenrows.com/register?p=free).

The SDK uses the official [fetch api](https://nodejs.org/dist/latest-v18.x/docs/api/globals.html) for HTTP requests. The client's response will be a [`Response`](https://nodejs.org/dist/latest-v18.x/docs/api/globals.html#response).

It also uses [fetch-retry](https://github.com/jonbern/fetch-retry) to automatically retry failed requests (status code 429 and 5XX). Retries are not active by default; you need to specify the number of retries, as shown below. It already includes an exponential back-off retry delay between failed requests.

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const url = "https://www.zenrows.com/";

(async () => {
  const client = new ZenRows(apiKey, { retries: 1 });

  const response = await client.get(
    url,
    {
      // Our algorithm allows to automatically extract content from any website
      autoparse: false,

      // CSS Selectors for data extraction (i.e. {"links":"a @href"} to get href attributes from links)
      css_extractor: "",

      // Enable Javascript with a headless browser (5 credits)
      js_render: false,

      // Use residential proxies (10 credits)
      premium_proxy: false,

      // Make your request from a given country. Requires premium_proxy
      proxy_country: "",

      // Wait for a given CSS Selector to load in the DOM. Requires js_render
      wait_for: ".content",

      // Wait a fixed amount of time in milliseconds. Requires js_render
      wait: 2500,

      // Block specific resources from loading, check docs for the full list. Requires js_render
      block_resources: "image,media,font",

      // Change the browser's window width and height. Requires js_render
      window_width: 1920,
      window_height: 1080,

      // Will automatically use either desktop or mobile user agents in the headers
      device: "desktop",

      // Will return the status code returned by the website
      original_status: false,
    },
    {
      headers: {
        Referrer: "https://www.google.com",
        "User-Agent": "MyCustomUserAgent",
      },
    }
  );

  // You can also use response.json() if you're expecting JSON data.
  const data = await response.text();

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

### POST Requests

The SDK also offers POST requests by calling the `client.post` method. It can receive a new parameter `data` that represents the data sent in, for example, a form.

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const url = "https://httpbin.org/anything";

(async () => {
  const client = new ZenRows(apiKey, { retries: 1 });

  const response = await client.post(
    url,
    {
      // The same params as in GET requests
    },
    {
      data: new URLSearchParams({
        key1: "value1",
        key2: "value2",
      }).toString(),
    }
  );

  const data = await response.json();

  console.log(data);
  /*
        ...
        form: { key1: 'value1', key2: 'value2' },
        ...
    */
})();
```

### Concurrency

To limit the concurrency, it uses [fastq](https://github.com/mcollina/fastq), which will simultaneously send a maximum of requests. The concurrency is determined by the plan you are in, so take a look at the [pricing](https://www.zenrows.com/pricing) and set it accordingly. Take into account that each client instance will have its own limit, meaning that two different scripts will not share it, and 429 (Too Many Requests) errors might arise.

We use [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled) in the example below, available from Node 12.9. It will wait for all the promises to finish, and the results are objects with a status marking them as fulfilled or rejected. The main difference with `Promise.all()` is that it won't fail if any requests fail. It might make your scraping more robust since the whole list of URLs will run, even if some of them fail.

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";

(async () => {
  const client = new ZenRows(apiKey, { concurrency: 5, retries: 1 });

  const urls = [
    "https://www.zenrows.com/",
    // ...
  ];

  const promises = urls.map((url) => client.get(url));

  const results = await Promise.allSettled(promises);
  console.log(results);
  /*
    [
        {
            status: 'fulfilled',
            value: {
                status: 200,
                statusText: 'OK',
                data: `<!doctype html> <html lang="en"> <head> ...
            
        ...
    */

  // separate results list into rejected and fulfilled for later processing
  const rejected = results.filter(({ status }) => status === "rejected");
  const fulfilled = results.filter(({ status }) => status === "fulfilled");
})();
```

#### An important note about Promise.allSettled() on TypeScript

`Promise.allSettled()` does not narrow the type of the array elements in the callback function. This means that you will need to cast the type of the array elements to `PromiseSettledResult<Response>` to access the `status` and `value` properties.

```typescript
const promises = urls.map((url) => client.get(url));

const results = await Promise.allSettled(promises);

const fulfilled = results
  .filter(
    (item): item is PromiseFulfilledResult<Response> =>
      item.status === "fulfilled"
  )
  .map((item) => item.value.json());
```

## Examples

Take a look at the [examples directory](./examples) for Javascript and TypeScript files using the SDK.
It has its own package.json file and includes `zenrows` SDK ready to use.
Each file makes two requests, the first with CSS selectors and the second with CSS selectors and premium proxies in the US.

```bash
cd examples
npm install
node index.js # JS example
npx tsx index.ts # TS example
```

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss what you would like to change.

## License

[MIT](./LICENSE)
