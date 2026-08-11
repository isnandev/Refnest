import {
  WINDOW_HEIGHT_MIN,
  WINDOW_WIDTH_MIN,
  WindowPlacement
} from "@starter/contracts"

export type MonitorWorkArea = {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}

const TITLEBAR_HEIGHT = 48
const MIN_VISIBLE_TITLEBAR_WIDTH = 96
const MIN_VISIBLE_TITLEBAR_HEIGHT = 28

const overlap = (
  firstStart: number,
  firstLength: number,
  secondStart: number,
  secondLength: number
) =>
  Math.max(
    0,
    Math.min(firstStart + firstLength, secondStart + secondLength) -
      Math.max(firstStart, secondStart)
  )

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

/**
 * Keeps restorable bounds reachable after monitors are unplugged or rearranged.
 * Coordinates and sizes are physical pixels, matching Tauri's window events.
 */
export const normalizeWindowPlacementForMonitors = (
  placement: WindowPlacement,
  monitors: ReadonlyArray<MonitorWorkArea>
): WindowPlacement | null => {
  const monitor = monitors
    .filter(
      ({ size }) =>
        size.width >= WINDOW_WIDTH_MIN && size.height >= WINDOW_HEIGHT_MIN
    )
    .map((candidate) => ({
      candidate,
      visibleWidth: overlap(
        placement.x,
        placement.width,
        candidate.position.x,
        candidate.size.width
      ),
      visibleTitlebarHeight: overlap(
        placement.y,
        Math.min(TITLEBAR_HEIGHT, placement.height),
        candidate.position.y,
        candidate.size.height
      )
    }))
    .filter(
      ({ visibleWidth, visibleTitlebarHeight }) =>
        visibleWidth >= MIN_VISIBLE_TITLEBAR_WIDTH &&
        visibleTitlebarHeight >= MIN_VISIBLE_TITLEBAR_HEIGHT
    )
    .sort(
      (left, right) =>
        right.visibleWidth * right.visibleTitlebarHeight -
        left.visibleWidth * left.visibleTitlebarHeight
    )[0]?.candidate

  if (monitor === undefined) return null

  const width = Math.min(placement.width, monitor.size.width)
  const height = Math.min(placement.height, monitor.size.height)
  const minimumX = monitor.position.x - width + MIN_VISIBLE_TITLEBAR_WIDTH
  const maximumX =
    monitor.position.x + monitor.size.width - MIN_VISIBLE_TITLEBAR_WIDTH
  const minimumY = monitor.position.y
  const maximumY =
    monitor.position.y + monitor.size.height - MIN_VISIBLE_TITLEBAR_HEIGHT

  return new WindowPlacement({
    x: Math.round(clamp(placement.x, minimumX, maximumX)),
    y: Math.round(clamp(placement.y, minimumY, maximumY)),
    width: Math.round(width),
    height: Math.round(height),
    maximized: placement.maximized
  })
}
