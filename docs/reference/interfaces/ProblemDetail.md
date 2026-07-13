[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ProblemDetail

# Interface: ProblemDetail

Defined in: [src/batch/errors.ts:20](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L20)

Decoded RFC 7807 Problem body.

## Properties

### type

> **type**: `string`

Defined in: [src/batch/errors.ts:21](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L21)

***

### title

> **title**: `string`

Defined in: [src/batch/errors.ts:22](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L22)

***

### status

> **status**: `number`

Defined in: [src/batch/errors.ts:23](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L23)

***

### code

> **code**: `string`

Defined in: [src/batch/errors.ts:24](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L24)

***

### detail?

> `optional` **detail?**: `string`

Defined in: [src/batch/errors.ts:25](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L25)

***

### instance?

> `optional` **instance?**: `string`

Defined in: [src/batch/errors.ts:26](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L26)

***

### extras?

> `optional` **extras?**: `Record`\<`string`, `unknown`\>

Defined in: [src/batch/errors.ts:28](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/errors.ts#L28)

Any non-standard members (e.g. `invalid_tasks`) kept verbatim.
