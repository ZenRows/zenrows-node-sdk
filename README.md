<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo/dark.svg"/>
        <img alt="Zenrows Logo" src=".github/assets/logo/light.svg" width="300" />
    </picture>
</p>

# Zenrows Node.js SDK

SDK to access [Zenrows](https://www.zenrows.com/) API directly from Node.js. Zenrows handles proxies rotation, headless browsers, and CAPTCHAs for you.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Retries](#retries)
  - [Adaptive Stealth Mode](#adaptive-stealth-mode)
  - [POST Requests](#post-requests)
  - [Extract](#extract)
    - [Preparing a domain](#preparing-a-domain)
  - [Batch](#batch)
    - [Results and retention](#results-and-retention)
    - [Failed runs and extensible values](#failed-runs-and-extensible-values)
    - [Errors and retries](#errors-and-retries)
    - [Webhooks](#webhooks)
    - [Extract in a batch](#extract-in-a-batch)
  - [Crawl](#crawl)
  - [Concurrency](#concurrency)
    - [An important note about Promise.allSettled() on TypeScript](#an-important-note-about-promiseallsettled-on-typescript)
- [Examples](#examples)
- [Contributing](#contributing)
  - [Running the Crawl e2e test](#running-the-crawl-e2e-test)
  - [Releases](#releases)
- [License](#license)

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

The client retries failed requests by default. See [Retries](#retries) for what it retries and how long it waits.

> `client.fetch()` is the primary method for the main page-scraping product. `client.get()` still works and is kept as a deprecated alias — new code should call `fetch()`.

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const url = "https://www.zenrows.com/";

(async () => {
  const client = new ZenRows(apiKey, { retries: 1 });

  const response = await client.fetch(
    url,
    {
      // Deprecated: general-purpose JSON from any page. Use client.extract() (see Extract below) or `css_extractor` instead
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

### Retries

`fetch()`, `get()` and `extract()` retry failed requests through [fetch-retry](https://github.com/jonbern/fetch-retry). `post()` never retries. `client.batch` and `client.crawl` keep their own retry rules, described in their sections. `prepareDomain()` and `preparedDomainStatus()` never retry: they send one request and reject on an error answer (see [Preparing a domain](#preparing-a-domain)).

What the client retries:

1. Status codes 429, 502, 503 and 504. The API does not charge for them.
2. A `422`, except one with `code: "no_data_extracted"`. That one is a final answer (see [Extract](#extract)).
3. A failure before the request reached the API: connection refused, a name that does not resolve, an unreachable network or host, or a connect timeout.

What the client never retries:

1. Any other status, `500` included.
2. A connection reset or close after the request was sent, a response timeout, or an abort. The API may still finish that request and charge it.
3. An error in the request itself, such as an invalid header value.

Which calls the client retries:

1. `fetch()`, `get()` and `extract()`: always.
2. `post()`: never. The client sends a `post()` once, whatever its headers, the status or the failure. The API forwards the body to the target, and the target may act on it twice.
3. The API does not dedupe a `post()` on an `Idempotency-Key` header, so the client does not retry on one.
4. If you need to retry a `post()`, write the retry yourself.

How long the client waits between tries:

1. When the API sends `Retry-After` in whole seconds, the client waits that long, at least 0.25 seconds and at most 30 seconds. `retryMaxWait` does not change this cap. The client ignores any other `Retry-After` format, such as an HTTP date.
2. Otherwise it waits a random time between 0.25 seconds and `max(0.25, min(retryMaxWait, 2^attempt))` seconds (full jitter). `attempt` counts from 0, so the first retry waits 0.25 to 1 second, the second 0.25 to 2 seconds.

Options, checked when you build the client (an invalid value throws a `RangeError`):

1. `retries`: retries after the first try, an integer of 0 or more. Default `2`. Set `retries: 0` to send every request once.
2. `retryMaxWait`: the longest one random wait may be, in seconds, greater than 0. Default `30`.
3. `retryBudget`: in seconds, greater than 0. Default `90`: no retry starts after 90 s. The client counts from the start of the first try, and includes the wait before the retry. The budget does not cut a running try short, so a call can take longer than the budget by one try.

The client takes no `AbortSignal`, so you cannot cancel a call while it waits between tries. To bound a call's time, lower `retries` or `retryBudget`.

### Adaptive Stealth Mode

Set `mode: "auto"` to let Zenrows pick the request configuration for you — it starts with the cheapest viable setup and escalates to `js_render`/`premium_proxy` only when the target needs it, billing only for the configuration that succeeds.

```javascript
const response = await client.get(url, { mode: "auto" });
```

Compatible with `proxy_country`, `js_instructions`, and `custom_headers`.

### POST Requests

The SDK also offers POST requests by calling the `client.post` method. It can receive a new parameter `data` that represents the data sent in, for example, a form.

The client sends a `post()` once and never retries it, whatever `retries` says. See [Retries](#retries).

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const url = "https://httpbin.org/anything";

(async () => {
  const client = new ZenRows(apiKey);

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

### Extract

[Extract](https://docs.zenrows.com/extract/introduction) runs a page through Zenrows' AI-powered structured extraction instead of returning raw HTML. Use `client.extract()` — it's the same request as `fetch()`, with the `extract` param set for you (defaults to `"auto"`; pass `"native"` or `"standard"` for the other contracts).

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";
const url = "https://www.zenrows.com/";

(async () => {
  const client = new ZenRows(apiKey);

  const response = await client.extract(url); // extract: "auto"
  // const response = await client.extract(url, { extract: "native" });

  const data = await response.json();
  console.log(data);
})();
```

`extract()` also sends [Adaptive Stealth Mode](https://docs.zenrows.com/fetch/features/adaptive-stealth-mode) (`mode: "auto"`) by default, except when you set `js_render` or `premium_proxy`: the API rejects either combined with Adaptive Stealth Mode, so your fixed configuration is sent as is. Pass `adaptiveStealth: false` to turn it off entirely.

Extract works on any prepared domain (you can prepare one yourself with `POST /v1/extract/prepared-domains`). A `403` with `code: "REQS007"` means Extract can't extract this page. Check `reason` in the problem body when present; older responses may not carry it:

- `domain_not_prepared`: prepare the domain with `client.prepareDomain()` (see below), poll `client.preparedDomainStatus()` until `status` is `"ready"`, then retry.
- `page_not_recognised`: the domain is served, but this page isn't one Extract extracts (a home, search, login or category page). Try a product, article or listing page, or retry once in a few minutes. Preparing the domain again changes nothing.
- `domain_not_enabled`: preparing doesn't help. Use `css_extractor`, or contact support.

```javascript
const response = await client.extract(url);
if (response.status === 403) {
  const problem = await response.json();
  if (problem.code === "REQS007") {
    switch (problem.reason) { // undefined on older responses
      case "domain_not_prepared":
        // client.prepareDomain(...), then poll client.preparedDomainStatus(...)
        break;
      case "page_not_recognised":
        // try a product, article or listing page
        break;
      case "domain_not_enabled":
        // use css_extractor, or contact support
        break;
    }
  }
}
```

The legacy `402` with `code: "AUTH010"` means the domain isn't enabled. `extract()` returns both error responses to you as is, in one request, and never retries them with autoparse. `fallbackToAutoparse` is deprecated and has no effect; passing `true` emits a `DeprecationWarning` once per process.

#### Preparing a domain

`client.prepareDomain(domain, exampleUrls)` submits a domain for Extract (`POST /v1/extract/prepared-domains`), and `client.preparedDomainStatus(domain)` reads where it is (`GET /v1/extract/prepared-domains/{domain}`). Both resolve to the parsed status object. Pass the domain without a scheme and 1 to 5 example URLs, one per kind of page you want to extract. These calls cost no credits.

Preparation takes minutes, and the client does not wait for it. Poll the status until it is no longer `"preparing"`:

```javascript
import { ZenRows, ZenRowsPreparedDomainError } from "zenrows";

const client = new ZenRows("YOUR-API-KEY");

try {
  let status = await client.prepareDomain("www.scrapingcourse.com", [
    "https://www.scrapingcourse.com/ecommerce/",
  ]);
  while (status.status === "preparing") {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    status = await client.preparedDomainStatus("www.scrapingcourse.com");
  }
  console.log(status.status); // "ready" or "failed" (see status.failure)
} catch (error) {
  if (error instanceof ZenRowsPreparedDomainError) {
    // e.g. 409 in_progress, 429 out_of_allowance, 503 overloaded
    console.error(error.status, error.code, error.detail);
  }
  throw error;
}
```

They don't go through the client's queue or its `retries`, and an empty `domain` rejects with a `TypeError` before any request.

Both methods reject with `ZenRowsPreparedDomainError` on an error answer, with `status`, `code` (`invalid_argument`, `not_found`, `in_progress`, `out_of_allowance`, `overloaded`, `disabled`, ...), `detail`, `reason`, `retryAfter` and the whole `problem` body. See the [Extract endpoints docs](https://docs.zenrows.com/extract/endpoints) for every status and failure code.

A `422` with `code: "no_data_extracted"` means Extract knows this kind of page but found no data on it. It isn't charged, and the client never retries it, even with `retries` set. `isNoDataExtracted(response)` tells you when you got one. See the [Extract docs](https://docs.zenrows.com/extract/setup).

### Batch

The [Batch API](https://docs.zenrows.com/batch/introduction) runs many URLs asynchronously as a job, and is reachable via `client.batch`. A job is either a one-shot batch where every task is known upfront (`submitRegular()`), or **open** (`submitOpen()`): it keeps accepting tasks via `addTasks()` until you close it, which is useful when you're streaming URLs in over time. Batch costs the same credits as the regular API.

`submitRegular()`, `submitOpen()` and `submitScheduled()` return a `JobRef`. Work with the job through it: `job.addTasks()`, `job.close()`, `job.rerun()`, `job.retryFailed()`, `job.delete()`, and the current run under `job.run` (`wait()`, `results()`, `downloadToDir()`, `stop()`, `pause()`, `resume()`).

```ts
import { ZenRows } from "zenrows";

const client = new ZenRows("YOUR-API-KEY");

// One-shot batch: every task known upfront. Strings and { url, ... } objects both work.
const job = await client.batch.submitRegular(
  [
    "https://example.com/1",
    { url: "https://example.com/2", external_id: "page-2" },
    // A POST task: `method` plus a `body` (a JSON value or a string, up to 16 KiB).
    { url: "https://example.com/search", method: "POST", body: { q: "shoes" } },
  ],
  undefined,
  // A retried submit with the same key returns the first job instead of creating another.
  { idempotencyKey: "catalog-2026-10-16" },
);

// Wait for the run to end, then read its results.
const run = await job.run.wait();
if (run.status === "failed") {
  // The run stopped for an account reason, such as running out of credits.
  console.log(run.data.failure_reason, run.data.failure_detail);
}
for await (const row of job.run.results({ status: "successful" })) {
  console.log(row.task_id, row.url, row.status, row.result_url);
}

// Or save every successful result to disk. Rows with no body to fetch (an `expired` result,
// or a `failed` task) are skipped and passed to `onSkip`.
const saved = await job.run.downloadToDir("./results", {
  onSkip: (row) => console.log("skipped", row.taskId, row.status),
});
console.log(`saved ${saved} files`);

// Retry only the tasks that failed, inheriting the rest from the previous run. With no
// failed task there is nothing to retry: the API answers 409 `no_matching_tasks`.
if (run.stats.failed > 0) {
  const retry = await job.retryFailed({ waitForIngest: true });
  await retry.wait();
}

// Streaming batch: keep the job open, add tasks as they arrive, close with the last call.
const streaming = await client.batch.submitOpen();
// With an idempotencyKey, a retried call adds its tasks once, so the SDK retries it safely.
await streaming.addTasks([{ url: "https://example.com/3" }], { idempotencyKey: "chunk-1" });
await streaming.addTasks([{ url: "https://example.com/4" }], {
  idempotencyKey: "chunk-2",
  lastBatch: true,
});

// Pick up an existing job later by its id.
const sameJob = await client.batch.getJob(job.jobId);
console.log(sameJob.status, sameJob.data.latest_run?.stats);
```

The client also wraps the rest of the API:

- Jobs and runs: `getJob()`, `listJobs()` / `iterJobs()`, `job.runs()`, `getRun()`, `run(jobId, runId).delete()`, `waitForRun()`.
- Results: `getResults()` / `iterResults()`, `downloadToMemory()`, `downloadTaskToFile()`, `downloadTaskToMemory()`, `getTaskHistory()`, `getTaskContent()` (the content as text) and `getTaskContentBytes()` (a `Buffer`). Text decoding corrupts binary bodies, so read a `pdf` or other binary result with `getTaskContentBytes()`.
- Scheduling: `submitScheduled()` with the `At`, `Rate` and `Calendar` builders, and `job.schedule.pause()` / `resume()` / `update()`.
- Webhooks: `job.getWebhook()`, `job.setWebhook(url, signature)`, `putJobWebhook()`, `job.deleteWebhook()`, `testWebhook()`, and `verifyWebhookSignature()` for your receiver (see [Webhooks](#webhooks)).
- HMAC signing keys: `listHmacKeys()`, `rotateHmacKey()`, `finalizeHmacKey()`, `cancelHmacRotation()`.
- CSV task uploads: `uploadCsv()`, then `submitRegular(undefined, fileInputId)`.
- Results exports: `job.run.startExport()`, `waitForExport()`, `downloadAllResults()`.
- Cost: `estimateCost(tasks, zenrowsParams)` prices each task on the job params overlaid with its own `zenrows_params`, locally, with no API call. A flag counts as on only when it is `true` or `"true"`, the values the API accepts.

A submit of 10,000 tasks or more, and every rerun, returns while the API is still writing the run's task rows (`ingest_status: "pending"`). Pass `waitForIngest: true` to `submitRegular()`, `submitOpen()`, `rerun()` or `retryFailed()` to resolve only once the rows are written; until then `results()` can be partial. A scheduled submit (`submitScheduled()`) creates no run: it stores the task template, and the first run starts when the schedule fires.

#### Results and retention

A result's `result_url` is valid for 2 hours. To get a fresh one, list the results again or read the content with `getTaskContent()`. Results are kept for 14 days by default. After that a successful task comes back with `status: "expired"` and no `result_url`, and `getTaskContent()` throws a `ZenRowsBatchError` with status 410 and code `result_expired`. A `status: "successful"` filter still matches expired rows, which is why the bulk downloads skip them.

#### Failed runs and extensible values

A run that stops for an account reason ends `failed`, with `failure_reason` (`insufficient_credits`, `subscription_inactive` or `api_key_cap_reached`) and a human-readable `failure_detail`. `job.run.wait()` resolves with that run; pass `failureStatuses: new Set(["failed"])` to make it throw instead. A paused run makes no progress until it is resumed, so the wait stops at once and throws a `RunPausedError` whose `run` is the paused run; pass `waitWhilePaused: true` to keep polling, for example when another process will resume it. A wait that runs out of time throws a `WaiterTimeoutError`.

```ts
import { ZenRowsBatchClient } from "zenrows";

const batch = new ZenRowsBatchClient("YOUR-API-KEY");
const run = await batch.getRun("YOUR-JOB-ID", "YOUR-RUN-ID");
if (run.data.failure_reason === "api_key_cap_reached") console.log(run.data.failure_detail);
```

Enum-valued fields on responses (run, job, task and export `status`, `ingest_status`, `failure_reason`, run `trigger`) are typed `Extensible<...>`: the known values plus any `string`, because the server may add values. The exported named types (`RunStatus`, `JobStatus`, `TaskStatus`, `ExportStatus`, `IngestStatus`, `RunFailureReason`, `RunTrigger`) stay closed, so they still work as request input. Give switches on these fields a default branch; an exhaustive `switch` that assigns the leftover to `never` no longer compiles.

#### Errors and retries

A non-2xx answer throws a `ZenRowsBatchError` with `status`, `code`, `detail` and `retryAfter` (seconds, when the API sent `Retry-After`). `BatchErrorCode` names every code, so you can branch without bare strings:

```ts
import { BatchErrorCode, ZenRowsBatchClient, ZenRowsBatchError } from "zenrows";

const batch = new ZenRowsBatchClient("YOUR-API-KEY");
try {
  await batch.submitRegular(["https://example.com"]);
} catch (error) {
  if (!(error instanceof ZenRowsBatchError)) throw error;
  switch (error.code) {
    case BatchErrorCode.PaymentRequired: // 402: the account is out of credits
    case BatchErrorCode.SubscriptionInactive: // 401: the subscription is not active
      console.log("Check Billing in your dashboard:", error.detail);
      break;
    case BatchErrorCode.ApiKeyCapReached: // 402: `detail` names the cap and when it resets (UTC)
      console.log(error.detail);
      break;
    case BatchErrorCode.QuotaExceeded: // 429: an account limit, see below
      console.log("Wait for a job to finish, or delete one:", error.detail);
      break;
    default:
      throw error;
  }
}
```

`quota_exceeded` means one of the account limits: 3 active jobs (shared with Crawl), 5 scheduled jobs, or 100,000 tasks in an open job. It clears only when a job finishes or is deleted, so the client never retries it. Other transient failures (network errors, 502, 503, 504, and any other 429) are retried up to `retries` times (default 3) with backoff, on reads and on the POSTs that carry an `idempotencyKey`: submit, rerun and `addTasks()`. The API keeps a key for 24 hours: the same key with the same body returns the original answer, and the same key with a different body is a 409 `idempotency_key_conflict`.

#### Webhooks

A job with a webhook gets one event when a run completes (`run.completed`) or fails on its own (`run.failed`, for example when the account runs out of credits). The event carries the run's stats, see the `WebhookEvent` type. Stopping a run yourself sends no event. A delivery that fails or takes longer than 10 seconds is retried with backoff for up to 3 days, so the same event can arrive more than once: deduplicate on the `X-ZenRows-Event-Id` header.

With `signature: true`, each delivery has an `X-Signature` header, `t=<unix seconds>,v1=<hex>,kid=<key id>`. `verifyWebhookSignature()` checks it against the secret `rotateHmacKey()` returned (base64, shown once), and rejects deliveries more than 5 minutes old by default. During a key rotation, pass both key ids in `secrets`; the header's `kid` picks the one to check. Pass the raw body, before any JSON parsing:

```ts
import { createServer } from "node:http";
import {
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type WebhookEvent,
  verifyWebhookSignature,
} from "zenrows";

// The `kid` and base64 `secret` that rotateHmacKey() returned. Load them from your secret store.
const secrets = { "YOUR-KEY-ID": "YOUR-BASE64-SECRET" };

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const signature = req.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()];
    if (typeof signature !== "string" || !verifyWebhookSignature(body, signature, secrets)) {
      res.writeHead(401).end();
      return;
    }
    const event = JSON.parse(body.toString("utf8")) as WebhookEvent;
    console.log(req.headers[WEBHOOK_EVENT_ID_HEADER.toLowerCase()], event.event_type, event.stats);
    res.writeHead(204).end();
  });
}).listen(3000);
```

Changing a webhook with `putJobWebhook(jobId, { url, signature })`: pass `signature` every time. If you leave it out, the SDK reads the job's current setting and sends it back, so changing only the URL keeps signing as it was; that is a read then a write, so a change someone else makes in between is overwritten.

#### Extract in a batch

Set `extract` in the batch params to run tasks through Extract: structured data instead of raw HTML. It works job-wide or per task, and per-task values win on collision. `extract_fields` is accepted the same way.

```ts
import { ZenRowsBatchClient } from "zenrows";

const batch = new ZenRowsBatchClient("YOUR-API-KEY");
const job = await batch.submitRegular(
  [
    // Inherits the job-level params below.
    { url: "https://example.com/products", external_id: "p1" },
    // Overrides them for this task only.
    { url: "https://example.com/raw", zenrows_params: {} },
  ],
  undefined,
  { zenrowsParams: { extract: "auto" } },
);
console.log(job.jobId);
```

An Extract task's result carries two keys: `html` (the raw page) and `parsed` (the structured data). `estimateCost` prices it like a regular task.

The batch client (`ZenRowsBatchClient`) also works standalone, without a `ZenRows` instance, matching the Go and Python SDKs' batch clients:

```ts
import { ZenRowsBatchClient } from "zenrows";

// Both settings are optional. `timeout` is seconds per API request (default 30).
const batch = new ZenRowsBatchClient("YOUR-API-KEY", {
  baseURL: "https://async.api.zenrows.com/v1",
  timeout: 30,
});
console.log(batch.apiKey.length > 0);
```

### Crawl

[Crawl](https://docs.zenrows.com/crawl/introduction) (new) takes one start URL and returns the URLs behind it, and is reachable via `client.crawl`. It follows the links on each page up to `depth` hops; without `depth` it has no depth limit and follows links until `maxPages` or `maxItems` stops it (each defaults to 100), or no link is left to open. A crawl stays on the start URL's registrable domain; subdomains count. A crawl runs asynchronously: `create()` returns at once, `wait()` polls until it ends, and `results()` reads the URLs it kept. With `outputFormat: "html"` it also fetches each kept page, which you read with `content()` or all at once with `download()`.

Crawl is still evolving: new features are coming, limits may be tuned, and the changelog announces each change.

```javascript
const { ZenRows } = require("zenrows");

const apiKey = "YOUR-API-KEY";

(async () => {
  const client = new ZenRows(apiKey);

  const crawl = await client.crawl.create({
    url: "https://www.scrapingcourse.com/ecommerce/",
    depth: 1, // link hops from the start URL; omit for no depth limit
    maxItems: 10, // stop once this many URLs are kept
    maxPages: 20, // stop once this many pages are fetched; bounds the cost
    includePatterns: ["/product/"], // keep only URLs containing one of these
    outputFormat: "html", // omit for URLs only
  });

  const ended = await client.crawl.wait(crawl.crawl_id); // completed, stopped, failed, or running on timeout
  if (ended.status === "failed") throw new Error(ended.error?.detail);
  // Out of credits or at the key's cap: stopped, with error set. What it fetched stays readable.
  if (ended.status === "stopped" && ended.error) console.warn(ended.error.detail);

  for await (const result of client.crawl.results(crawl.crawl_id)) {
    console.log(result.url);
    if (result.content_status === "fetched") {
      const html = await client.crawl.content(crawl.crawl_id, result);
    }
  }

  // Or every result, with its page, as parsed NDJSON lines.
  const download = await client.crawl.download(crawl.crawl_id);
  console.log(download.status); // from X-Crawl-Status; "running" means more lines may come later
  for await (const line of download.lines) {
    console.log(line.url, line.content);
  }
})();
```

`client.crawl` also exposes `get()` (status, coverage and one page of results), `list()` (one page of the account's crawls, newest first, with `next_cursor` until the last page), and `stop()` (idempotent; a crawl that already ended answers as it ended). `create()` takes an `idempotencyKey` option, so a retried create does not start a second crawl.

`results()` does not poll. On a running crawl it yields only what the crawl has kept so far, then returns. Call `wait()` first to read every result. `wait()` polls for up to `timeout` seconds (default 600). When the time runs out, it returns the crawl with status `running` and does not throw; the crawl keeps running.

Errors throw a `ZenRowsCrawlError` with `status`, `code`, `detail` and `retryAfter`. `code` is undefined when the error body has no code. Branch on `status` and `code`:

- `400` `invalid_request` / `unknown_parameter` / `invalid_cursor`.
- `403` `REQS008`: Crawl is not enabled for this account.
- `404` `crawl_not_found` / `content_not_found`.
- `409` `idempotency_request_in_flight`: a request with the same `idempotencyKey` is still running. Retry after it finishes.
- `422` `invalid_parameter` / `invalid_start_url` / `domain_not_allowed`: `detail` names the problem. `422` `idempotency_key_reused`: the key was used with a different body. Use a new key or no key; do not retry as is.
- `429` `too_many_crawls`: the account has reached its limit of active jobs (3 by default), shared with its Batch jobs. Nothing was created. `create()` never retries it; retry after `error.retryAfter` seconds.
- `503` `crawl_busy`: the stop could not be saved yet; the crawl is still running. Repeating the stop is safe, so `stop()` retries it, and any other 429, 502, 503 or 504, up to `retries` times, waiting `error.retryAfter` seconds (at most 30, or 1 when the header is missing), then throws the last error.

`content()` takes a content id, a `content_url` or a result, and throws a `TypeError` when it cannot read a content id from it. Requests retry network errors and 502/503/504 (and 429 on reads) when it is safe; a `create()` is retried only with an `idempotencyKey`, and a `stop()` as described above.

`outputFormat` takes `"html"`; without it a crawl returns URLs only. `maxPages` and `maxItems` default to 100 each. A crawl created without `depth` has no `depth` field; one created with it echoes it. Response enum fields (`status`, `stop_reason`, `error.code`, `content_status`) are `Extensible<...>`: the known values plus any `string`. A crawl whose pages held nothing new to follow (no link, only links to other sites, or only links the patterns reject) ends `completed` with no results and no `error`: check the patterns against the URLs the start page links to. A failed crawl carries `error.code` and `error.detail`. So does a crawl that ran out of credits, or whose API key hit a credit cap: it ends `stopped`, with `error.code` `insufficient_credits` or `api_key_cap_reached` and no `stop_reason`, and the pages it fetched before that stay readable. A download line's `content` is a string, or an object for a crawl that returns JSON.

The crawl client (`ZenRowsCrawlClient`) also works standalone. Both forms take the same options:

```javascript
const { ZenRows, ZenRowsCrawlClient } = require("zenrows");

// All options are optional. timeout is in seconds and applies to each HTTP request, not to reading a download.
const options = { baseURL: "https://api.zenrows.com/v1", retries: 3, timeout: 30 };
const crawl = new ZenRowsCrawlClient(apiKey, options);
const client = new ZenRows(apiKey, { crawl: options }); // client.crawl uses them
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

  const promises = urls.map((url) => client.fetch(url));

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
const promises = urls.map((url) => client.fetch(url));

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

Before opening a pull request, run `pnpm check` and `pnpm test -- --run`. Neither touches the network.

### Running the Crawl e2e test

`tests/e2e/crawl.e2e.test.ts` runs a small real crawl (depth 1, up to 3 items and 5 pages, HTML output) and checks every Crawl method against the live API. It is skipped unless `ZENROWS_API_KEY` and `ZENROWS_E2E_CRAWL_URL` are set:

- `ZENROWS_API_KEY`: a key with Crawl access. Keep it out of your shell history, e.g. read it from a file.
- `ZENROWS_CRAWL_BASE_URL` (optional): the API base. Default `https://api.zenrows.com/v1`. Point it at a local or staging deployment to test that instead.
- `ZENROWS_E2E_CRAWL_URL`: the start URL to crawl, a site you may crawl whose start page links to at least one page.
- `ZENROWS_E2E_CRAWL_INCLUDE` (optional): an include pattern, e.g. `/product/`. When set, the crawl keeps only matching URLs and the test asserts every result contains it.

```bash
export ZENROWS_API_KEY="$(cat path/to/key-file)"
export ZENROWS_E2E_CRAWL_URL=https://www.scrapingcourse.com/ecommerce/
export ZENROWS_E2E_CRAWL_INCLUDE=/product/
pnpm test:e2e
```

The run creates one crawl on the account and uses up to a few pages of credits. If the account has reached its limit of active jobs, the test waits and retries (up to 5 minutes).

### Releases

Merge PRs with Conventional Commit titles, for example `fix(crawl): ...` or
`feat(batch): ...`. `fix`, `feat` and `perf` need a scope.

After each merge to `main`, release-please opens or updates the PR
`chore: release X.Y.Z`. It sets the version in `package.json`. Do not change
it by hand.

To release, merge that PR. The workflow runs the checks, creates the tag
`vX.Y.Z` and the GitHub release, and publishes to npm.

To publish an existing tag again, run the Release workflow by hand from
`main` with that tag.

#### If the checks fail after the release PR is merged

The release PR runs CI like any other PR. After you merge it, the release
run checks the code again before it tags and publishes. If that check
fails, `main` already has the new version, but there is no tag, and the
merged release PR keeps the `autorelease: pending` label, which blocks the
next release PR. To recover:

1. Fix the problem in a normal PR and merge it.
2. Create the release on that fix commit, with the version from
   `.release-please-manifest.json`:
   `gh release create vX.Y.Z --target <fix commit> --title vX.Y.Z --generate-notes --notes-start-tag <previous tag>`
3. On the merged release PR, replace the label `autorelease: pending` with
   `autorelease: tagged`.
4. Run the Release workflow by hand from `main` with the tag `vX.Y.Z`.

## License

[MIT](./LICENSE)
