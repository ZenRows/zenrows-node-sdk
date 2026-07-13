[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ExportHandle

# Class: ExportHandle

Defined in: [src/batch/resources.ts:224](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L224)

An [ExportRef](ExportRef.md) plus a guaranteed, synchronous `data` snapshot.

## Extends

- [`ExportRef`](ExportRef.md)

## Constructors

### Constructor

> **new ExportHandle**(`client`, `jobId`, `runId`, `exportId`, `data`, `startResponse?`): `ExportHandle`

Defined in: [src/batch/resources.ts:225](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L225)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

##### runId

`string`

##### exportId

`string`

##### data

###### exportId

`string`

###### status

`"running"` \| `"pending"` \| `"completed"` \| `"failed"`

###### error?

`string` \| `null`

###### downloadUrl?

`string`

###### createdAt

`string`

###### expiresAt

`string`

##### startResponse?

###### exportId

`string`

###### status

`"running"` \| `"pending"` \| `"completed"` \| `"failed"`

###### createdAt

`string`

###### expiresAt

`string`

#### Returns

`ExportHandle`

#### Overrides

[`ExportRef`](ExportRef.md).[`constructor`](ExportRef.md#constructor)

## Properties

### client

> `protected` `readonly` **client**: [`ZenRowsBatchClient`](ZenRowsBatchClient.md)

Defined in: [src/batch/resources.ts:185](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L185)

#### Inherited from

[`ExportRef`](ExportRef.md).[`client`](ExportRef.md#client)

***

### jobId

> `readonly` **jobId**: `string`

Defined in: [src/batch/resources.ts:186](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L186)

#### Inherited from

[`ExportRef`](ExportRef.md).[`jobId`](ExportRef.md#jobid)

***

### runId

> `readonly` **runId**: `string`

Defined in: [src/batch/resources.ts:187](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L187)

#### Inherited from

[`ExportRef`](ExportRef.md).[`runId`](ExportRef.md#runid)

***

### exportId

> `readonly` **exportId**: `string`

Defined in: [src/batch/resources.ts:188](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L188)

#### Inherited from

[`ExportRef`](ExportRef.md).[`exportId`](ExportRef.md#exportid)

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

#### Inherited from

[`ExportRef`](ExportRef.md).[`startResponse`](ExportRef.md#startresponse)

***

### data

> `readonly` **data**: `object`

Defined in: [src/batch/resources.ts:230](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L230)

#### exportId

> **exportId**: `string`

#### status

> **status**: `"running"` \| `"pending"` \| `"completed"` \| `"failed"`

#### error?

> `optional` **error?**: `string` \| `null`

#### downloadUrl?

> `optional` **downloadUrl?**: `string`

#### createdAt

> **createdAt**: `string`

#### expiresAt

> **expiresAt**: `string`

## Methods

### load()

> **load**(): `Promise`\<`ExportHandle`\>

Defined in: [src/batch/resources.ts:194](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L194)

`GET .../exports/{id}` — fetch the export and return a loaded handle.

#### Returns

`Promise`\<`ExportHandle`\>

#### Inherited from

[`ExportRef`](ExportRef.md).[`load`](ExportRef.md#load)

***

### wait()

> **wait**(`options?`): `Promise`\<`ExportHandle`\>

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

`Promise`\<`ExportHandle`\>

#### Inherited from

[`ExportRef`](ExportRef.md).[`wait`](ExportRef.md#wait)

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

#### Inherited from

[`ExportRef`](ExportRef.md).[`downloadToPath`](ExportRef.md#downloadtopath)
