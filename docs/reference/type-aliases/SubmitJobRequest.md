[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / SubmitJobRequest

# Type Alias: SubmitJobRequest

> **SubmitJobRequest** = `Omit`\<`Camelize`\<`S`\[`"SubmitJobRequest"`\]\>, `"status"`\> & `object`

Defined in: [src/batch/types.ts:92](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/types.ts#L92)

Body of `POST /jobs`. `status` is optional here (the server defaults
it to `closed`); the type-specific `submitRegular` / `submitOpen` /
`submitScheduled` shortcuts set it for you.

## Type Declaration

### status?

> `optional` **status?**: `"open"` \| `"closed"`
