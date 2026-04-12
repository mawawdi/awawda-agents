export function getCurrentTimeLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export function placeholderSeed(value: string): number {
  return value.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
}

export function placeholderColor(value: string): string {
  const paletteSteps = ['#fef2f2', '#f0fdfa', '#f6efe5', '#eef2ff', '#f5f5f4'] as const
  return paletteSteps[placeholderSeed(value) % paletteSteps.length] ?? '#f5f5f4'
}

export function placeholderImageUri(seed: string, width: number, height: number): string {
  const safeWidth = Math.max(1, Math.floor(width))
  const safeHeight = Math.max(1, Math.floor(height))
  const gradients = [
    ['#7f1d1d', '#0d9488'],
    ['#9a3412', '#1d4ed8'],
    ['#7c2d12', '#0f766e'],
    ['#a16207', '#0f766e'],
    ['#312e81', '#166534'],
  ] as const
  const [fromColor, toColor] = gradients[placeholderSeed(seed) % gradients.length] ?? gradients[0]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${fromColor}"/><stop offset="100%" stop-color="${toColor}"/></linearGradient></defs><rect width="${safeWidth}" height="${safeHeight}" fill="url(#g)"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
