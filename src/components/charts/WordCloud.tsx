import { useState, useMemo } from 'react'
import { Shuffle, AlignJustify } from 'lucide-react'

interface WordItem {
  tag: string
  count: number
}

interface WordCloudProps {
  words: WordItem[]
  width?: number
  height?: number
  colorScheme?: 'purple' | 'teal'
  maxWords?: number
}

const PURPLE_GRADIENTS = [
  ['#c4b5fd', '#a78bfa'],
  ['#a78bfa', '#8b5cf6'],
  ['#8b5cf6', '#7c3aed'],
  ['#ddd6fe', '#c4b5fd'],
  ['#ede9fe', '#ddd6fe'],
  ['#7c3aed', '#6d28d9'],
]
const TEAL_GRADIENTS = [
  ['#99f6e4', '#5eead4'],
  ['#5eead4', '#2dd4bf'],
  ['#2dd4bf', '#14b8a6'],
  ['#14b8a6', '#0d9488'],
  ['#ccfbf1', '#99f6e4'],
  ['#0d9488', '#0f766e'],
]

function archimedeanSpiral(n: number): [number, number] {
  const a = 1.2
  const b = 0.8
  const r = a + b * Math.sqrt(n)
  const theta = n * 0.55
  return [r * Math.cos(theta), r * Math.sin(theta)]
}

interface PlacedWord {
  tag: string
  count: number
  x: number
  y: number
  size: number
  color1: string
  color2: string
  rotate: number
  gradientId: string
}

function computeFontWidth(word: string, fontSize: number): number {
  const avgCharWidths: Record<string, number> = {
    CJK: fontSize * 0.92,
    DEFAULT: fontSize * 0.58,
  }
  let w = 0
  for (const ch of word) {
    const code = ch.charCodeAt(0)
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x303f)) {
      w += avgCharWidths.CJK
    } else {
      w += avgCharWidths.DEFAULT
    }
  }
  return w
}

function placeWords(
  words: WordItem[],
  width: number,
  height: number,
  gradients: string[][],
  maxWords: number,
  allowRotate: boolean,
): PlacedWord[] {
  const maxCount = Math.max(...words.map(w => w.count), 1)
  const filtered = words.slice(0, maxWords)
  const sorted = [...filtered].sort((a, b) => b.count - a.count)

  const bounds: { x: number; y: number; w: number; h: number; cx: number; cy: number }[] = []
  const placed: PlacedWord[] = []

  const fontSizeFor = (w: WordItem, rank: number) => {
    const ratio = w.count / maxCount
    if (rank === 0) return Math.round(18 + ratio * 36)
    if (rank === 1) return Math.round(16 + ratio * 30)
    if (rank === 2) return Math.round(14 + ratio * 26)
    return Math.round(11 + ratio * 18)
  }

  const rotationFor = (rank: number) => {
    if (!allowRotate) return 0
    if (rank <= 2) return 0
    const seeds = [-15, 12, -20, 8, -10, 16, -6, 14]
    return seeds[rank % seeds.length]
  }

  const margin = 6
  const area = width * height

  for (let rank = 0; rank < sorted.length; rank++) {
    const word = sorted[rank]
    const size = fontSizeFor(word, rank)
    const rotate = rotationFor(rank)
    const rad = (rotate * Math.PI) / 180

    const rawW = computeFontWidth(word.tag, size) + margin * 2
    const rawH = size + margin * 2

    const cosA = Math.abs(Math.cos(rad))
    const sinA = Math.abs(Math.sin(rad))
    const bboxW = rawW * cosA + rawH * sinA
    const bboxH = rawW * sinA + rawH * cosA

    let found = false
    const cx = width / 2
    const cy = height / 2

    const startRadius = rank <= 2 ? 0 : 30
    const stepScale = Math.sqrt(area) / 90

    for (let step = 0; step < 3000; step++) {
      const radius = startRadius + step * stepScale
      const [sx, sy] = archimedeanSpiral(step)
      const px = cx + sx * radius
      const py = cy + sy * radius
      const bx = px - bboxW / 2
      const by = py - bboxH / 2

      if (bx < 6 || by < 6 || bx + bboxW > width - 6 || by + bboxH > height - 6) continue

      let overlaps = false
      for (const b of bounds) {
        if (
          bx + margin < b.x + b.w &&
          bx + bboxW > b.x + margin &&
          by + margin < b.y + b.h &&
          by + bboxH > b.y + margin
        ) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        bounds.push({ x: bx, y: by, w: bboxW, h: bboxH, cx: px, cy: py })
        const [c1, c2] = gradients[rank % gradients.length]
        placed.push({
          tag: word.tag, count: word.count,
          x: px, y: py, size,
          color1: c1, color2: c2,
          rotate, gradientId: `gc-${rank}`,
        })
        found = true
        break
      }
    }

    if (!found && rank <= 2) {
      const [c1, c2] = gradients[rank % gradients.length]
      placed.push({
        tag: word.tag, count: word.count,
        x: width / 2, y: (height / 3) + rank * 30,
        size,
        color1: c1, color2: c2,
        rotate: 0, gradientId: `gc-${rank}`,
      })
    }
  }
  return placed
}

export function WordCloud({ words, width = 340, height = 200, colorScheme = 'purple', maxWords = 30 }: WordCloudProps) {
  const [allowRotate, setAllowRotate] = useState(true)
  const palettes = colorScheme === 'teal' ? TEAL_GRADIENTS : PURPLE_GRADIENTS

  const placed = useMemo(
    () => (words.length > 0 ? placeWords(words, width, height, palettes, maxWords, allowRotate) : []),
    [words, width, height, palettes, maxWords, allowRotate],
  )

  if (placed.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <span className="text-xs text-[#64748b]">暂无数据</span>
      </div>
    )
  }

  const maxCount = Math.max(...placed.map(w => w.count), 1)

  return (
    <div className="relative group">
      <svg width={width} height={height} className="overflow-visible block">
        <defs>
          {placed.map((w) => (
            <linearGradient key={w.gradientId} id={w.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={w.color1} />
              <stop offset="100%" stopColor={w.color2} />
            </linearGradient>
          ))}
        </defs>

        {placed.map((w, i) => {
          const opacity = 0.55 + (w.count / maxCount) * 0.45
          return (
            <g
              key={w.tag + i}
              transform={`rotate(${w.rotate},${w.x},${w.y})`}
              className="transition-all duration-200"
            >
              <title>{`${w.tag} · ${w.count}次`}</title>
              <text
                x={w.x}
                y={w.y}
                fill={`url(#${w.gradientId})`}
                fontSize={w.size}
                fontWeight={w.count > 2 ? 700 : 500}
                textAnchor="middle"
                dominantBaseline="central"
                opacity={opacity}
                style={{
                  userSelect: 'none',
                  cursor: 'pointer',
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))',
                }}
              >
                {w.tag}
              </text>
            </g>
          )
        })}
      </svg>

      <button
        onClick={() => setAllowRotate(!allowRotate)}
        className="absolute top-0 right-0 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#64748b] hover:text-[#94a3b8] transition-all opacity-0 group-hover:opacity-100"
        title={allowRotate ? '切换为水平排列' : '切换为自由旋转'}
      >
        {allowRotate ? <AlignJustify className="w-3 h-3" /> : <Shuffle className="w-3 h-3" />}
      </button>
    </div>
  )
}
