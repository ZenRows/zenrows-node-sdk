[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / AsyncStream

# Class: AsyncStream\<T\>

Defined in: [src/batch/stream.ts:24](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L24)

A lazy async sequence with ergonomic helpers.

The Batch scanners (`iterJobs`, `iterResults`, `run.results()`, …)
page over the network, so they're **async** iterables — and the
language's iterator helpers (`.forEach`, `.map`, …) only exist on
*sync* iterators today (async-iterator helpers are still a proposal).
`AsyncStream` fills that gap without giving up streaming: it's a
normal `for await` iterable AND exposes callback-style methods that
consume it lazily, one page at a time — never buffering the whole
result set (unless you ask, via `toArray`).

```ts
await run.results({ status: "successful" }).forEach((row) => {
  console.log(row.externalId, row.resultUrl);
});

// still a plain async iterable:
for await (const row of run.results()) { ... }
```

Backed by a factory so each consumption starts a fresh scan.

## Type Parameters

### T

`T`

## Implements

- `AsyncIterable`\<`T`\>

## Constructors

### Constructor

> **new AsyncStream**\<`T`\>(`factory`): `AsyncStream`\<`T`\>

Defined in: [src/batch/stream.ts:25](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L25)

#### Parameters

##### factory

() => `AsyncIterable`\<`T`\>

#### Returns

`AsyncStream`\<`T`\>

## Methods

### \[asyncIterator\]()

> **\[asyncIterator\]**(): `AsyncIterator`\<`T`\>

Defined in: [src/batch/stream.ts:27](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L27)

#### Returns

`AsyncIterator`\<`T`\>

#### Implementation of

`AsyncIterable.[asyncIterator]`

***

### forEach()

> **forEach**(`callback`): `Promise`\<`void`\>

Defined in: [src/batch/stream.ts:36](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L36)

Call `callback` for each item, in order, awaiting it if it returns
a promise (so async work runs sequentially). Streams — items are
pulled one at a time, never all buffered.

#### Parameters

##### callback

(`item`, `index`) => `unknown`

#### Returns

`Promise`\<`void`\>

***

### toArray()

> **toArray**(): `Promise`\<`T`[]\>

Defined in: [src/batch/stream.ts:45](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L45)

Collect every item into an array. Buffers the whole sequence.

#### Returns

`Promise`\<`T`[]\>

***

### map()

> **map**\<`U`\>(`fn`): `AsyncStream`\<`U`\>

Defined in: [src/batch/stream.ts:52](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L52)

Lazily transform each item, yielding a new stream (no buffering).

#### Type Parameters

##### U

`U`

#### Parameters

##### fn

(`item`, `index`) => `U` \| `Promise`\<`U`\>

#### Returns

`AsyncStream`\<`U`\>

***

### filter()

> **filter**(`predicate`): `AsyncStream`\<`T`\>

Defined in: [src/batch/stream.ts:64](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/stream.ts#L64)

Lazily keep items matching `predicate`, yielding a new stream.

#### Parameters

##### predicate

(`item`, `index`) => `boolean` \| `Promise`\<`boolean`\>

#### Returns

`AsyncStream`\<`T`\>
