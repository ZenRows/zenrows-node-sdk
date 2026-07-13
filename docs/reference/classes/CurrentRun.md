[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / CurrentRun

# Class: CurrentRun

Defined in: [src/batch/resources.ts:245](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L245)

Operations on a job's **current run**, reached via `job.run`. The
pause/stop family only ever targets the latest run (the API's
run-less endpoints resolve it server-side), which is why they live
here and not on [RunRef](RunRef.md).

## Constructors

### Constructor

> **new CurrentRun**(`client`, `jobId`): `CurrentRun`

Defined in: [src/batch/resources.ts:246](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L246)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

#### Returns

`CurrentRun`

## Methods

### load()

> **load**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:258](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L258)

`GET /jobs/{id}` → the latest run as a loaded [RunHandle](RunHandle.md).

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### pause()

> **pause**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:269](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L269)

`POST /jobs/{id}/pause` — reversibly suspend the current run: the
dispatcher stops pulling its queue (in-flight tasks may still
settle). Orthogonal to `status`; undo with `resume()`.

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### resume()

> **resume**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:275](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L275)

`POST /jobs/{id}/resume` — un-pause the current run.

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### stop()

> **stop**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:281](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L281)

`POST /jobs/{id}/stop` — terminally stop the current run.

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### cancel()

> **cancel**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:287](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L287)

Alias for [stop](#stop).

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### wait()

> **wait**(`options?`): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:292](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L292)

Block until the current run reaches a target state; returns its loaded handle.

#### Parameters

##### options?

[`WaitOptions`](../interfaces/WaitOptions.md) = `{}`

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### results()

> **results**(`options?`): [`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

Defined in: [src/batch/resources.ts:298](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L298)

Auto-paginate task results from the current run.

#### Parameters

##### options?

###### status?

`string`

#### Returns

[`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

***

### taskContent()

> **taskContent**(`taskId`): `Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

Defined in: [src/batch/resources.ts:303](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L303)

Current-run task body. Returns `{ body, contentType }`.

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

***

### taskHistory()

> **taskHistory**(`taskId`): `Promise`\<\{ `events`: `object`[]; \}\>

Defined in: [src/batch/resources.ts:308](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L308)

Current-run per-attempt event log for one task.

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `events`: `object`[]; \}\>

***

### downloadToDir()

> **downloadToDir**(`targetDir`, `options?`): `Promise`\<`number`\>

Defined in: [src/batch/resources.ts:312](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L312)

#### Parameters

##### targetDir

`string`

##### options?

`HandleDownloadToDirOptions` = `{}`

#### Returns

`Promise`\<`number`\>

***

### downloadToMemory()

> **downloadToMemory**(`options?`): `Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)[]\>

Defined in: [src/batch/resources.ts:316](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L316)

#### Parameters

##### options?

`HandleDownloadToMemoryOptions` = `{}`

#### Returns

`Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)[]\>

***

### downloadTaskToDir()

> **downloadTaskToDir**(`task`, `targetDir`, `options?`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:321](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L321)

Download one result's body into `targetDir` (one file); returns the path.

#### Parameters

##### task

###### taskId

`string`

###### externalId?

`string`

###### runId

`string`

###### url

`string`

###### metadata?

\{\[`key`: `string`\]: `string`; \}

###### status

`"pending"` \| `"failed"` \| `"processing"` \| `"successful"`

###### type?

`"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`

###### resultUrl?

`string` \| `null`

###### error?

\{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}

###### error.type

`string`

###### error.title

`string`

###### error.status

`number`

###### error.detail?

`string`

###### error.code

`string`

###### error.instance?

`string`

###### error.invalidTasks?

`object`[]

###### sourceRunId?

`string`

###### spend?

\{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}

###### spend.total

\{ `credits`: `number`; `cost`: `number`; \}

###### spend.total.credits

`number`

###### spend.total.cost

`number`

###### spend.lastAttempt

\{ `credits`: `number`; `cost`: `number`; \}

###### spend.lastAttempt.credits

`number`

###### spend.lastAttempt.cost

`number`

##### targetDir

`string`

##### options?

`Omit`\<`DownloadTaskToDirOptions`, `"runId"`\> = `{}`

#### Returns

`Promise`\<`string`\>

***

### downloadTaskToMemory()

> **downloadTaskToMemory**(`task`): `Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)\>

Defined in: [src/batch/resources.ts:330](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L330)

Download one result's body into memory as a [DownloadedResult](../interfaces/DownloadedResult.md).

#### Parameters

##### task

###### taskId

`string`

###### externalId?

`string`

###### runId

`string`

###### url

`string`

###### metadata?

\{\[`key`: `string`\]: `string`; \}

###### status

`"pending"` \| `"failed"` \| `"processing"` \| `"successful"`

###### type?

`"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`

###### resultUrl?

`string` \| `null`

###### error?

\{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}

###### error.type

`string`

###### error.title

`string`

###### error.status

`number`

###### error.detail?

`string`

###### error.code

`string`

###### error.instance?

`string`

###### error.invalidTasks?

`object`[]

###### sourceRunId?

`string`

###### spend?

\{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}

###### spend.total

\{ `credits`: `number`; `cost`: `number`; \}

###### spend.total.credits

`number`

###### spend.total.cost

`number`

###### spend.lastAttempt

\{ `credits`: `number`; `cost`: `number`; \}

###### spend.lastAttempt.credits

`number`

###### spend.lastAttempt.cost

`number`

#### Returns

`Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)\>

***

### startExport()

> **startExport**(): `Promise`\<[`ExportRef`](ExportRef.md)\>

Defined in: [src/batch/resources.ts:335](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L335)

`POST .../exports` — start an async zip of the current run's bodies.

#### Returns

`Promise`\<[`ExportRef`](ExportRef.md)\>

***

### downloadAllResults()

> **downloadAllResults**(`targetPath`, `options?`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:340](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L340)

Server-side zip export of the current run's results → `targetPath`.

#### Parameters

##### targetPath

`string`

##### options?

`DownloadAllOptions` = `{}`

#### Returns

`Promise`\<`string`\>
