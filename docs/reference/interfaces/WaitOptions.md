[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / WaitOptions

# Interface: WaitOptions

Defined in: [src/batch/resources.ts:62](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L62)

## Properties

### targetStatuses?

> `optional` **targetStatuses?**: `ReadonlySet`\<`string`\>

Defined in: [src/batch/resources.ts:63](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L63)

***

### failureStatuses?

> `optional` **failureStatuses?**: `ReadonlySet`\<`string`\>

Defined in: [src/batch/resources.ts:64](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L64)

***

### timeout?

> `optional` **timeout?**: `number`

Defined in: [src/batch/resources.ts:65](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L65)

***

### pollInterval?

> `optional` **pollInterval?**: `number`

Defined in: [src/batch/resources.ts:66](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L66)

***

### onProgress?

> `optional` **onProgress?**: (`run`) => `void`

Defined in: [src/batch/resources.ts:67](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L67)

#### Parameters

##### run

\{ `runId`: `string`; `jobId`: `string`; `runSequence`: `number`; `status`: `"deleted"` \| `"running"` \| `"pending"` \| `"completed"` \| `"stopped"` \| `"failed"`; `stats`: \{ `total`: `number`; `completed`: `number`; `successful`: `number`; `failed`: `number`; `failureReasons?`: \{\[`key`: `string`\]: `number`; \}; `spend?`: \{ `credits`: `number`; `cost`: `number`; \}; \}; `lastBatchReceived?`: `boolean`; `pauseState?`: `"active"` \| `"paused"`; `ingestStatus?`: `"pending"` \| `"done"`; `createdAt`: `string`; `updatedAt`: `string`; `failureReason?`: `"insufficient_credits"` \| `"subscription_inactive"`; \} \| `undefined`

#### Returns

`void`
