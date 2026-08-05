import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface MoodPieProps {
  data: { name: string; value: number; color: string }[]
}

export function MoodPie({ data }: MoodPieProps) {
  if (data.length === 0) return null

  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={30}
            outerRadius={55}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: 11,
            }}
            formatter={(v, _name, props) => {
              const val = Number(v) || 0
              const pct = total > 0 ? Math.round((val / total) * 100) : 0
              const name = props?.payload?.name ?? ''
              return [`${name}: ${val}条 (${pct}%)`, '']
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
