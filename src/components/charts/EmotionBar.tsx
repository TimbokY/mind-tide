import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { Sun, Moon, Zap, Star } from 'lucide-react'

interface EmotionDimension {
  name: string
  value: number
}

const emotionColors: Record<string, string> = {
  '恐惧': '#ef4444', '喜悦': '#10b981', '悲伤': '#6366f1',
  '平静': '#8b5cf6', '愤怒': '#f97316', '惊讶': '#eab308',
}

const emotionIcons: Record<string, typeof Sun> = {
  '恐惧': Zap, '喜悦': Sun, '悲伤': Moon, '平静': Moon, '愤怒': Zap, '惊讶': Star,
}

export function EmotionBar({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['emotionRadar', days],
    queryFn: () => invoke<EmotionDimension[]>('get_emotion_radar', { days }),
  })

  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-[#64748b] text-sm">
        加载中...
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-[#64748b] text-sm">
        暂无数据
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.value - a.value)
  const maxVal = Math.max(...sorted.map((d) => d.value), 1)
  const dominant = sorted[0]
  const DominantIcon = emotionIcons[dominant.name] || Star

  return (
    <div className="relative w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="18%"
          outerRadius="85%"
          data={sorted}
          startAngle={90}
          endAngle={-270}
          barSize={14}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, maxVal]}
            tick={false}
          />
          <RadialBar
            dataKey="value"
            background={{ fill: '#1e293b' }}
            cornerRadius={8}
            label={({ payload, x, y, cx, cy }: any) => {
              const name = payload?.name ?? ''
              const val = payload?.value ?? 0
              const dx = cx as number
              const dy = cy as number
              const angle = Math.atan2((y as number) - dy, (x as number) - dx)
              const dist = Math.sqrt(((x as number) - dx) ** 2 + ((y as number) - dy) ** 2)
              const lx = dx + (dist + 22) * Math.cos(angle)
              const ly = dy + (dist + 22) * Math.sin(angle)
              return (
                <>
                  <text x={lx} y={ly - 6} fill="#f8fafc" fontSize={12} fontWeight={600} textAnchor="middle">
                    {name}
                  </text>
                  <text x={lx} y={ly + 10} fill="#64748b" fontSize={10} textAnchor="middle">
                    {val}/100
                  </text>
                </>
              )
            }}
          >
            {sorted.map((entry) => (
              <Cell
                key={entry.name}
                fill={(emotionColors[entry.name] || '#8b5cf6') + 'cc'}
                stroke={emotionColors[entry.name] || '#8b5cf6'}
                strokeWidth={1}
              />
            ))}
          </RadialBar>
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-0.5">
          <DominantIcon
            className="w-7 h-7"
            style={{ color: emotionColors[dominant.name] || '#8b5cf6' }}
          />
          <span className="text-[10px] text-[#64748b]">{dominant.name}</span>
        </div>
      </div>
    </div>
  )
}
