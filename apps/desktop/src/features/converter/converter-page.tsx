import {
  DEFAULT_IMAGE_QUALITY,
  MAX_CONVERSION_BATCH,
  type ImageConversionReport,
  type ImageConvertFormat
} from "@refnest/contracts"
import {
  ArrowLeft,
  CircleAlert,
  FolderOpen,
  Images,
  LoaderCircle,
  Replace,
  X
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { TitleBar } from "@/features/window/title-bar"
import { formatFileSize } from "@/lib/format"
import { FormatChoice, QualityField } from "./converter-controls"
import { useImageConverter } from "./use-image-converter"

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

const savings = (sourceBytes: number, outputBytes: number) => {
  if (sourceBytes <= 0) return null
  const change = Math.round(((sourceBytes - outputBytes) / sourceBytes) * 100)
  if (change === 0) return "no change"
  return change > 0 ? `${change}% smaller` : `${Math.abs(change)}% larger`
}

/** Converts images picked from disk without touching the reference library. */
export function ConverterPage({ onClose }: { readonly onClose: () => void }) {
  const converter = useImageConverter()
  const [paths, setPaths] = useState<ReadonlyArray<string>>([])
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null)
  const [format, setFormat] = useState<ImageConvertFormat>("webp")
  const [quality, setQuality] = useState(DEFAULT_IMAGE_QUALITY)
  const [report, setReport] = useState<ImageConversionReport | null>(null)

  const chooseImages = async () => {
    const selected = await converter.selectImages()
    if (selected.length === 0) return
    setReport(null)
    // Re-picking replaces the batch rather than appending a duplicate set.
    setPaths(selected.slice(0, MAX_CONVERSION_BATCH))
  }

  const chooseOutputDirectory = async () => {
    const directory = await converter.selectOutputDirectory()
    if (directory !== null) setOutputDirectory(directory)
  }

  const convert = async () => {
    if (outputDirectory === null) return
    const result = await converter.convertLocal(
      paths,
      outputDirectory,
      format,
      quality
    )
    if (result !== null) setReport(result)
  }

  const ready = paths.length > 0 && outputDirectory !== null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stage text-foreground">
      <TitleBar
        leading={
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5"
            data-tauri-drag-region
          >
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              <ArrowLeft aria-hidden="true" />
              Library
            </Button>
            <p className="min-w-0 truncate px-1 text-label text-muted-foreground">
              <span className="text-foreground">Convert images</span>
            </p>
          </div>
        }
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-none bg-stage"
      >
        <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-8 lg:px-12 lg:py-10">
          <header>
            <div className="flex size-12 items-center justify-center rounded-md border bg-surface">
              <Replace className="size-5" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-h1">Convert images</h1>
            <p className="mt-1 max-w-[620px] text-body-md text-muted-foreground">
              Convert PNG, JPEG, and WebP files between formats. Originals are
              never modified — every result is written as a new file.
            </p>
          </header>

          <section className="pt-10" aria-labelledby="converter-source-title">
            <h2 id="converter-source-title" className="text-h2">
              Images
            </h2>
            <Card className="mt-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={converter.pending}
                  onClick={() => void chooseImages()}
                >
                  <Images aria-hidden="true" />
                  Choose images…
                </Button>
                <p className="text-body-sm text-muted-foreground">
                  {paths.length === 0
                    ? `Select up to ${MAX_CONVERSION_BATCH} images.`
                    : `${paths.length} selected`}
                </p>
              </div>

              {paths.length > 0 && (
                <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                  {paths.map((path) => (
                    <li
                      key={path}
                      className="flex items-center gap-2 rounded-sm bg-surface-muted px-2.5 py-1.5"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-body-sm"
                        title={path}
                      >
                        {fileName(path)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${fileName(path)}`}
                        disabled={converter.pending}
                        onClick={() =>
                          setPaths((current) =>
                            current.filter((item) => item !== path)
                          )
                        }
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section className="pt-10" aria-labelledby="converter-output-title">
            <h2 id="converter-output-title" className="text-h2">
              Output
            </h2>
            <Card className="mt-3 space-y-5 p-4">
              <div className="space-y-1.5">
                <Label>Save converted files to</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={converter.pending}
                    onClick={() => void chooseOutputDirectory()}
                  >
                    <FolderOpen aria-hidden="true" />
                    Choose folder…
                  </Button>
                  <p
                    className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground"
                    title={outputDirectory ?? undefined}
                  >
                    {outputDirectory ?? "No folder chosen yet."}
                  </p>
                </div>
              </div>

              <FormatChoice
                id="converter-format"
                format={format}
                disabled={converter.pending}
                onChange={setFormat}
              />

              <QualityField
                id="converter-quality"
                quality={quality}
                format={format}
                disabled={converter.pending}
                onChange={setQuality}
              />
            </Card>
          </section>

          {converter.actionError !== null && (
            <p
              role="alert"
              className="mt-6 flex items-center gap-2 rounded-sm bg-danger-container p-3 text-body-sm text-danger"
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {converter.actionError}
            </p>
          )}

          <div className="flex justify-end pt-6">
            <Button
              type="button"
              disabled={!ready || converter.pending}
              onClick={() => void convert()}
            >
              {converter.pending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Replace aria-hidden="true" />
              )}
              {converter.pending
                ? "Converting…"
                : `Convert ${paths.length > 0 ? paths.length : ""} ${
                    paths.length === 1 ? "image" : "images"
                  }`.replace(/\s+/g, " ")}
            </Button>
          </div>

          {report !== null && (
            <section className="pt-10" aria-labelledby="converter-results-title">
              <h2 id="converter-results-title" className="text-h2">
                Results
              </h2>
              <p className="mt-1 text-body-sm text-muted-foreground" aria-live="polite">
                {report.converted.length} converted
                {report.failed.length > 0 && `, ${report.failed.length} failed`}
              </p>

              <Card className="mt-3 gap-0 divide-y p-0">
                {report.converted.map((item) => (
                  <div key={item.outputPath} className="p-3">
                    <p
                      className="truncate text-body-sm"
                      title={item.outputPath}
                    >
                      {fileName(item.outputPath)}
                    </p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {item.width.toLocaleString()} ×{" "}
                      {item.height.toLocaleString()} ·{" "}
                      {formatFileSize(item.sourceBytes)} →{" "}
                      {formatFileSize(item.outputBytes)}
                      {(() => {
                        const change = savings(item.sourceBytes, item.outputBytes)
                        return change === null ? "" : ` · ${change}`
                      })()}
                    </p>
                  </div>
                ))}

                {report.failed.map((item) => (
                  <div key={item.sourcePath} className="p-3">
                    <p
                      className="flex items-center gap-2 truncate text-body-sm text-danger"
                      title={item.sourcePath}
                    >
                      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                      {fileName(item.sourcePath)}
                    </p>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                ))}
              </Card>
            </section>
          )}

          <div className="h-10" />
        </div>
      </main>
    </div>
  )
}
