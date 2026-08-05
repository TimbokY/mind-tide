import { cn } from '@/lib/utils'

interface MiniCalendarProps {
  year: number
  month: number
  activeDates: Set<string>
  onDateClick: (date: string) => void
}

const WDAYS = ['日', '一', '二', '三', '四', '五', '六']

function getDaysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate() }
function getFirstDay(y: number, m: number) { return new Date(y, m - 1, 1).getDay() }

export function MiniCalendar({ year, month, activeDates, onDateClick }: MiniCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDay(year, month)
  const today = new Date().toISOString().split('T')[0]

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] text-[#64748b]/50 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="aspect-square" />
          const ds = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const has = activeDates.has(ds)
          const is = ds === today
          return (
            <button
              key={ds}
              disabled={!has}
              onClick={() => onDateClick(ds)}
              className={cn(
                'aspect-square flex items-center justify-center rounded-md text-[11px] transition-colors',
                is && 'ring-2 ring-[#8b5cf6] ring-inset',
                has
                  ? 'bg-[#8b5cf6]/20 text-[#f8fafc] hover:bg-[#8b5cf6]/30 font-medium'
                  : 'text-[#64748b]/30',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
