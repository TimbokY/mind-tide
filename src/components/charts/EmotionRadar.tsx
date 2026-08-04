import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'

interface EmotionDimension {
  name: string
  value: number
}

export function EmotionRadar({ days }: { days: number }) {
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

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={{ fill: '#475569', fontSize: 10 }}
          />
          <Radar
            name="情绪维度"
            dataKey="value"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
