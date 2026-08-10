import { Schema } from "effect"

export class HealthReport extends Schema.Class<HealthReport>("HealthReport")({
  status: Schema.Literal("ok"),
  runtime: Schema.NonEmptyTrimmedString,
  version: Schema.NonEmptyTrimmedString,
  uptimeMillis: Schema.Number.pipe(Schema.nonNegative())
}) {}
