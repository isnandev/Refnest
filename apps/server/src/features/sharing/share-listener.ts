import { SharingFailed } from "@refnest/contracts"
import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Scope,
  SynchronizedRef
} from "effect"

/**
 * How the listener is built, supplied by the composition root. Keeping HTTP out
 * of this module is what makes start/stop testable without binding a port.
 *
 * The branch must close over an *already built* context. Handing back a layer
 * that still describes the application graph would rebuild it on every start —
 * a second SQLite connection against the same file.
 */
export type ShareBranch = (options: {
  readonly hostname: string
  readonly port: number
  readonly ready: Deferred.Deferred<number>
}) => Layer.Layer<never, unknown>

type Running = {
  readonly scope: Scope.CloseableScope
  readonly port: number
}

type StartOutcome = readonly [
  Effect.Effect<number, SharingFailed>,
  Option.Option<Running>
]

export type ShareListenerShape = {
  readonly start: (
    hostname: string,
    port: number
  ) => Effect.Effect<number, SharingFailed>
  /** Completes only once the port is actually released. */
  readonly stop: Effect.Effect<void>
  readonly runningPort: Effect.Effect<number | null>
}

export class ShareListener extends Context.Tag("ShareListener")<
  ShareListener,
  ShareListenerShape
>() {}

const describeBindFailure = (cause: Cause.Cause<unknown>, port: number) => {
  const rendered = Cause.pretty(cause)
  if (/in use|EADDRINUSE/i.test(rendered)) {
    return `Port ${port} is already in use. Choose a different port.`
  }
  if (/permission|EACCES/i.test(rendered)) {
    return `This device does not have permission to listen on port ${port}.`
  }
  return `Sharing could not start on port ${port}.`
}

export const makeShareListener = (branch: ShareBranch) =>
  Effect.gen(function* () {
    const state = yield* SynchronizedRef.make<Option.Option<Running>>(
      Option.none()
    )

    const closeRunning = (current: Option.Option<Running>) =>
      Option.isSome(current)
        ? Scope.close(current.value.scope, Exit.void)
        : Effect.void

    const start = (hostname: string, port: number) =>
      SynchronizedRef.modifyEffect(state, (current) =>
        Effect.gen(function* () {
          yield* closeRunning(current)

          const scope = yield* Scope.make()
          const ready = yield* Deferred.make<number>()
          const fiber = yield* Effect.forkIn(
            Layer.launch(branch({ hostname, port, ready })),
            scope
          )

          // Awaiting the deferred alone would hang forever when the bind
          // fails, so the launch fiber's exit races it.
          const outcome = yield* Effect.raceFirst(
            Deferred.await(ready).pipe(
              Effect.map((bound) => ({ _tag: "ready", bound }) as const)
            ),
            Fiber.await(fiber).pipe(
              Effect.map((exit) => ({ _tag: "exited", exit }) as const)
            )
          )

          if (outcome._tag === "exited") {
            yield* Scope.close(scope, Exit.void)
            const reason = Exit.isFailure(outcome.exit)
              ? describeBindFailure(outcome.exit.cause, port)
              : `Sharing stopped immediately on port ${port}.`

            const failure: StartOutcome = [
              Effect.fail(new SharingFailed({ reason })),
              Option.none()
            ]
            return failure
          }

          const started: StartOutcome = [
            Effect.succeed(outcome.bound),
            Option.some({ scope, port: outcome.bound })
          ]
          return started
        })
      ).pipe(Effect.flatten)

    const stop = SynchronizedRef.updateEffect(state, (current) =>
      closeRunning(current).pipe(Effect.as(Option.none<Running>()))
    )

    const runningPort = SynchronizedRef.get(state).pipe(
      Effect.map((current) =>
        Option.isSome(current) ? current.value.port : null
      )
    )

    return ShareListener.of({ start, stop, runningPort })
  })

export const shareListenerLive = (branch: ShareBranch) =>
  Layer.scoped(
    ShareListener,
    Effect.acquireRelease(makeShareListener(branch), (listener) => listener.stop)
  )
