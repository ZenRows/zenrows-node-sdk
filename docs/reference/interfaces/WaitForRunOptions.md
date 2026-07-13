[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / WaitForRunOptions

# Interface: WaitForRunOptions

Defined in: [src/batch/client.ts:130](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L130)

## Properties

### runId?

> `optional` **runId?**: `string`

Defined in: [src/batch/client.ts:131](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L131)

***

### targetStatuses?

> `optional` **targetStatuses?**: `ReadonlySet`\<`string`\>

Defined in: [src/batch/client.ts:132](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L132)

***

### failureStatuses?

> `optional` **failureStatuses?**: `ReadonlySet`\<`string`\>

Defined in: [src/batch/client.ts:133](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L133)

***

### timeout?

> `optional` **timeout?**: `number`

Defined in: [src/batch/client.ts:135](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L135)

Seconds. Default 300.

***

### pollInterval?

> `optional` **pollInterval?**: `number`

Defined in: [src/batch/client.ts:137](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L137)

Seconds. Default 2.

***

### maxPollInterval?

> `optional` **maxPollInterval?**: `number`

Defined in: [src/batch/client.ts:139](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L139)

Seconds. Default 15.

***

### onProgress?

> `optional` **onProgress?**: (`run`) => `void`

Defined in: [src/batch/client.ts:140](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L140)

#### Parameters

##### run

\{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \} \| `undefined`

#### Returns

`void`
