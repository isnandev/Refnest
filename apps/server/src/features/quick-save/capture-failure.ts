import { Data } from "effect"

export class CaptureFailure extends Data.TaggedError("CaptureFailure")<{
  readonly reason: string
}> {}
