import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { GlowCard } from '@/components/ui/glow-card'
import { Button } from '@/components/ui/button'
import { MiniCalendar } from '@/components/charts/MiniCalendar'
import { MonthTrend } from '@/components/charts/MonthTrend'
import { MoodPie } from '@/components/charts/MoodPie'
import { DreamTimeline } from '@/components/charts/DreamTimeline'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, BarChart3, Star } from 'lucide-react'

interface CalendarDream {
  id: string
  title: string
  content: string
  mood_score: number
  ai_mood: string | null
  user_mood: string | null
  lucidity: number
  tags: string | null
  dream_date: string
  summary: string | null
  symbols: string | null
  insight: string | null
}

interface DayGroup {
  date: string
  dreams: CalendarDream[]
  avgScore: number
}

const moodText: Record<string, string> = {
  joy: '喜悦', sadness: '悲伤', fear: '恐惧', calm: '平静',
}

const pieColors: Record<string, string> = {
  joy: '#10b981', sadness: '#6366f1', fear: '#ef4444', calm: '#8b5cf6',
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [highlightDate, setHighlightDate] = useState<string | null>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const dateRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const isFirstLoad = useRef(true)

  const scrollToDate = useCallback((date: string) => {
    setHighlightDate(date)
    const el = dateRefs.current.get(date)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setTimeout(() => setHighlightDate(null), 2000)
  }, [])

  const { data: groups } = useQuery({
    queryKey: ['dreamsByMonth', year, month],
    queryFn: async () => {
      const list = await invoke<CalendarDream[]>('get_dreams_by_month', { year, month })
      const map = new Map<string, DayGroup>()
      for (const d of list) {
        const g = map.get(d.dream_date)
        if (g) {
          g.dreams.push(d)
          g.avgScore = Math.round(g.dreams.reduce((s, dd) => s + dd.mood_score, 0) / g.dreams.length)
        } else {
          map.set(d.dream_date, { date: d.dream_date, dreams: [d], avgScore: d.mood_score })
        }
      }
      return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
    },
  })

  useEffect(() => {
    if (!isFirstLoad.current || !groups || groups.length === 0) return
    isFirstLoad.current = false
    const today = new Date().toISOString().slice(0, 10)
    const todayGroup = groups.find(g => g.date === today)
    if (todayGroup) {
      requestAnimationFrame(() => scrollToDate(today))
    }
  }, [groups, scrollToDate])

  const moodDist = useMemo(() => {
    const d: { name: string; value: number; color: string }[] = []
    if (!groups || groups.length === 0) return d
    const count: Record<string, number> = {}
    groups.forEach((g) => g.dreams.forEach((dd) => {
      if (dd.ai_mood && dd.ai_mood in moodText) count[dd.ai_mood] = (count[dd.ai_mood] || 0) + 1
    }))
    for (const [k, v] of Object.entries(count)) {
      d.push({ name: moodText[k], value: v, color: pieColors[k] || '#64748b' })
    }
    return d
  }, [groups])

  const topTags = useMemo(() => {
    const c: Record<string, number> = {}
    groups?.forEach((g) => g.dreams.forEach((dd) => {
      try { if (dd.tags) JSON.parse(dd.tags).forEach((t: string) => { c[t] = (c[t] || 0) + 1 }) } catch {}
    }))
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [groups])

  const monthlyLucidity = useMemo(() => {
    let total = 0; let count = 0
    groups?.forEach((g) => g.dreams.forEach((d) => { total += d.lucidity; count++ }))
    return count ? total / count : 0
  }, [groups])
  const totalDreams = groups?.reduce((s, g) => s + g.dreams.length, 0) ?? 0
  const monthlyAvg = groups?.length
    ? Math.round(groups.reduce((s, g) => s + g.avgScore, 0) / groups.length)
    : null
  const highestDay = useMemo(() => groups?.reduce((a, b) => b.avgScore > a.avgScore ? b : a, groups[0]), [groups])
  const lowestDay = useMemo(() => groups?.reduce((a, b) => b.avgScore < a.avgScore ? b : a, groups[0]), [groups])

  const trendData = useMemo(() =>
    groups?.map((g) => ({ date: g.date.slice(5), score: g.avgScore })) ?? [],
  [groups])

  const dreamDates = useMemo(() => {
    const s = new Set<string>()
    groups?.forEach((g) => s.add(g.date))
    return s
  }, [groups])

  const prevMonth = useCallback(() => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }, [month])
  const nextMonth = useCallback(() => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }, [month])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await invoke('delete_dream', { id })
      queryClient.invalidateQueries({ queryKey: ['dreamsByMonth'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['moodTrend'] })
      queryClient.invalidateQueries({ queryKey: ['emotionRadar'] })
      queryClient.invalidateQueries({ queryKey: ['dreamHeatmap'] })
      queryClient.invalidateQueries({ queryKey: ['tagFrequencies'] })
    } catch (e) { console.error('删除失败:', e) }
  }, [queryClient])

  const handleReAnalyze = useCallback(async (dreamId: string) => {
    setAnalyzingId(dreamId)
    setAnalyzeError(null)
    try {
      const config = await invoke<{provider: string; model_name: string; api_url: string; api_key: string}>('get_ai_config')
      if (!config.model_name) return
      await invoke('analyze_dream', {
        input: {
          dream_id: dreamId, api_url: config.api_url, api_key: config.api_key,
          model_name: config.model_name, provider: config.provider,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['dreamsByMonth'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['moodTrend'] })
      queryClient.invalidateQueries({ queryKey: ['emotionRadar'] })
      queryClient.invalidateQueries({ queryKey: ['dreamHeatmap'] })
      queryClient.invalidateQueries({ queryKey: ['tagFrequencies'] })
    } catch (e) {
      console.error('重新解读失败:', e)
      const msg = typeof e === 'string' ? e : '重新解读失败，请重试'
      setAnalyzeError(msg)
      setTimeout(() => setAnalyzeError(null), 8000)
    }
    finally { setAnalyzingId(null) }
  }, [queryClient])

  const isEmpty = !groups || groups.length === 0

  return (
    <div className="space-y-5">
      {/* ==== 顶部栏 ==== */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={prevMonth}
            className="h-8 w-8 p-0 text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold text-[#f8fafc] min-w-[110px] text-center tracking-wide">
            {year}年{month}月
          </span>
          <Button variant="ghost" size="sm" onClick={nextMonth}
            className="h-8 w-8 p-0 text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            const n = new Date(); setYear(n.getFullYear()); setMonth(n.getMonth() + 1)
          }}
            className="h-7 text-[11px] px-2.5 text-[#64748b] hover:text-[#f8fafc] rounded-lg ml-1">
            今天
          </Button>
        </div>

        {/* 中：迷你趋势线 */}
        <div className="flex-1 flex items-center">
          {totalDreams > 0 && <MonthTrend data={trendData} />}
        </div>

        {/* 右：统计 */}
        <div className="flex items-center gap-4 text-xs text-[#64748b] shrink-0">
          <span>记录 <span className="text-[#f8fafc] font-medium">{totalDreams}</span> 条</span>
          {monthlyAvg !== null && (
            <span>均分 <span className="text-[#f8fafc] font-medium">{monthlyAvg}</span></span>
          )}
          {highestDay && (
            <span title={`${highestDay.date}`}>
              最高 <span className="text-green-400">{highestDay.avgScore}</span>
            </span>
          )}
          {lowestDay && (
            <span title={`${lowestDay.date}`}>
              最低 <span className="text-red-400">{lowestDay.avgScore}</span>
            </span>
          )}
        </div>
      </div>

      {analyzeError && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300 break-words">{analyzeError}</p>
          </div>
          <button
            onClick={() => setAnalyzeError(null)}
            className="text-red-400 hover:text-red-300 shrink-0 text-lg leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==== 空状态 ==== */}
      {isEmpty && (
        <GlowCard className="p-16 text-center">
          <BarChart3 className="w-10 h-10 text-[#64748b]/30 mx-auto mb-4" />
          <p className="text-sm text-[#64748b]">本月还没有梦境记录</p>
          <p className="text-xs text-[#64748b]/50 mt-1.5">去记录你的第一个梦，它就会出现在这里</p>
        </GlowCard>
      )}

      {/* ==== 双栏主内容 ==== */}
      {!isEmpty && (
        <div className="flex gap-5">
          {/* 左栏 55% — 梦境时间线 */}
          <div className="w-[55%] flex flex-col gap-1">
            {groups!.map((group) => (
              <div
                key={group.date}
                ref={(el) => { if (el) dateRefs.current.set(group.date, el) }}
                className={cn(
                  'rounded-2xl p-4 transition-all duration-700',
                  highlightDate === group.date && 'bg-[#8b5cf6]/5 shadow-[0_0_24px_rgba(139,92,246,0.12)]',
                )}
              >
                <DreamTimeline groups={[group]} onDelete={handleDelete} onReAnalyze={handleReAnalyze} analyzingId={analyzingId} />
              </div>
            ))}
          </div>

          {/* 右栏 45% — 迷你月历 + 统计 */}
          <div className="w-[45%] space-y-4 shrink-0">
            <GlowCard className="p-4">
              <h4 className="text-[11px] font-medium text-[#64748b] mb-3">{month}月</h4>
              <MiniCalendar
                year={year}
                month={month}
                activeDates={dreamDates}
                onDateClick={scrollToDate}
              />
            </GlowCard>

            {moodDist.length > 0 && (
              <GlowCard className="p-4">
                <h4 className="text-[11px] font-medium text-[#64748b] mb-2">情绪分布</h4>
                <MoodPie data={moodDist} />
                <div className="flex justify-center gap-3 mt-2">
                  {moodDist.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-[#64748b]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name} {d.value}
                    </div>
                  ))}
                </div>
              </GlowCard>
            )}

            {topTags.length > 0 && (
              <GlowCard className="p-4">
                <h4 className="text-[11px] font-medium text-[#64748b] mb-2">高频标签</h4>
                <div className="flex flex-wrap gap-1.5">
                  {topTags.map(([tag, count]) => {
                    const maxCount = topTags[0][1]
                    const ratio = count / maxCount
                    const size = ratio > 0.8 ? 'text-[13px] px-2.5 py-1' : ratio > 0.5 ? 'text-[11px] px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'
                    const opacity = 0.55 + ratio * 0.45
                    return (
                      <span
                        key={tag}
                        className={`inline-flex items-center rounded-lg font-medium bg-[#8b5cf6]/15 border border-[#8b5cf6]/20 transition-all ${size}`}
                        style={{ color: '#a78bfa', opacity }}
                      >
                        {tag} <span className="text-[#64748b]/50 ml-0.5">{count}</span>
                      </span>
                    )
                  })}
                </div>
              </GlowCard>
            )}
            {monthlyLucidity > 0 && (
              <GlowCard className="p-4">
                <h4 className="text-[11px] font-medium text-[#64748b] mb-2">平均清醒度</h4>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={s <= Math.round(monthlyLucidity) ? 'w-4 h-4' : 'w-4 h-4'}
                      fill={s <= Math.round(monthlyLucidity) ? '#eab308' : 'none'}
                      stroke={s <= Math.round(monthlyLucidity) ? '#eab308' : '#334155'}
                      strokeWidth={1.5}
                    />
                  ))}
                  <span className="text-[11px] text-[#64748b] ml-1.5">{monthlyLucidity.toFixed(1)}/5</span>
                </div>
              </GlowCard>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
