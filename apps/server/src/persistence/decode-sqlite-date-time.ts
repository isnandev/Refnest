import { Schema } from "effect"

export const decodeSqliteDateTime = Schema.decodeUnknownSync(Schema.DateTimeUtc)
