[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / RunHandle

# Class: RunHandle

Defined in: [src/batch/resources.ts:169](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L169)

A [RunRef](RunRef.md) plus a guaranteed, synchronous `data` snapshot.

## Extends

- [`RunRef`](RunRef.md)

## Constructors

### Constructor

> **new RunHandle**(`client`, `jobId`, `runId`, `data`): `RunHandle`

Defined in: [src/batch/resources.ts:170](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L170)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

##### runId

`string`

##### data

###### runId

`string`

###### jobId

`string`

###### runSequence

`number`

###### status

`"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`

###### stats

\{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}

###### stats.total

`number`

###### stats.completed

`number`

###### stats.successful

`number`

###### stats.failed

`number`

###### stats.failureReasons?

\{\[`key`: `string`\]: `number`; \}

###### stats.spend?

\{ `credits`: `number`; `cost`: `number`; \}

###### stats.spend.credits

`number`

###### stats.spend.cost

`number`

###### lastBatchReceived?

`boolean`

###### pauseState?

`"active"` \| `"paused"`

###### ingestStatus?

`"pending"` \| `"done"`

###### createdAt

`string`

###### updatedAt

`string`

###### failureReason?

`"insufficient_credits"` \| `"subscription_inactive"`

#### Returns

`RunHandle`

#### Overrides

[`RunRef`](RunRef.md).[`constructor`](RunRef.md#constructor)

## Properties

### client

> `protected` `readonly` **client**: [`ZenRowsBatchClient`](ZenRowsBatchClient.md)

Defined in: [src/batch/resources.ts:89](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L89)

#### Inherited from

[`RunRef`](RunRef.md).[`client`](RunRef.md#client)

***

### jobId

> `readonly` **jobId**: `string`

Defined in: [src/batch/resources.ts:90](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L90)

#### Inherited from

[`RunRef`](RunRef.md).[`jobId`](RunRef.md#jobid)

***

### runId

> `readonly` **runId**: `string`

Defined in: [src/batch/resources.ts:91](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L91)

#### Inherited from

[`RunRef`](RunRef.md).[`runId`](RunRef.md#runid)

***

### data

> `readonly` **data**: `object`

Defined in: [src/batch/resources.ts:174](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L174)

#### runId

> **runId**: `string`

#### jobId

> **jobId**: `string`

#### runSequence

> **runSequence**: `number`

#### status

> **status**: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`

#### stats

> **stats**: `object`

##### stats.total

> **total**: `number`

##### stats.completed

> **completed**: `number`

##### stats.successful

> **successful**: `number`

##### stats.failed

> **failed**: `number`

##### stats.failureReasons?

> `optional` **failureReasons?**: `object`

###### Index Signature

\[`key`: `string`\]: `number`

##### stats.spend?

> `optional` **spend?**: `object`

##### stats.spend.credits

> **credits**: `number`

##### stats.spend.cost

> **cost**: `number`

#### lastBatchReceived?

> `optional` **lastBatchReceived?**: `boolean`

#### pauseState?

> `optional` **pauseState?**: `"active"` \| `"paused"`

#### ingestStatus?

> `optional` **ingestStatus?**: `"pending"` \| `"done"`

#### createdAt

> **createdAt**: `string`

#### updatedAt

> **updatedAt**: `string`

#### failureReason?

> `optional` **failureReason?**: `"insufficient_credits"` \| `"subscription_inactive"`

## Methods

### load()

> **load**(): `Promise`\<`RunHandle`\>

Defined in: [src/batch/resources.ts:95](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L95)

`GET /jobs/{id}/runs/{runId}` — fetch the run and return a loaded handle.

#### Returns

`Promise`\<`RunHandle`\>

#### Inherited from

[`RunRef`](RunRef.md).[`load`](RunRef.md#load)

***

### delete()

> **delete**(): `Promise`\<`void`\>

Defined in: [src/batch/resources.ts:105](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L105)

`DELETE /jobs/{id}/runs/{runId}` — scrub one run only.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`RunRef`](RunRef.md).[`delete`](RunRef.md#delete)

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

#### Inherited from

[`RunRef`](RunRef.md).[`results`](RunRef.md#results)

***

### taskContent()

> **taskContent**(`taskId`): `Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

Defined in: [src/batch/resources.ts:113](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L113)

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `body`: `Uint8Array`; `contentType`: `string`; \}\>

#### Inherited from

[`RunRef`](RunRef.md).[`taskContent`](RunRef.md#taskcontent)

***

### taskHistory()

> **taskHistory**(`taskId`): `Promise`\<\{ `events`: `object`[]; \}\>

Defined in: [src/batch/resources.ts:117](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L117)

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<\{ `events`: `object`[]; \}\>

#### Inherited from

[`RunRef`](RunRef.md).[`taskHistory`](RunRef.md#taskhistory)

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

#### Inherited from

[`RunRef`](RunRef.md).[`downloadToDir`](RunRef.md#downloadtodir)

***

### downloadToMemory()

> **downloadToMemory**(`options?`): `Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)[]\>

Defined in: [src/batch/resources.ts:125](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L125)

#### Parameters

##### options?

`HandleDownloadToMemoryOptions` = `{}`

#### Returns

`Promise`\<[`DownloadedResult`](../interfaces/DownloadedResult.md)[]\>

#### Inherited from

[`RunRef`](RunRef.md).[`downloadToMemory`](RunRef.md#downloadtomemory)

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

#### Inherited from

[`RunRef`](RunRef.md).[`downloadTaskToDir`](RunRef.md#downloadtasktodir)

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

#### Inherited from

[`RunRef`](RunRef.md).[`downloadTaskToMemory`](RunRef.md#downloadtasktomemory)

***

### wait()

> **wait**(`options?`): `Promise`\<`RunHandle`\>

Defined in: [src/batch/resources.ts:147](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L147)

Block until this run reaches a target state; returns the fresh loaded handle.

#### Parameters

##### options?

[`WaitOptions`](../interfaces/WaitOptions.md) = `{}`

#### Returns

`Promise`\<`RunHandle`\>

#### Inherited from

[`RunRef`](RunRef.md).[`wait`](RunRef.md#wait)

***

### startExport()

> **startExport**(): `Promise`\<[`ExportRef`](ExportRef.md)\>

Defined in: [src/batch/resources.ts:153](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L153)

`POST .../exports` — start an async zip of this run's bodies.

#### Returns

`Promise`\<[`ExportRef`](ExportRef.md)\>

#### Inherited from

[`RunRef`](RunRef.md).[`startExport`](RunRef.md#startexport)

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

#### Inherited from

[`RunRef`](RunRef.md).[`export`](RunRef.md#export)

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

#### Inherited from

[`RunRef`](RunRef.md).[`downloadAllResults`](RunRef.md#downloadallresults)
