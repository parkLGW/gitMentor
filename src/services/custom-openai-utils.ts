export function shouldFallbackCustomStreaming(status: number): boolean {
  return [501, 502, 503, 504].includes(status)
}
