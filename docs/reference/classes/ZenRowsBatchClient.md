[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ZenRowsBatchClient

# Class: ZenRowsBatchClient

Defined in: [src/batch/client.ts:150](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L150)

Public surface for the ZenRows Batch (async-job) API.

What's where:
  - ZenRowsBatchClient — the friendly typed facade. One
    method per OpenAPI operation, returning camelCase models.
  - `types` — camelCase model types derived from the generated
    `schema.ts` (regenerate from `docs/openapi.yaml` via
    `pnpm generate`). Do NOT hand-edit field names.
  - [BatchApiError](BatchApiError.md) — RFC 7807 mapping.

Completion is surfaced via waiters (`job.wait()` / `run.wait()`) and
webhooks — poll or get notified; there's no callback to wire up.

## Constructors

### Constructor

> **new ZenRowsBatchClient**(`apiKey`, `options?`): `ZenRowsBatchClient`

Defined in: [src/batch/client.ts:153](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L153)

#### Parameters

##### apiKey

`string`

##### options?

[`BatchClientOptions`](../interfaces/BatchClientOptions.md) = `{}`

#### Returns

`ZenRowsBatchClient`

## Accessors

### baseUrl

#### Get Signature

> **get** **baseUrl**(): `string`

Defined in: [src/batch/client.ts:166](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L166)

##### Returns

`string`

## Methods

### submitJob()

> **submitJob**(`body`, `options?`): `Promise`\<[`JobRef`](JobRef.md)\>

Defined in: [src/batch/client.ts:177](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L177)

`POST /jobs` — submit a new scraping job. The general, low-level
path; most callers prefer `submitRegular` / `submitOpen` /
`submitScheduled`, which hide the `type`/`status` boilerplate.

#### Parameters

##### body

[`SubmitJobRequest`](../type-aliases/SubmitJobRequest.md)

##### options?

[`SubmitOptions`](../interfaces/SubmitOptions.md) = `{}`

#### Returns

`Promise`\<[`JobRef`](JobRef.md)\>

***

### submitRegular()

> **submitRegular**(`params`): `Promise`\<[`JobRef`](JobRef.md)\>

Defined in: [src/batch/client.ts:204](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L204)

Submit a one-shot scraping job (closed, all tasks upfront). Pass
exactly one task source — `{ urls }` or `{ fileInputId }` — plus
optional job fields:

```ts
client.submitRegular({ urls: ["https://a", "https://b"], zenrowsParams: {...} });
client.submitRegular({ fileInputId });
```

#### Parameters

##### params

[`SubmitRegularParams`](../type-aliases/SubmitRegularParams.md)

#### Returns

`Promise`\<[`JobRef`](JobRef.md)\>

***

### submitOpen()

> **submitOpen**(`params?`): `Promise`\<[`JobRef`](JobRef.md)\>

Defined in: [src/batch/client.ts:212](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L212)

Submit a streaming-style job that stays open for more `addTasks`.
`urls` is optional (may be empty); no file input.

#### Parameters

##### params?

[`SubmitOpenParams`](../type-aliases/SubmitOpenParams.md) = `{}`

#### Returns

`Promise`\<[`JobRef`](JobRef.md)\>

***

### submitScheduled()

> **submitScheduled**(`params`): `Promise`\<[`JobRef`](JobRef.md)\>

Defined in: [src/batch/client.ts:222](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L222)

Submit a scheduled job. `schedule` is a declarative
[ScheduleInput](../type-aliases/ScheduleInput.md) (`{ every: "6h" }`, `{ at, tz }`,
`{ times, days, tz }`, …); pass a `{ urls }` or `{ fileInputId }`
source alongside it.

#### Parameters

##### params

[`SubmitScheduledParams`](../type-aliases/SubmitScheduledParams.md)

#### Returns

`Promise`\<[`JobRef`](JobRef.md)\>

***

### getJob()

> **getJob**(`jobId`): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/client.ts:229](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L229)

`GET /jobs/{id}` — a loaded [JobHandle](JobHandle.md) (its `.data` is ready).

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>

***

### job()

> **job**(`jobId`): [`JobRef`](JobRef.md)

Defined in: [src/batch/client.ts:238](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L238)

A [JobRef](JobRef.md) for an existing job with **no network call** —
every id-only operation, and `load()` when you want the data.

#### Parameters

##### jobId

`string`

#### Returns

[`JobRef`](JobRef.md)

***

### estimateCost()

> **estimateCost**(`job`): `Promise`\<[`CostEstimate`](CostEstimate.md)\>

Defined in: [src/batch/client.ts:248](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L248)

Estimate a job's credit cost, assuming every task succeeds once —
`{ min, max, breakdown }`. Accepts the same body as `submitJob`.
Done client-side with the SDK's rate card, so it costs no API call;
async purely to keep the client surface uniformly promise-based.

#### Parameters

##### job

[`SubmitJobRequest`](../type-aliases/SubmitJobRequest.md)

#### Returns

`Promise`\<[`CostEstimate`](CostEstimate.md)\>

***

### listJobs()

> **listJobs**(`options?`): `Promise`\<\{ `jobs`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

Defined in: [src/batch/client.ts:253](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L253)

`GET /jobs` — one raw page. Prefer [iterJobs](#iterjobs).

#### Parameters

##### options?

###### limit?

`number`

###### cursor?

`string`

###### jobType?

`"regular"` \| `"scheduled"`

###### status?

`"open"` \| `"closed"` \| `"deleted"`

#### Returns

`Promise`\<\{ `jobs`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

***

### iterJobs()

> **iterJobs**(`options?`): [`AsyncStream`](AsyncStream.md)\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/client.ts:267](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L267)

Auto-paginate [listJobs](#listjobs) as a stream of loaded [JobHandle](JobHandle.md)s.

#### Parameters

##### options?

###### jobType?

`"regular"` \| `"scheduled"`

###### status?

`"open"` \| `"closed"` \| `"deleted"`

###### pageSize?

`number`

#### Returns

[`AsyncStream`](AsyncStream.md)\<[`JobHandle`](JobHandle.md)\>

***

### getRun()

> **getRun**(`jobId`, `runId`): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/client.ts:290](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L290)

`GET /jobs/{id}/runs/{runId}` — a loaded [RunHandle](RunHandle.md).

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### run()

> **run**(`jobId`, `runId`): [`RunRef`](RunRef.md)

Defined in: [src/batch/client.ts:296](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L296)

A [RunRef](RunRef.md) with **no network call** — id-only ops + `load()`.

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

[`RunRef`](RunRef.md)

***

### listRuns()

> **listRuns**(`jobId`, `options?`): `Promise`\<\{ `runs`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

Defined in: [src/batch/client.ts:301](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L301)

`GET /jobs/{id}/runs` — one raw page. Prefer [iterRuns](#iterruns).

#### Parameters

##### jobId

`string`

##### options?

###### limit?

`number`

###### cursor?

`string`

#### Returns

`Promise`\<\{ `runs`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

***

### iterRuns()

> **iterRuns**(`jobId`, `options?`): [`AsyncStream`](AsyncStream.md)\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/client.ts:311](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L311)

Auto-paginate runs of a job as a stream of loaded [RunHandle](RunHandle.md)s.

#### Parameters

##### jobId

`string`

##### options?

###### pageSize?

`number`

#### Returns

[`AsyncStream`](AsyncStream.md)\<[`RunHandle`](RunHandle.md)\>

***

### listResults()

> **listResults**(`jobId`, `options?`): `Promise`\<\{ `results`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

Defined in: [src/batch/client.ts:323](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L323)

`GET .../results` — one raw page. Prefer [iterResults](#iterresults).

#### Parameters

##### jobId

`string`

##### options?

###### runId?

`string`

###### status?

`string`

###### cursor?

`string`

#### Returns

`Promise`\<\{ `results`: `object`[]; `nextCursor?`: `string` \| `null`; \}\>

***

### iterResults()

> **iterResults**(`jobId`, `options?`): [`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

Defined in: [src/batch/client.ts:336](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L336)

Auto-paginate results as a stream of [TaskResult](../type-aliases/TaskResult.md) rows.

#### Parameters

##### jobId

`string`

##### options?

###### runId?

`string`

###### status?

`string`

#### Returns

[`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

***

### waitForRun()

> **waitForRun**(`jobId`, `options?`): `Promise`\<\{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \}\>

Defined in: [src/batch/client.ts:346](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L346)

Block until a run reaches one of `targetStatuses`.

#### Parameters

##### jobId

`string`

##### options?

[`WaitForRunOptions`](../interfaces/WaitForRunOptions.md) = `{}`

#### Returns

`Promise`\<\{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \}\>

***

### createJobInput()

> **createJobInput**(`body`): `Promise`\<\{ `fileInputId`: `string`; `upload`: \{ `method`: `"PUT"`; `url`: `string`; `headers?`: \{\[`key`: `string`\]: `string`; \}; `expiresAt`: `string`; \}; `expiresAt`: `string`; \}\>

Defined in: [src/batch/client.ts:353](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L353)

`POST /job_inputs` — allocate a CSV slot. Prefer [uploadCsv](#uploadcsv).

#### Parameters

##### body

###### type

`"csv"`

###### csv?

\{ `delimiter`: `string`; `quote`: `string`; `header`: `boolean`; `fields`: \{ `url`: `string` \| `number`; `externalId?`: `string` \| `number`; \}; \}

###### csv.delimiter

`string`

###### csv.quote

`string`

###### csv.header

`boolean`

###### csv.fields

\{ `url`: `string` \| `number`; `externalId?`: `string` \| `number`; \}

###### csv.fields.url

`string` \| `number`

###### csv.fields.externalId?

`string` \| `number`

#### Returns

`Promise`\<\{ `fileInputId`: `string`; `upload`: \{ `method`: `"PUT"`; `url`: `string`; `headers?`: \{\[`key`: `string`\]: `string`; \}; `expiresAt`: `string`; \}; `expiresAt`: `string`; \}\>

***

### uploadCsv()

> **uploadCsv**(`source`, `options`): `Promise`\<`string`\>

Defined in: [src/batch/client.ts:370](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L370)

Allocate a CSV slot, PUT the body to the presigned URL, and return
the `fileInputId` to pass to a submit call — one call instead of
three. `source` is a file path or the CSV bytes.

#### Parameters

##### source

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

##### options

[`UploadCsvOptions`](../interfaces/UploadCsvOptions.md)

#### Returns

`Promise`\<`string`\>

***

### listHmacKeys()

> **listHmacKeys**(): `Promise`\<\{ `active?`: \{ `kid`: `string`; `createdAt`: `string`; \}; `candidate?`: \{ `kid`: `string`; `createdAt`: `string`; \}; \}\>

Defined in: [src/batch/client.ts:400](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L400)

#### Returns

`Promise`\<\{ `active?`: \{ `kid`: `string`; `createdAt`: `string`; \}; `candidate?`: \{ `kid`: `string`; `createdAt`: `string`; \}; \}\>

***

### rotateHmacKey()

> **rotateHmacKey**(): `Promise`\<\{ `kid`: `string`; `secret`: `string`; `createdAt`: `string`; \}\>

Defined in: [src/batch/client.ts:405](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L405)

Capture the returned `secret` — it is never revealed again.

#### Returns

`Promise`\<\{ `kid`: `string`; `secret`: `string`; `createdAt`: `string`; \}\>

***

### finalizeHmacKey()

> **finalizeHmacKey**(): `Promise`\<\{ `activeKid`: `string`; `createdAt`: `string`; \}\>

Defined in: [src/batch/client.ts:409](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L409)

#### Returns

`Promise`\<\{ `activeKid`: `string`; `createdAt`: `string`; \}\>

***

### cancelHmacRotation()

> **cancelHmacRotation**(): `Promise`\<`void`\>

Defined in: [src/batch/client.ts:413](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L413)

#### Returns

`Promise`\<`void`\>

***

### getJobWebhook()

> **getJobWebhook**(`jobId`): `Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

Defined in: [src/batch/client.ts:419](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L419)

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

***

### putJobWebhook()

> **putJobWebhook**(`jobId`, `config`): `Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

Defined in: [src/batch/client.ts:423](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L423)

#### Parameters

##### jobId

`string`

##### config

###### url

`string`

###### signature

`boolean`

#### Returns

`Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

***

### deleteJobWebhook()

> **deleteJobWebhook**(`jobId`): `Promise`\<`void`\>

Defined in: [src/batch/client.ts:429](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L429)

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<`void`\>

***

### testWebhook()

> **testWebhook**(`config`): `Promise`\<\{ `delivered`: `boolean`; `eventId`: `string`; `statusCode?`: `number`; `error?`: `string`; `elapsedMs`: `number`; \}\>

Defined in: [src/batch/client.ts:434](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L434)

`POST /webhook/test` — dispatch a synthetic event to a receiver.

#### Parameters

##### config

[`WebhookInput`](../type-aliases/WebhookInput.md)

#### Returns

`Promise`\<\{ `delivered`: `boolean`; `eventId`: `string`; `statusCode?`: `number`; `error?`: `string`; `elapsedMs`: `number`; \}\>

***

### startResultsExport()

> **startResultsExport**(`jobId`, `runId`): `Promise`\<[`ExportRef`](ExportRef.md)\>

Defined in: [src/batch/client.ts:443](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L443)

`POST .../exports` — start an async zip of a run's task bodies. Returns an [ExportRef](ExportRef.md).

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<[`ExportRef`](ExportRef.md)\>

***

### getResultsExport()

> **getResultsExport**(`jobId`, `runId`, `exportId`): `Promise`\<[`ExportHandle`](ExportHandle.md)\>

Defined in: [src/batch/client.ts:448](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L448)

#### Parameters

##### jobId

`string`

##### runId

`string`

##### exportId

`string`

#### Returns

`Promise`\<[`ExportHandle`](ExportHandle.md)\>

***

### waitForExport()

> **waitForExport**(`jobId`, `runId`, `exportId`, `options?`): `Promise`\<\{ `exportId`: `string`; `status`: `"running"` \| `"pending"` \| `"completed"` \| `"failed"`; `error?`: `string` \| `null`; `downloadUrl?`: `string`; `createdAt`: `string`; `expiresAt`: `string`; \}\>

Defined in: [src/batch/client.ts:454](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L454)

Block until an export reaches a terminal state.

#### Parameters

##### jobId

`string`

##### runId

`string`

##### exportId

`string`

##### options?

###### targetStatuses?

`ReadonlySet`\<`string`\>

###### timeout?

`number`

###### pollInterval?

`number`

###### maxPollInterval?

`number`

#### Returns

`Promise`\<\{ `exportId`: `string`; `status`: `"running"` \| `"pending"` \| `"completed"` \| `"failed"`; `error?`: `string` \| `null`; `downloadUrl?`: `string`; `createdAt`: `string`; `expiresAt`: `string`; \}\>

***

### downloadAllResults()

> **downloadAllResults**(`jobId`, `runId`, `targetPath`, `options?`): `Promise`\<`string`\>

Defined in: [src/batch/client.ts:473](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L473)

Start an export, wait for it, and save the zip to `targetPath`.
Capped at 1 GiB per run server-side; for larger runs use
`downloadToDir` (no size limit, but slower).

#### Parameters

##### jobId

`string`

##### runId

`string`

##### targetPath

`string`

##### options?

###### waitTimeout?

`number`

###### pollInterval?

`number`

#### Returns

`Promise`\<`string`\>
