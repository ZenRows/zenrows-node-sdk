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

## Batch API (`ZenRowsBatchClient`)

> **⚠️ Private beta.** The Batch API is currently in private beta and not yet
> generally available. If you'd like access, please
> [contact support](mailto:support@zenrows.com) to have it enabled for your account.

For workflows where you have many URLs to scrape and don't want to manage
retries, concurrency, and pagination yourself, the Batch API submits a *job*
(a list of tasks), runs it asynchronously on ZenRows' infrastructure, and lets
you poll results when they're ready. It ships as a separate client under the
`zenrows/batch` subpath:

```ts
import { ZenRowsBatchClient } from "zenrows/batch";

const client = new ZenRowsBatchClient("YOUR-API-KEY");

// submitRegular takes one params object: a task source (`urls` — bare strings
// or per-task objects — xor `fileInputId`) plus optional job fields.
const job = await client.submitRegular({
  urls: [
    { url: "https://example.com/a", externalId: "order-1" },
    { url: "https://example.com/b", externalId: "order-2" },
  ],
  zenrowsParams: { js_render: "true", premium_proxy: "true" },
});

// job.run.wait() blocks until the current run is terminal, returning its RunHandle.
const run = await job.run.wait();

// results() is an AsyncStream — stream it with .forEach (no buffering)…
await run.results({ status: "successful" }).forEach((row) => {
  console.log(row.externalId, row.status, row.resultUrl);
});

// …or a plain `for await`, whichever you prefer:
for await (const row of run.results({ status: "successful" })) {
  console.log(row.externalId, row.status, row.resultUrl);
}
```

> Need full control over the request body? `client.submitJob({...})` accepts the
> raw (camelCase) wire shape and returns the same `JobRef`.

**References vs. loaded handles.** Resource methods return one of two tiers.
A **ref** (`JobRef` / `RunRef`) — from `client.job(id)` or `submitRegular` — is a
pointer with no data: it carries every operation that needs only the id
(`stop`, `delete`, `rerun`, `addTasks`, `wait`, `results`, downloads, …) and no
network call is made to create it. A **loaded handle** (`JobHandle` / `RunHandle`)
— from `getJob`, `iterJobs`, `ref.load()`, or a waiter — is a ref *plus* a
guaranteed, synchronous `.data` snapshot. There's no "maybe loaded" state and no
nullable `.data`: if you hold a handle, its data is there; if you hold a ref, you
`await ref.load()` to get one.

```ts
const ref = client.job(jobId); // JobRef — no request
await ref.run.stop(); // acts on the id directly
const job = await ref.load(); // JobHandle — now .data is ready
console.log(job.data.status);
```

The client is **fully typed**. Its request/response models are generated from the
backend's OpenAPI spec ([`docs/openapi.yaml`](./docs/openapi.yaml)) via
[`openapi-typescript`](https://openapi-ts.dev/) — run `pnpm generate` to refresh
them — and exposed as camelCase types (`job.jobId`, `run.stats.successful`,
`row.resultUrl`) by a thin mapping layer over the wire's snake_case.

### Upload URLs from a CSV

```ts
const fileInputId = await client.uploadCsv("leads.csv", {
  fields: { url: "Page URL", externalId: "Lead Ref" },
  header: true,
});
const job = await client.submitRegular({ fileInputId });
```

`uploadCsv` allocates the slot, PUTs your file to the presigned URL, and returns
the `fileInputId` — one call instead of three.

### Estimate cost before submitting

Pricing is per successful request (base `1`, `js_render` `5`, `premium_proxy`
`10`, both `25`; `mode=auto` is dynamic `1–25`). `client.estimateCost` answers "if
every URL succeeds once, what's the charge?" — it takes the same body as
`submitJob` and runs entirely client-side, no API call.

```ts
const est = await client.estimateCost({
  status: "closed",
  tasks: [{ url: "https://a" }, { url: "https://b" }],
  zenrowsParams: { js_render: "true" },
});
console.log(String(est)); // "10 credits (2 tasks)"
console.log(est.format()); // per-tier breakdown table
```

### Retry only the failed tasks

After a run finishes with some failures, `retryFailed()` starts a new run that
re-executes *only* the failed tasks — successes are inherited verbatim, so you
don't pay to re-scrape them. Pass `{ includePending: true }` to also pick up
tasks that never started.

```ts
const run = await client.job(jobId).retryFailed(); // no preceding GET
await run.wait();
```

### Download results

```ts
// One file per task, client-side, no size limit (tune with `concurrency`):
await client.job(jobId).run.downloadToDir("./out", { concurrency: 8 });

// Or the whole run as one server-side zip (capped at 1 GiB):
await client.job(jobId).run.downloadAllResults("results.zip");

// A single result — to disk or memory:
for await (const row of run.results({ status: "successful" })) {
  await run.downloadTaskToDir(row, "./out"); // or: const { body } = await run.downloadTaskToMemory(row);
}
```

### The two facets: `job.run` and `job.schedule`

A job carries two sub-facets, matching the API's two scopes. `job.run.*`
operates on the **current run** (`pause`/`resume`/`stop`/`wait`/`results`/
downloads); `job.schedule.*` operates on **scheduled firing**
(`pause`/`resume`/`update`). This disambiguates the API's two distinct "pause"
actions:

```ts
await job.run.pause();       // POST /jobs/{id}/pause          → suspend the live run
await job.run.resume();
await job.schedule.pause();  // POST /jobs/{id}/schedule/state → skip future fires
await job.schedule.resume();
```

For a *specific historical* run, use `client.run(jobId, runId)` — a `RunRef`
with read/download ops (no `pause`/`stop`, since the API only pauses the
current run).

### Scheduled jobs & webhooks

Schedules are plain, type-checked objects — a discriminated union of the four
shapes the API supports (`{ every }` interval, `{ at, tz }` one-shot,
`{ times, tz }` daily, `{ times, days, tz }` weekly, `{ times, dates, tz }`
monthly). The compiler enforces exactly one shape and a required `tz`; the
`every` duration (`"6h"`, `"15m"`, `"1d"`) is validated at compile time.

```ts
const job = await client.submitScheduled({
  schedule: { every: "6h" },
  urls: ["https://example.com"],
  webhook: { url: "https://hooks.example.com/zr", signature: true },
});
await job.schedule.pause(); // stop firing (schedule keeps ticking)
await job.schedule.resume(); // fire again
await job.schedule.update({ times: ["09:00"], days: ["mon", "fri"], tz: "Europe/Berlin" });
```

### Timeouts & retries

Transient failures (`429`, `502`, `503`, `504`, and network errors) are retried
automatically with jittered exponential backoff, honoring `Retry-After`. Retries
apply only to **idempotent** requests — `GET`/`PUT`/`DELETE`, plus `POST`s that
carry an `idempotencyKey` (submit / rerun) — so nothing with side effects is
replayed. Tune via the constructor:

```ts
const client = new ZenRowsBatchClient("YOUR-API-KEY", {
  timeout: 30_000, // per-request, ms
  retries: 3, // 0 disables
});
```

### Error handling

Every non-2xx surfaces as `BatchApiError`; the `code` property carries the stable
code from the RFC 7807 body (`not_found`, `file_input_not_found`, etc.).

```ts
import { BatchApiError } from "zenrows/batch";

try {
  await client.getJob("does-not-exist");
} catch (err) {
  if (err instanceof BatchApiError && err.code === "not_found") {
    // ...
  } else {
    throw err;
  }
}
```

Runnable end-to-end samples for every feature live in
[`examples/batch`](./examples/batch), and the full generated API reference is in
[`docs/reference`](./docs/reference).

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
