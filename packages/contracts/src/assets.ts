import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import { ReferenceId } from "./library"
import { WorkspaceId } from "./workspace"

export const ReferenceAssetVariant = Schema.Literal("asset", "preview")
export type ReferenceAssetVariant = typeof ReferenceAssetVariant.Type

export class ReferenceAssetNotFound extends Schema.TaggedError<ReferenceAssetNotFound>()(
  "ReferenceAssetNotFound",
  {
    workspaceId: WorkspaceId,
    referenceId: ReferenceId,
    variant: ReferenceAssetVariant
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class ReferenceAssetDeliveryFailed extends Schema.TaggedError<ReferenceAssetDeliveryFailed>()(
  "ReferenceAssetDeliveryFailed",
  { reason: Schema.NonEmptyTrimmedString },
  HttpApiSchema.annotations({ status: 400 })
) {
  override get message(): string {
    return this.reason
  }
}
