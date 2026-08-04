import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { cn } from '@/lib/utils'

interface HeatmapEntry {
  date: string
  count: number
  avg_score: number
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay()
}

function getColor(count: number): string {
  if (count === 0) return 'bg-white/[0.03]'
  if (count === 1) return 'bg-[#8b5cf6]/20'
  if (count === 2) return 'bg-[#8b5cf6]/40'
  if (count === 3) return 'bg-[#8b5cf6]/60'
  return 'bg-[#8b5cf6]/80'
}

export function DreamHeatmap() {
  const now = new Date()
  const [year, month] = [now.getFullYear(), now.getMonth() + 1]

  const { data } = useQuery({
    queryKey: ['dreamHeatmap', year, month],
    queryFn: () => invoke<HeatmapEntry[]>('get_dream_heatmap', { year, month }),
  })

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  const countMap = new Map<string, number>()
  if (data) {
    for (const entry of data) {
      countMap.set(entry.date, entry.count)
    }
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) {
    cells.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d)
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {weekDays.map((d) => (
          <div key={d} className="w-7 h-7 flex items-center justify-center text-[10px] text-[#64748b]">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="w-7 h-7" />
          }
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const count = countMap.get(dateStr) ?? 0
          return (
            <div
              key={dateStr}
              className={cn(
                'w-7 h-7 rounded-[4px] transition-colors cursor-default',
                getColor(count),
              )}
              title={`${dateStr}: ${count} 条记录`}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-[#64748b] pt-1">
        <span>少</span>
        <div className="w-3 h-3 rounded-[2px] bg-white/[0.03]" />
        <div className="w-3 h-3 rounded-[2px] bg-[#8b5cf6]/20" />
        <div className="w-3 h-3 rounded-[2px] bg-[#8b5cf6]/40" />
        <div className="w-3 h-3 rounded-[2px] bg-[#8b5cf6]/60" />
        <div className="w-3 h-3 rounded-[2px] bg-[#8b5cf6]/80" />
        <span>多</span>
      </div>
    </div>
  )
}
