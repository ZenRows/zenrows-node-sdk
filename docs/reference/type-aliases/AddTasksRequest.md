[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / AddTasksRequest

# Type Alias: AddTasksRequest

> **AddTasksRequest** = `Omit`\<`Camelize`\<`S`\[`"AddTasksRequest"`\]\>, `"lastBatch"`\> & `object`

Defined in: [src/batch/types.ts:97](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/types.ts#L97)

Body of `POST /jobs/{id}/tasks`. `lastBatch` defaults to false.

## Type Declaration

### lastBatch?

> `optional` **lastBatch?**: `boolean`
