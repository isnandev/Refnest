import type {
  CallToolResult,
  McpServer,
  RegisteredTool,
  StandardSchemaWithJSON,
  ToolAnnotations
} from "@modelcontextprotocol/server"
import { z } from "zod"
import { invalidArguments, invalidToolOutput } from "./mcp-results"
import { ToolErrorOutputSchema } from "./mcp-schemas"

type ToolConfig<Output extends z.ZodType, Input extends z.ZodType> = {
  readonly title?: string
  readonly description?: string
  readonly inputSchema: Input
  readonly outputSchema: Output
  readonly annotations?: ToolAnnotations
  readonly _meta?: Record<string, unknown>
}

/**
 * Keeps the advertised Zod JSON Schema while moving validation into RefNest's
 * safe result envelope instead of the SDK's free-form validation text.
 */
const deferSdkValidation = (
  schema: StandardSchemaWithJSON
): StandardSchemaWithJSON<unknown, unknown> => {
  const standard = schema["~standard"]
  return {
    "~standard": {
      version: 1,
      vendor: "refnest",
      validate: (value) => ({ value }),
      jsonSchema: standard.jsonSchema
    }
  }
}

export const registerRefNestTool = <
  Output extends z.ZodType,
  Input extends z.ZodType
>(
  server: McpServer,
  name: string,
  config: ToolConfig<Output, Input>,
  callback: (input: z.output<Input>) => CallToolResult | Promise<CallToolResult>
): RegisteredTool => {
  const resultSchema = z.union([config.outputSchema, ToolErrorOutputSchema])
  return server.registerTool(
    name,
    {
      ...config,
      inputSchema: deferSdkValidation(config.inputSchema),
      outputSchema: deferSdkValidation(resultSchema)
    },
    async (input) => {
      try {
        const parsedInput = await config.inputSchema.safeParseAsync(input)
        if (!parsedInput.success) return invalidArguments()

        const result = await callback(parsedInput.data)
        const parsedOutput = await resultSchema.safeParseAsync(
          result.structuredContent
        )
        return parsedOutput.success ? result : invalidToolOutput()
      } catch {
        return invalidToolOutput()
      }
    }
  )
}
