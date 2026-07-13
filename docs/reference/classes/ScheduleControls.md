[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / ScheduleControls

# Class: ScheduleControls

Defined in: [src/batch/resources.ts:353](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L353)

Operations on a scheduled job's schedule, reached via `job.schedule`.

## Constructors

### Constructor

> **new ScheduleControls**(`client`, `jobId`): `ScheduleControls`

Defined in: [src/batch/resources.ts:354](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L354)

#### Parameters

##### client

[`ZenRowsBatchClient`](ZenRowsBatchClient.md)

##### jobId

`string`

#### Returns

`ScheduleControls`

## Methods

### pause()

> **pause**(): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:363](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L363)

`POST /jobs/{id}/schedule/state` → `paused` — skip future scheduled
fires (an in-flight run keeps running). Undo with `resume()`.

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>

***

### resume()

> **resume**(): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:372](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L372)

`POST /jobs/{id}/schedule/state` → `active` — re-enable scheduled fires.

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>

***

### update()

> **update**(`schedule`): `Promise`\<[`JobHandle`](JobHandle.md)\>

Defined in: [src/batch/resources.ts:381](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/resources.ts#L381)

`PUT /jobs/{id}/schedule` — replace the schedule ([ScheduleInput](../type-aliases/ScheduleInput.md) object).

#### Parameters

##### schedule

[`ScheduleInput`](../type-aliases/ScheduleInput.md)

#### Returns

`Promise`\<[`JobHandle`](JobHandle.md)\>
