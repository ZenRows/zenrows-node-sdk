[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / RunRef

# Class: RunRef

Defined in: [src/batch/resources.ts:87](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L87)

A reference to a **specific** run by `(jobId, runId)` — read/download
operations on one (usually historical) run. No `pause`/`stop`: the
API only suspends or stops the *current* run (see `job.run`).

## Extended by

- [`RunHandle`](RunHandle.md)

## Constructors

### Constructor

> **new RunRef**(`client`, `jobId`, `runId`): `RunRef`

Defined in: [src/batch/resources.ts:88](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L88)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

##### runId

`string`

#### Returns

`RunRef`

## Properties

### client

> `protected` `readonly` **client**: [`ZenRowsBatchClient`](ZenRowsBatchClient.md)

Defined in: [src/batch/resources.ts:89](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L89)

***

### jobId

> `readonly` **jobId**: `string`

Defined in: [src/batch/resources.ts:90](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L90)

***

### runId

> `readonly` **runId**: `string`

Defined in: [src/batch/resources.ts:91](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L91)

## Methods

### load()

> **load**(): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:95](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L95)

`GET /jobs/{id}/runs/{runId}` — fetch the run and return a loaded handle.

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### delete()

> **delete**(): `Promise`\<`void`\>

Defined in: [src/batch/resources.ts:105](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L105)

`DELETE /jobs/{id}/runs/{runId}` — scrub one run only.

#### Returns

`Promise`\<`void`\>

***

### results()

> **results**(`options?`): [`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

Defined in: [src/batch/resources.ts:109](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L109)

#### Parameters

##### options?

###### status?

`string`

#### Returns

[`AsyncStream`](AsyncStream.md)\<\{ `taskId`: `string`; `externalId?`: `string`; `runId`: `string`; `url`: `string`; `metadata?`: \{\[`key`: `string`\]: `string`; \}; `status`: `"pending"` \| `"failed"` \| `"processing"` \| `"successful"`; `type?`: `"html"` \| `"json"` \| `"markdown"` \| `"plaintext"` \| `"pdf"`; `resultUrl?`: `string` \| `null`; `error?`: \{\[`key`: `string`\]: `unknown`; `type`: `string`; `title`: `string`; `status`: `number`; `detail?`: `string`; `code`: `string`; `instance?`: `string`; `invalidTasks?`: `object`[]; \}; `sourceRunId?`: `string`; `spend?`: \{ `total`: \{ `credits`: `number`; `cost`: `number`; \}; `lastAttempt`: \{ `credits`: `number`; `cost`: `number`; \}; \}; \}\>

***

### taskContent()

> **taskContent**(`taskId`): `Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

Defined in: [src/batch/resources.ts:113](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L113)

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

***

### taskHistory()

> **taskHistory**(`taskId`): `Promise`\<\{ `events`: `object`[]; \}\>

Defined in: [src/batch/resources.ts:117](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L117)

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `events`: `object`[]; \}\>

***

### downloadToDir()

> **downloadToDir**(`targetDir`, `options?`): `Promise`\<`number`\>

Defined in: [src/batch/resources.ts:121](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L121)

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

Defined in: [src/batch/resources.ts:125](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L125)

#### Parameters

##### options?

`HandleDownloadToMemoryOptions` = `{}`

#### Returns

`Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)[]\>

***

### downloadTaskToDir()

> **downloadTaskToDir**(`task`, `targetDir`, `options?`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:130](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L130)

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

Defined in: [src/batch/resources.ts:142](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L142)

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

### wait()

> **wait**(`options?`): `Promise`\<[`RunHandle`](RunHandle.md)\>

Defined in: [src/batch/resources.ts:147](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L147)

Block until this run reaches a target state; returns the fresh loaded handle.

#### Parameters

##### options?

[`WaitOptions`](../interfaces/WaitOptions.md) = `{}`

#### Returns

`Promise`\<[`RunHandle`](RunHandle.md)\>

***

### startExport()

> **startExport**(): `Promise`\<[`ExportRef`](ExportRef.md)\>

Defined in: [src/batch/resources.ts:153](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L153)

`POST .../exports` — start an async zip of this run's bodies.

#### Returns

`Promise`\<[`ExportRef`](ExportRef.md)\>

***

### export()

> **export**(`exportId`): [`ExportRef`](ExportRef.md)

Defined in: [src/batch/resources.ts:158](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L158)

Address a specific export of this run by id (no network call).

#### Parameters

##### exportId

`string`

#### Returns

[`ExportRef`](ExportRef.md)

***

### downloadAllResults()

> **downloadAllResults**(`targetPath`, `options?`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:163](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L163)

Server-side zip export of this run's results → `targetPath`.

#### Parameters

##### targetPath

`string`

##### options?

`DownloadAllOptions` = `{}`

#### Returns

`Promise`\<`string`\>
