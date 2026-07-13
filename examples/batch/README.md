# Batch API examples

Runnable samples for the Batch API client (`ZenRowsBatchClient`). Each
script reads the API key from the environment:

```bash
export ZENROWS_API_KEY=zr_...
```

Run any file with [`tsx`](https://github.com/privatenumber/tsx) (no build step):

```bash
npx tsx examples/batch/01_submit_and_wait.ts
npx tsx examples/batch/02_download_to_dir.ts <jobId> ./out
```

| Sample | Highlights |
|---|---|
| `01_submit_and_wait.ts`      | `submitRegular` → `job.wait()` → `run.results()` |
| `02_download_to_dir.ts`      | bulk download to disk with `concurrency` + `onProgress` |
| `03_csv_input.ts`            | `uploadCsv` helper end-to-end (slot + PUT + submit) |
| `04_paginated_scanners.ts`   | `iterJobs` + `runs()` async generators |
| `05_error_handling.ts`       | RFC 7807 → `BatchApiError.code` branching |
| `06_retry_failed.ts`         | `retryFailed()` — partial rerun of only the failed tasks |
| `07_hmac_rotation.ts`        | rotate / finalize HMAC signing keys |
| `08_download_all_results.ts` | `downloadAllResults()` — server-side export zip of a run |
| `09_scheduled_jobs.ts`       | `Rate`/`Calendar` schedules, `pause`/`resume`/`updateSchedule`, webhooks |
| `10_lightweight_handles.ts`  | `client.job(id)` / `client.run(id, runId)` — act on an id without a GET |

> **⚠️ Private beta.** The Batch API is currently in private beta.
> [Contact support](mailto:support@zenrows.com) to have it enabled.
