[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / JobRef

# Class: JobRef

Defined in: [src/batch/resources.ts:399](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L399)

A reference to a job by id — job-template operations, plus the
`run` and `schedule` sub-facets. Minted with **no network call** by
`client.job(id)` and returned by `submitJob` (with `submitResponse`
attached). Call `load()` for a [JobHandle](JobHandle.md) with data.

## Extended by

- [`JobHandle`](JobHandle.md)

## Constructors

### Constructor

> **new JobRef**(`client`, `jobId`, `submitResponse?`): `JobRef`

Defined in: [src/batch/resources.ts:403](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L403)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

##### submitResponse?

The immediate submit response, when this ref came from a submit.

###### jobId

`string`

###### status

`"open"` \| `"closed"` \| `"deleted"`

###### latestRun?

\{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \}

###### latestRun.runId

`string`

###### latestRun.jobId

`string`

###### latestRun.runSequence

`number`

###### latestRun.status

`"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`

###### latestRun.stats

\{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}

###### latestRun.stats.total

`number`

###### latestRun.stats.completed

`number`

###### latestRun.stats.successful

`number`

###### latestRun.stats.failed

`number`

###### latestRun.stats.failureReasons?

\{\[`key`: `string`\]: `number`; \}

###### latestRun.stats.spend?

\{ `credits`: `number`; `cost`: `number`; \}

###### latestRun.stats.spend.credits

`number`

###### latestRun.stats.spend.cost

`number`

###### latestRun.lastBatchReceived?

`boolean`

###### latestRun.pauseState?

`"active"` \| `"paused"`

###### latestRun.ingestStatus?

`"pending"` \| `"done"`

###### latestRun.createdAt

`string`

###### latestRun.updatedAt

`string`

###### latestRun.failureReason?

`"insufficient_credits"` \| `"subscription_inactive"`

###### acceptedTasks

`number`

###### webhook?

\{ `url`: `string`; `signature`: `boolean`; \}

###### webhook.url

`string`

###### webhook.signature

`boolean`

#### Returns

`JobRef`

## Properties

### client

> `protected` `readonly` **client**: [`ZenRowsBatchClient`](ZenRowsBatchClient.md)

Defined in: [src/batch/resources.ts:404](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L404)

***

### jobId

> `readonly` **jobId**: `string`

Defined in: [src/batch/resources.ts:405](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L405)

***

### submitResponse?

> `readonly` `optional` **submitResponse?**: `object`

Defined in: [src/batch/resources.ts:407](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L407)

The immediate submit response, when this ref came from a submit.

#### jobId

> **jobId**: `string`

#### status

> **status**: `"open"` \| `"closed"` \| `"deleted"`

#### latestRun?

> `optional` **latestRun?**: `object`

##### latestRun.runId

> **runId**: `string`

##### latestRun.jobId

> **jobId**: `string`

##### latestRun.runSequence

> **runSequence**: `number`

##### latestRun.status

> **status**: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`

##### latestRun.stats

> **stats**: `object`

##### latestRun.stats.total

> **total**: `number`

##### latestRun.stats.completed

> **completed**: `number`

##### latestRun.stats.successful

> **successful**: `number`

##### latestRun.stats.failed

> **failed**: `number`

##### latestRun.stats.failureReasons?

> `optional` **failureReasons?**: `object`

###### Index Signature

\[`key`: `string`\]: `number`

##### latestRun.stats.spend?

> `optional` **spend?**: `object`

##### latestRun.stats.spend.credits

> **credits**: `number`

##### latestRun.stats.spend.cost

> **cost**: `number`

##### latestRun.lastBatchReceived?

> `optional` **lastBatchReceived?**: `boolean`

##### latestRun.pauseState?

> `optional` **pauseState?**: `"active"` \| `"paused"`

##### latestRun.ingestStatus?

> `optional` **ingestStatus?**: `"pending"` \| `"done"`

##### latestRun.createdAt

> **createdAt**: `string`

##### latestRun.updatedAt

> **updatedAt**: `string`

##### latestRun.failureReason?

> `optional` **failureReason?**: `"insufficient_credits"` \| `"subscription_inactive"`

#### acceptedTasks

> **acceptedTasks**: `number`

#### webhook?

> `optional` **webhook?**: `object`

##### webhook.url

> **url**: `string`

##### webhook.signature

> **signature**: `boolean`

## Accessors

### run

#### Get Signature

> **get** **run**(): [`CurrentRun`](CurrentRun.md)

Defined in: [src/batch/resources.ts:411](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L411)

Operations on the **current run** (`pause`/`resume`/`stop`/`wait`/`results`/…).

##### Returns

[`CurrentRun`](CurrentRun.md)

***

### schedule

#### Get Signature

> **get** **schedule**(): [`ScheduleControls`](ScheduleControls.md)

Defined in: [src/batch/resources.ts:417](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L417)

Operations on the **schedule** (`pause`/`resume`/`update`) — scheduled jobs.

##### Returns

[`ScheduleControls`](ScheduleControls.md)

## Methods

### load()

> **load**(): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:423](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L423)

`GET /jobs/{id}` — fetch the full job and return a loaded handle.

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>

***

### close()

> **close**(): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:430](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L430)

`POST /jobs/{id}/close` — lock the job. Returns the fresh loaded handle.

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>

***

### delete()

> **delete**(): `Promise`\<`void`\>

Defined in: [src/batch/resources.ts:435](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L435)

`DELETE /jobs/{id}` — async hard delete.

#### Returns

`Promise`\<`void`\>

***

### rerun()

> **rerun**(`options?`): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:444](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L444)

`POST /jobs/{id}/rerun[?status=...]` — start a new run (full replay,
or partial retry of matching task statuses). Returns the new run's
loaded [RunHandle](RunHandle.md).

#### Parameters

##### options?

[`RerunOptions`](../interfaces/RerunOptions.md) = `{}`

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### retryFailed()

> **retryFailed**(`options?`): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:454](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L454)

Re-execute only the previous run's **failed** tasks — successes are
inherited verbatim. `includePending` also re-enqueues never-started
tasks. Shortcut for `rerun({ status: "failed" })`.

#### Parameters

##### options?

###### includePending?

`boolean`

###### idempotencyKey?

`string`

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### addTasks()

> **addTasks**(`body`): `Promise`\<\{ `acceptedTasks`: `number`; `jobStatus`: `"open"` \| `"closed"` \| `"deleted"`; `latestRun`: \{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \}; \}\>

Defined in: [src/batch/resources.ts:464](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L464)

`POST /jobs/{id}/tasks` — append to the open initial run.

#### Parameters

##### body

[`AddTasksRequest`](../type-aliases/AddTasksRequest.md)

#### Returns

`Promise`\<\{ `acceptedTasks`: `number`; `jobStatus`: `"open"` \| `"closed"` \| `"deleted"`; `latestRun`: \{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \}; \}\>

***

### getWebhook()

> **getWebhook**(): `Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

Defined in: [src/batch/resources.ts:470](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L470)

#### Returns

`Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

***

### setWebhook()

> **setWebhook**(`config`): `Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

Defined in: [src/batch/resources.ts:474](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L474)

#### Parameters

##### config

###### url

`string`

###### signature

`boolean`

#### Returns

`Promise`\<\{ `url`: `string`; `signature`: `boolean`; \}\>

***

### deleteWebhook()

> **deleteWebhook**(): `Promise`\<`void`\>

Defined in: [src/batch/resources.ts:478](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L478)

#### Returns

`Promise`\<`void`\>

***

### runs()

> **runs**(`options?`): [`AsyncStream`](AsyncStream.md)\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:485](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L485)

Auto-paginate runs of this job as a stream of loaded [RunHandle](RunHandle.md)s.

#### Parameters

##### options?

###### pageSize?

`number`

#### Returns

[`AsyncStream`](AsyncStream.md)\<[`RunHandle`](RunHandle.md)\>

***

### addFileInput()

> **addFileInput**(`source`, `options`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:492](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L492)

Upload a CSV this job would consume on a future submission.

#### Parameters

##### source

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

##### options

###### fields

\{ `url`: `string` \| `number`; `externalId?`: `string` \| `number`; \}

###### fields.url

`string` \| `number`

###### fields.externalId?

`string` \| `number`

###### header?

`boolean`

###### delimiter?

`string`

###### quote?

`string`

#### Returns

`Promise`\<`string`\>

***

### waitForIngest()

> **waitForIngest**(`options?`): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:511](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L511)

Block until the current run's async-carrier ingestion finishes
(large 202 submissions stream task rows off the request path).
Returns the fresh loaded handle.

#### Parameters

##### options?

###### timeout?

`number`

###### pollInterval?

`number`

###### maxPollInterval?

`number`

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>
