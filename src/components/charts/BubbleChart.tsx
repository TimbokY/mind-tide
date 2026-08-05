import { useMemo } from 'react'

interface WordItem {
  tag: string
  count: number
}

interface PlacedBubble {
  tag: string
  count: number
  cx: number
  cy: number
  r: number
  color1: string
  color2: string
  gradientId: string
  fontSize: number
}

interface BubbleChartProps {
  words: WordItem[]
  width?: number
  height?: number
  colorScheme?: 'purple' | 'teal'
  maxWords?: number
}

const PURPLE_GRADIENTS = [
  ['#c4b5fd', '#8b5cf6'],
  ['#a78bfa', '#7c3aed'],
  ['#8b5cf6', '#6d28d9'],
  ['#ddd6fe', '#a78bfa'],
  ['#ede9fe', '#c4b5fd'],
  ['#7c3aed', '#5b21b6'],
]
const TEAL_GRADIENTS = [
  ['#99f6e4', '#2dd4bf'],
  ['#5eead4', '#14b8a6'],
  ['#2dd4bf', '#0d9488'],
  ['#14b8a6', '#0f766e'],
  ['#ccfbf1', '#5eead4'],
  ['#0d9488', '#115e59'],
]

function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x303f)) {
      w += fontSize * 0.92
    } else {
      w += fontSize * 0.58
    }
  }
  return w
}

function placeBubbles(
  words: WordItem[],
  width: number,
  height: number,
  gradients: string[][],
  maxWords: number,
): PlacedBubble[] {
  if (words.length === 0) return []

  const sorted = [...words].sort((a, b) => b.count - a.count).slice(0, maxWords)
  const maxCount = Math.max(...sorted.map((w) => w.count), 1)
  const minR = 24
  const maxR = 64

  const result: PlacedBubble[] = []
  const bubbles: { cx: number; cy: number; r: number }[] = []
  const padding = 6

  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i]
    const ratio = w.count / maxCount
    const r = Math.round(minR + (maxR - minR) * Math.sqrt(ratio))
    const [c1, c2] = gradients[i % gradients.length]
    let fontSize = Math.round(r * 0.56)
    const maxTextWidth = r * 2 - 14
    const estWidth = estimateTextWidth(w.tag, fontSize)
    if (estWidth > maxTextWidth) {
      fontSize = Math.max(10, Math.round(fontSize * (maxTextWidth / estWidth)))
    }

    const cx = width / 2
    const cy = height / 2

    let found = false

    for (let step = 0; step < 2000; step++) {
      const radius = step * 2.2
      const angle = step * 0.6
      const px = cx + radius * Math.cos(angle)
      const py = cy + radius * Math.sin(angle)

      if (px - r < 2 || py - r < 2 || px + r > width - 2 || py + r > height - 2) continue

      let overlaps = false
      for (const b of bubbles) {
        const dx = px - b.cx
        const dy = py - b.cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < b.r + r + padding) {
          overlaps = true
          break
        }
      }

      if (!overlaps) {
        bubbles.push({ cx: px, cy: py, r })
        result.push({
          tag: w.tag,
          count: w.count,
          cx: px,
          cy: py,
          r,
          color1: c1,
          color2: c2,
          gradientId: `bb-${i}`,
          fontSize,
        })
        found = true
        break
      }
    }

    if (!found && i < 3) {
      const fallbackY = height / 3 + i * 45
      result.push({
        tag: w.tag,
        count: w.count,
        cx: width / 2,
        cy: fallbackY,
        r,
        color1: c1,
        color2: c2,
        gradientId: `bb-${i}`,
        fontSize,
      })
    }
  }

  return result
}

export function BubbleChart({
  words,
  width = 340,
  height = 320,
  colorScheme = 'purple',
  maxWords = 15,
}: BubbleChartProps) {
  const palettes = colorScheme === 'teal' ? TEAL_GRADIENTS : PURPLE_GRADIENTS

  const placed = useMemo(
    () => placeBubbles(words, width, height, palettes, maxWords),
    [words, width, height, palettes, maxWords],
  )

  if (placed.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <span className="text-xs text-[#64748b]">暂无数据</span>
      </div>
    )
  }

  const maxCount = Math.max(...placed.map((w) => w.count), 1)

  return (
    <svg width={width} height={height} className="overflow-visible block">
      <defs>
        {placed.map((b) => (
          <radialGradient key={b.gradientId} id={b.gradientId} cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor={b.color1} stopOpacity="1" />
            <stop offset="100%" stopColor={b.color2} stopOpacity="0.85" />
          </radialGradient>
        ))}
      </defs>

      {placed.map((b, i) => {
        const opacity = 0.75 + (b.count / maxCount) * 0.25
        return (
          <g key={b.tag + i} opacity={opacity}>
            <title>{`${b.tag} · ${b.count}次`}</title>
            <circle
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={`url(#${b.gradientId})`}
              style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}
            />
            <text
              x={b.cx}
              y={b.cy}
              fill="#ffffff"
              fontSize={b.fontSize}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {b.tag}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
