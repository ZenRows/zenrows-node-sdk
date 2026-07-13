[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / DownloadToDirOptions

# Interface: DownloadToDirOptions

Defined in: [src/batch/download.ts:64](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L64)

## Properties

### runId?

> `optional` **runId?**: `string`

Defined in: [src/batch/download.ts:65](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L65)

***

### status?

> `optional` **status?**: `string`

Defined in: [src/batch/download.ts:66](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L66)

***

### nameFn?

> `optional` **nameFn?**: (`row`) => `string`

Defined in: [src/batch/download.ts:67](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L67)

#### Parameters

##### row

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

`string`

***

### useExternalId?

> `optional` **useExternalId?**: `boolean`

Defined in: [src/batch/download.ts:68](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L68)

***

### concurrency?

> `optional` **concurrency?**: `number`

Defined in: [src/batch/download.ts:69](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L69)

***

### onProgress?

> `optional` **onProgress?**: (`done`) => `void`

Defined in: [src/batch/download.ts:70](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L70)

#### Parameters

##### done

`number`

#### Returns

`void`

***

### maxFiles?

> `optional` **maxFiles?**: `number`

Defined in: [src/batch/download.ts:71](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L71)

***

### maxBytesPerFile?

> `optional` **maxBytesPerFile?**: `number`

Defined in: [src/batch/download.ts:72](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/download.ts#L72)
