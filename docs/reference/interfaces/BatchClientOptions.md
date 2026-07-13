[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / BatchClientOptions

# Interface: BatchClientOptions

Defined in: [src/batch/client.ts:82](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L82)

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: [src/batch/client.ts:84](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L84)

Override the API base URL (advanced / testing).

***

### timeout?

> `optional` **timeout?**: `number`

Defined in: [src/batch/client.ts:86](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L86)

Request timeout in milliseconds. Default 30000.

***

### retries?

> `optional` **retries?**: `number`

Defined in: [src/batch/client.ts:93](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L93)

Max automatic retries for transient failures (429/502/503/504 and
network errors) on idempotent requests — GET/PUT/DELETE, plus POSTs
carrying an `idempotencyKey`. Jittered exponential backoff, honoring
`Retry-After`. Default 3; set 0 to disable.

***

### userAgent?

> `optional` **userAgent?**: `string`

Defined in: [src/batch/client.ts:94](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L94)

***

### fetch?

> `optional` **fetch?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: [src/batch/client.ts:96](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L96)

Inject a `fetch` implementation (testing).

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>
