import { Context, Effect, Layer } from "effect"

export type QuickSaveSchedulerShape = {
  readonly schedule: (task: Effect.Effect<void>) => Effect.Effect<void>
}

export class QuickSaveScheduler extends Context.Tag("QuickSaveScheduler")<
  QuickSaveScheduler,
  QuickSaveSchedulerShape
>() {}

/** Keeps queued capture fibers alive for the service scope and interrupts them on shutdown. */
export const QuickSaveSchedulerLive = Layer.scoped(
  QuickSaveScheduler,
  Effect.gen(function* () {
    const scope = yield* Effect.scope

    return QuickSaveScheduler.of({
      schedule: (task) => Effect.forkIn(task, scope).pipe(Effect.asVoid)
    })
  })
)
