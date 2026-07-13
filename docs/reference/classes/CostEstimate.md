[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / CostEstimate

# Class: CostEstimate

Defined in: [src/batch/estimate.ts:104](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L104)

Result of estimateCost. Credits assuming every task succeeds
once. `exact` (`min === max`) when no task uses `mode=auto`.

## Constructors

### Constructor

> **new CostEstimate**(`taskCount`, `min`, `max`, `breakdown`): `CostEstimate`

Defined in: [src/batch/estimate.ts:105](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L105)

#### Parameters

##### taskCount

`number`

##### min

`number`

##### max

`number`

##### breakdown

readonly [`CostLine`](../interfaces/CostLine.md)[]

#### Returns

`CostEstimate`

## Properties

### taskCount

> `readonly` **taskCount**: `number`

Defined in: [src/batch/estimate.ts:106](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L106)

***

### min

> `readonly` **min**: `number`

Defined in: [src/batch/estimate.ts:107](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L107)

***

### max

> `readonly` **max**: `number`

Defined in: [src/batch/estimate.ts:108](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L108)

***

### breakdown

> `readonly` **breakdown**: readonly [`CostLine`](../interfaces/CostLine.md)[]

Defined in: [src/batch/estimate.ts:109](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L109)

## Accessors

### exact

#### Get Signature

> **get** **exact**(): `boolean`

Defined in: [src/batch/estimate.ts:113](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L113)

True when the charge is a single number (no auto tasks).

##### Returns

`boolean`

***

### autoTasks

#### Get Signature

> **get** **autoTasks**(): `number`

Defined in: [src/batch/estimate.ts:118](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L118)

How many tasks use `mode=auto` — the only source of range.

##### Returns

`number`

## Methods

### toString()

> **toString**(): `string`

Defined in: [src/batch/estimate.ts:124](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L124)

#### Returns

`string`

***

### format()

> **format**(): `string`

Defined in: [src/batch/estimate.ts:130](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/estimate.ts#L130)

Multi-line breakdown table.

#### Returns

`string`
