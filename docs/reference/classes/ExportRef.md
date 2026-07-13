[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ExportRef

# Class: ExportRef

Defined in: [src/batch/resources.ts:183](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L183)

A reference to a results-export by id. Call `load()` / `wait()` for data.

## Extended by

- [`ExportHandle`](ExportHandle.md)

## Constructors

### Constructor

> **new ExportRef**(`client`, `jobId`, `runId`, `exportId`, `startResponse?`): `ExportRef`

Defined in: [src/batch/resources.ts:184](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L184)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

##### runId

`string`

##### exportId

`string`

##### startResponse?

The immediate start response, when this ref came from `startExport`.

###### exportId

`string`

###### status

`"running"` \| `"pending"` \| `"completed"` \| `"failed"`

###### createdAt

`string`

###### expiresAt

`string`

#### Returns

`ExportRef`

## Properties

### client

> `protected` `readonly` **client**: [`ZenRowsBatchClient`](ZenRowsBatchClient.md)

Defined in: [src/batch/resources.ts:185](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L185)

***

### jobId

> `readonly` **jobId**: `string`

Defined in: [src/batch/resources.ts:186](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L186)

***

### runId

> `readonly` **runId**: `string`

Defined in: [src/batch/resources.ts:187](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L187)

***

### exportId

> `readonly` **exportId**: `string`

Defined in: [src/batch/resources.ts:188](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L188)

***

### startResponse?

> `readonly` `optional` **startResponse?**: `object`

Defined in: [src/batch/resources.ts:190](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L190)

The immediate start response, when this ref came from `startExport`.

#### exportId

> **exportId**: `string`

#### status

> **status**: `"running"` \| `"pending"` \| `"completed"` \| `"failed"`

#### createdAt

> **createdAt**: `string`

#### expiresAt

> **expiresAt**: `string`

## Methods

### load()

> **load**(): `Promise`\<[`ExportHandle`](ExportHandle.md)\>

Defined in: [src/batch/resources.ts:194](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L194)

`GET .../exports/{id}` — fetch the export and return a loaded handle.

#### Returns

`Promise`\<[`ExportHandle`](ExportHandle.md)\>

***

### wait()

> **wait**(`options?`): `Promise`\<[`ExportHandle`](ExportHandle.md)\>

Defined in: [src/batch/resources.ts:200](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L200)

Block until the export reaches a terminal state; returns the loaded handle.

#### Parameters

##### options?

###### targetStatuses?

`ReadonlySet`\<`string`\>

###### timeout?

`number`

###### pollInterval?

`number`

#### Returns

`Promise`\<[`ExportHandle`](ExportHandle.md)\>

***

### downloadToPath()

> **downloadToPath**(`targetPath`): `Promise`\<`string`\>

Defined in: [src/batch/resources.ts:211](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L211)

Stream the export zip to `targetPath`. Fetches once for a fresh
presigned URL; requires the export to be `completed`.

#### Parameters

##### targetPath

`string`

#### Returns

`Promise`\<`string`\>
