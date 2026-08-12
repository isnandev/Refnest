import { HttpApiBuilder } from "@effect/platform"
import { RefNestApi } from "@refnest/contracts"
import { Effect } from "effect"
import { toPublicReference } from "../references/reference-model"
import { ImageConverter } from "./image-converter-service"

export const ConverterHttpLive = HttpApiBuilder.group(
  RefNestApi,
  "converter",
  (handlers) =>
    Effect.gen(function* () {
      const converter = yield* ImageConverter

      return handlers
        .handle("convertLocal", ({ payload }) => converter.convertLocal(payload))
        .handle("convertReference", ({ path, payload }) =>
          converter
            .convertReference(path.id, payload)
            .pipe(Effect.map(toPublicReference))
        )
    })
)
