[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / SubmitFields

# Interface: SubmitFields

Defined in: [src/batch/client.ts:106](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L106)

Fields common to every submit, independent of the task source.

## Properties

### zenrowsParams?

> `optional` **zenrowsParams?**: `object`

Defined in: [src/batch/client.ts:107](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L107)

#### Index Signature

\[`key`: `string`\]: `string` \| `number` \| `boolean`

***

### externalId?

> `optional` **externalId?**: `string`

Defined in: [src/batch/client.ts:108](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L108)

***

### name?

> `optional` **name?**: `string`

Defined in: [src/batch/client.ts:109](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L109)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `string`\>

Defined in: [src/batch/client.ts:110](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L110)

***

### webhook?

> `optional` **webhook?**: [`WebhookInput`](../type-aliases/WebhookInput.md)

Defined in: [src/batch/client.ts:111](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L111)

***

### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

Defined in: [src/batch/client.ts:112](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L112)

***

### waitForIngest?

> `optional` **waitForIngest?**: `boolean`

Defined in: [src/batch/client.ts:113](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L113)
