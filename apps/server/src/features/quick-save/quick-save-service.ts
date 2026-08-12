import {
  CaptureJob,
  CaptureJobId,
  CaptureJobNotFound,
  CaptureJobStatus,
  type CreateQuickSave,
  type LibraryNotFound,
  type ReferenceSource,
  QuickSaveRejected,
  WorkspaceId,
  FolderId,
  ReferenceId
} from "@refnest/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqliteDatabase } from "../../persistence/sqlite-database"
import { decodeSqliteDateTime } from "../../persistence/decode-sqlite-date-time"
import { AiService } from "../ai/ai-service"
import { AiSettingsRepository } from "../ai/ai-settings-repository"
import { FolderService } from "../folders/folder-service"
import { ReferenceService } from "../references/reference-service"
import { CaptureEngine } from "./capture-engine"
import { CaptureFailure } from "./capture-failure"
import { classifySource, parseCaptureUrl } from "./classify-source"
import { OutboundUrlPolicy } from "../../security/outbound-url-policy"
import { MAX_CAPTURE_CONCURRENCY } from "./capture-limits"
import { QuickSaveScheduler } from "./quick-save-scheduler"

type CaptureJobRow = {
  readonly id: string
  readonly workspace_id: string
  readonly folder_id: string | null
  readonly url: string
  readonly source: string
  readonly status: string
  readonly auto_metadata: number
  readonly reference_id: string | null
  readonly error: string | null
  readonly warning: string | null
  readonly created_at: string
  readonly updated_at: string
}

const decodeSource = Schema.decodeUnknownSync(
  Schema.Literal("website", "youtube", "instagram", "x", "pinterest", "dribbble")
)
const decodeStatus = Schema.decodeUnknownSync(CaptureJobStatus)

const fromRow = (row: CaptureJobRow) =>
  new CaptureJob({
    id: CaptureJobId.make(row.id),
    workspaceId: WorkspaceId.make(row.workspace_id),
    folderId: row.folder_id === null ? null : FolderId.make(row.folder_id),
    url: row.url,
    source: decodeSource(row.source),
    status: decodeStatus(row.status),
    autoMetadata: row.auto_metadata === 1,
    referenceId:
      row.reference_id === null ? null : ReferenceId.make(row.reference_id),
    error: row.error,
    warning: row.warning,
    createdAt: decodeSqliteDateTime(row.created_at),
    updatedAt: decodeSqliteDateTime(row.updated_at)
  })

const rejection = (reason: string) => new QuickSaveRejected({ reason })

const errorReason = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    typeof error.reason === "string"
  ) {
    return error.reason
  }
  if (error instanceof Error) return error.message
  return "The capture could not be completed."
}

export type QuickSaveServiceShape = {
  readonly enqueue: (
    input: CreateQuickSave
  ) => Effect.Effect<CaptureJob, LibraryNotFound | QuickSaveRejected>
  readonly list: (
    workspaceId: WorkspaceId
  ) => Effect.Effect<ReadonlyArray<CaptureJob>, LibraryNotFound | QuickSaveRejected>
  readonly get: (
    id: CaptureJobId
  ) => Effect.Effect<CaptureJob, CaptureJobNotFound | QuickSaveRejected>
  readonly getScoped: (
    workspaceId: WorkspaceId,
    id: CaptureJobId
  ) => Effect.Effect<CaptureJob, CaptureJobNotFound | QuickSaveRejected>
}

export class QuickSaveService extends Context.Tag("QuickSaveService")<
  QuickSaveService,
  QuickSaveServiceShape
>() {}

const makeQuickSaveService = Effect.gen(function* () {
  const { connection } = yield* SqliteDatabase
  const folders = yield* FolderService
  const references = yield* ReferenceService
  const captureEngine = yield* CaptureEngine
  const ai = yield* AiService
  const aiSettings = yield* AiSettingsRepository
  const outboundUrls = yield* OutboundUrlPolicy
  const scheduler = yield* QuickSaveScheduler
  const capturePermits = yield* Effect.makeSemaphore(MAX_CAPTURE_CONCURRENCY)

  const selectById = connection.query<CaptureJobRow, [CaptureJobId]>(`
    SELECT id, workspace_id, folder_id, url, source, status, auto_metadata,
      reference_id, error, warning, created_at, updated_at
    FROM capture_jobs
    WHERE id = ?
  `)
  const selectByWorkspace = connection.query<CaptureJobRow, [WorkspaceId]>(`
    SELECT id, workspace_id, folder_id, url, source, status, auto_metadata,
      reference_id, error, warning, created_at, updated_at
    FROM capture_jobs
    WHERE workspace_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `)
  const insertJob = connection.query<
    never,
    [
      CaptureJobId,
      WorkspaceId,
      FolderId | null,
      string,
      ReferenceSource,
      number,
      string,
      string
    ]
  >(`
    INSERT INTO capture_jobs (
      id, workspace_id, folder_id, url, source, status, auto_metadata,
      reference_id, error, warning, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL, ?, ?)
  `)
  const updateJobRow = connection.query<
    never,
    [CaptureJobStatus, ReferenceId | null, string | null, string | null, string, CaptureJobId]
  >(`
    UPDATE capture_jobs
    SET status = ?, reference_id = ?, error = ?, warning = ?, updated_at = ?
    WHERE id = ?
  `)

  yield* Effect.try({
    try: () =>
      connection
        .query(`
          UPDATE capture_jobs
          SET status = 'failed',
            error = 'The app closed before this capture finished.',
            updated_at = ?
          WHERE status IN ('queued', 'capturing', 'enriching')
        `)
        .run(new Date().toISOString()),
    catch: () =>
      new CaptureFailure({
        reason: "Interrupted capture jobs could not be recovered."
      })
  })

  const get = Effect.fn("QuickSaveService.get")(function* (id: CaptureJobId) {
    const row = yield* Effect.try({
      try: () => selectById.get(id),
      catch: () => rejection("Capture jobs could not be loaded.")
    })
    if (row === null) return yield* new CaptureJobNotFound({ id })

    return yield* Effect.try({
      try: () => fromRow(row),
      catch: () => rejection("The stored capture job is invalid.")
    })
  })

  const getScoped = Effect.fn("QuickSaveService.getScoped")(function* (
    workspaceId: WorkspaceId,
    id: CaptureJobId
  ) {
    const job = yield* get(id)
    if (job.workspaceId !== workspaceId) {
      return yield* new CaptureJobNotFound({ id })
    }
    return job
  })

  const updateJob = (
    id: CaptureJobId,
    status: CaptureJobStatus,
    referenceId: ReferenceId | null,
    error: string | null,
    warning: string | null
  ): Effect.Effect<void, CaptureFailure> =>
    Effect.try({
      try: () => {
        updateJobRow.run(
          status,
          referenceId,
          error,
          warning,
          new Date().toISOString(),
          id
        )
      },
      catch: () =>
        new CaptureFailure({ reason: "The capture job status could not be saved." })
    })

  const failJob = (id: CaptureJobId, reason: string) =>
    updateJob(id, "failed", null, reason.slice(0, 1_000), null).pipe(
      Effect.catchAll(() => Effect.void)
    )

  const processJob = Effect.fn("QuickSaveService.processJob")(function* (
    job: CaptureJob,
    url: URL
  ) {
    yield* updateJob(job.id, "capturing", null, null, null)
    const captured = yield* captureEngine.capture({
      jobId: job.id,
      workspaceId: job.workspaceId,
      folderId: job.folderId,
      url,
      source: job.source
    })
    const reference = yield* references.createCaptured(captured).pipe(
      Effect.mapError((error) => new CaptureFailure({ reason: error.message }))
    )
    let warning: string | null = null

    if (job.autoMetadata) {
      const provider = yield* aiSettings.get().pipe(
        Effect.mapError((error) => new CaptureFailure({ reason: error.reason }))
      )
      if (provider.enabled) {
        yield* updateJob(job.id, "enriching", reference.id, null, null)
        const enriched = yield* ai.enrichReference(reference.id).pipe(Effect.either)
        if (enriched._tag === "Left") warning = errorReason(enriched.left)
      }
    }

    yield* updateJob(job.id, "completed", reference.id, null, warning)
  })

  const enqueue = Effect.fn("QuickSaveService.enqueue")(function* (
    input: CreateQuickSave
  ) {
    const parsedUrl = yield* parseCaptureUrl(input.url).pipe(
      Effect.mapError((error) => rejection(error.reason))
    )
    const url = yield* outboundUrls.validate(parsedUrl).pipe(
      Effect.mapError((error) => rejection(error.reason))
    )
    yield* folders
      .resolveDestination(input.workspaceId, input.folderId)
      .pipe(
        Effect.mapError((error) =>
          error._tag === "LibraryNotFound" ? error : rejection(error.reason)
        )
      )
    const now = new Date().toISOString()
    const id = CaptureJobId.make(`capture_${crypto.randomUUID()}`)
    const source = classifySource(url)
    const autoMetadata = input.autoMetadata ?? true

    yield* Effect.try({
      try: () =>
        insertJob.run(
          id,
          input.workspaceId,
          input.folderId,
          url.toString(),
          source,
          autoMetadata ? 1 : 0,
          now,
          now
        ),
      catch: () => rejection("The capture job could not be queued.")
    })

    const job = yield* get(id).pipe(
      Effect.mapError(() => rejection("The queued capture job could not be loaded."))
    )
    yield* scheduler.schedule(
      capturePermits.withPermits(1)(processJob(job, url)).pipe(
        Effect.catchAll((error) => failJob(id, errorReason(error))),
        Effect.catchAllCause(() => failJob(id, "The capture stopped unexpectedly."))
      )
    )
    return job
  })

  const list = Effect.fn("QuickSaveService.list")(function* (
    workspaceId: WorkspaceId
  ) {
    yield* folders.resolveDestination(workspaceId, null).pipe(
      Effect.mapError((error) =>
        error._tag === "LibraryNotFound" ? error : rejection(error.reason)
      )
    )
    return yield* Effect.try({
      try: () => selectByWorkspace.all(workspaceId).map(fromRow),
      catch: () => rejection("Capture jobs could not be loaded.")
    })
  })

  return QuickSaveService.of({ enqueue, list, get, getScoped })
})

export const QuickSaveServiceLive = Layer.effect(
  QuickSaveService,
  makeQuickSaveService
)
