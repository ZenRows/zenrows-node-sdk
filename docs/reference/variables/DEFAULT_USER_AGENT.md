[**ZenRows Batch — Node SDK Reference**](../README.md)

***

[ZenRows Batch — Node SDK Reference](../README.md) / DEFAULT\_USER\_AGENT

# Variable: DEFAULT\_USER\_AGENT

> `const` **DEFAULT\_USER\_AGENT**: `string`

Defined in: [src/batch/client.ts:80](https://github.com/ZenRows/zenrows-node-sdk/blob/151af9b4da6b1fc9122aa258ffaf1986d92756b3/src/batch/client.ts#L80)

Public surface for the ZenRows Batch (async-job) API.

What's where:
  - [ZenRowsBatchClient](../classes/ZenRowsBatchClient.md) — the friendly typed facade. One
    method per OpenAPI operation, returning camelCase models.
  - `types` — camelCase model types derived from the generated
    `schema.ts` (regenerate from `docs/openapi.yaml` via
    `pnpm generate`). Do NOT hand-edit field names.
  - [BatchApiError](../classes/BatchApiError.md) — RFC 7807 mapping.

Completion is surfaced via waiters (`job.wait()` / `run.wait()`) and
webhooks — poll or get notified; there's no callback to wire up.
