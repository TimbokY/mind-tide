import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface MonthTrendProps {
  data: { date: string; score: number }[]
}

export function MonthTrend({ data }: MonthTrendProps) {
  if (data.length < 2) return null

  return (
    <div className="flex-1 h-10 max-w-[300px] mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: 11,
              padding: '4px 8px',
            }}
            labelStyle={{ color: '#94a3b8', fontSize: 10 }}
            formatter={(v) => [`${v}`, '']}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: '#8b5cf6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
