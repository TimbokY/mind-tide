import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { moodLabels } from '@/constants/moods'

interface TrendData {
  date: string
  score: number
  primary_mood: string
  count: number
}

export function MoodTrendChart({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['moodTrend', days],
    queryFn: () => invoke<TrendData[]>('get_mood_trend', { days }),
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
        暂无数据，记录梦境后即可查看情绪趋势
      </div>
    )
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" stroke="#475569" fontSize={11} />
          <YAxis domain={[0, 100]} stroke="#475569" fontSize={11} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
            }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(value, _name, props) => {
              const mood = moodLabels[props.payload.primary_mood] ?? props.payload.primary_mood
              return [`${value}/100 (${mood})`, '情绪分数']
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#8b5cf6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorScore)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
