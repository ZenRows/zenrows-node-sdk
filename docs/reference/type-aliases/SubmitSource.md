[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / SubmitSource

# Type Alias: SubmitSource

> **SubmitSource** = \{ `urls`: [`TaskInputLike`](TaskInputLike.md)[]; `fileInputId?`: `never`; \} \| \{ `fileInputId`: `string`; `urls?`: `never`; \}

Defined in: [src/batch/client.ts:117](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L117)

The task source — exactly one of `urls` / `fileInputId` (compiler-enforced).
