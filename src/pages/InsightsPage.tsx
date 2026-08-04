import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { GlowCard } from '@/components/ui/glow-card'
import { Button } from '@/components/ui/button'
import { MoodTrendChart } from '@/components/charts/MoodTrendChart'
import { EmotionRadar } from '@/components/charts/EmotionRadar'
import { DreamHeatmap } from '@/components/charts/DreamHeatmap'
import { WordCloud } from '@/components/charts/WordCloud'
import { cn } from '@/lib/utils'
import {
  Sparkles, Loader2, Lightbulb, RefreshCw,
  TrendingUp, TrendingDown, Minus, Calendar,
  Sun, Moon, Star, Zap,
} from 'lucide-react'

interface TagFrequency { tag: string; count: number }

interface HighlightDay {
  label: string
  date: string
  desc: string
}

interface MonthlyInsight {
  year: number
  month: number
  total_dreams: number
  avg_mood_score: number
  avg_lucidity: number
  trend: string
  trend_value: number
  dominant_mood: string
  highlights: HighlightDay[]
  themes: string[]
  insight_text: string
  suggestion: string
  emotion_shift: Record<string, number> | null
  lucidity_note: string
  top_symbols: string[]
  top_tags: string[]
  daily_scores: [string, number][]
  prev_month_avg: number | null
}

const moodMeta: Record<string, { label: string; color: string; bg: string; icon: typeof Sun }> = {
  joy: { label: '喜悦', color: '#10b981', bg: 'bg-green-500/10', icon: Sun },
  sadness: { label: '悲伤', color: '#6366f1', bg: 'bg-indigo-500/10', icon: Moon },
  fear: { label: '恐惧', color: '#ef4444', bg: 'bg-red-500/10', icon: Zap },
  anger: { label: '愤怒', color: '#f97316', bg: 'bg-orange-500/10', icon: Zap },
  surprise: { label: '惊讶', color: '#eab308', bg: 'bg-yellow-500/10', icon: Star },
  calm: { label: '平静', color: '#8b5cf6', bg: 'bg-purple-500/10', icon: Moon },
}

function MiniSparkline({ scores }: { scores: [string, number][] }) {
  if (scores.length < 2) return null
  const max = Math.max(...scores.map(s => s[1]), 60)
  const min = Math.min(...scores.map(s => s[1]), 30)
  const range = max - min || 1
  const h = 28
  const w = scores.length * 6
  const points = scores
    .map((_, i) => `${i * 6},${h - ((scores[i][1] - min) / range) * h}`)
    .join(' ')

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function InsightsPage() {
  const [timeRange, setTimeRange] = useState(30)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const refDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  const { data: monthlyInsight, refetch: refetchInsight } = useQuery({
    queryKey: ['monthlyInsight', refDate],
    queryFn: async () => {
      const saved = await invoke<{ content: string } | null>('get_ai_summary', { summaryType: 'monthly', refDate })
      if (!saved?.content) return null
      try {
        return JSON.parse(saved.content) as MonthlyInsight
      } catch {
        return saved.content as unknown as MonthlyInsight
      }
    },
  })

  const { data: tags } = useQuery({
    queryKey: ['tagFrequencies'],
    queryFn: () => invoke<TagFrequency[]>('get_tag_frequencies'),
  })

  const { data: aiSymbols } = useQuery({
    queryKey: ['aiSymbolFrequencies', timeRange],
    queryFn: () => invoke<TagFrequency[]>('get_ai_symbol_frequencies', { days: timeRange }),
  })

  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: () => invoke<{ provider: string; model_name: string; api_url: string; api_key: string }>('get_ai_config'),
  })

  const handleMonthlyInsight = async () => {
    if (!aiConfig?.model_name) return
    setInsightLoading(true)
    setInsightError(null)
    try {
      await invoke<MonthlyInsight>('generate_monthly_insight', {
        input: {
          year: currentYear, month: currentMonth,
          api_url: aiConfig.api_url, api_key: aiConfig.api_key,
          model_name: aiConfig.model_name, provider: aiConfig.provider,
        },
      })
      await refetchInsight()
    } catch (e) {
      setInsightError(String(e))
    } finally {
      setInsightLoading(false)
    }
  }

  const isStructuredInsight = monthlyInsight && typeof monthlyInsight !== 'string' && 'insight_text' in monthlyInsight
  const insight = isStructuredInsight ? monthlyInsight as MonthlyInsight : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">潜意识洞察看板</h2>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((range) => (
            <button key={range} onClick={() => setTimeRange(range)}
              className={cn('px-3 py-1 text-xs rounded-lg transition-all',
                timeRange === range ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' : 'text-[#64748b] hover:text-[#94a3b8]')}>
              {range} 天
            </button>
          ))}
        </div>
      </div>

      {/* ===================== AI 月度洞察 ===================== */}
      <GlowCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-medium text-[#f8fafc]">
              AI 月度情绪洞察
              <span className="ml-1.5 text-xs text-[#64748b] font-normal">
                {currentMonth}月
              </span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {insight && (
              <span className="text-[10px] text-[#64748b] px-2">
                {insight.total_dreams} 条梦境
              </span>
            )}
            {monthlyInsight ? (
              <Button onClick={handleMonthlyInsight} disabled={insightLoading}
                variant="ghost" size="sm"
                className="text-[#8b5cf6] hover:text-[#a78bfa] rounded-lg text-xs h-7">
                {insightLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                {insightLoading ? '重新生成中…' : '重新生成'}
              </Button>
            ) : (
              <Button onClick={handleMonthlyInsight} disabled={insightLoading || !aiConfig?.model_name}
                variant="outline" size="sm"
                className="border-[#8b5cf6]/30 text-[#8b5cf6] rounded-lg text-xs h-8">
                {insightLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                {insightLoading ? '分析中…' : '生成本月洞察'}
              </Button>
            )}
          </div>
        </div>

        {insight ? (
          <div className="space-y-5">
            {/* ---- 概览行：分数 / 趋势 / 主导情绪 / 迷你趋势线 ---- */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold text-[#f8fafc]">
                  {insight.avg_mood_score}
                </span>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#64748b]">本月均分</span>
                  <span className="text-[10px] text-[#64748b]">
                    清醒 {insight.avg_lucidity.toFixed(1)}/5
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px]"
                style={{
                  backgroundColor:
                    insight.trend === '上升' ? 'rgba(16,185,129,0.1)' :
                    insight.trend === '下降' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
                  color:
                    insight.trend === '上升' ? '#10b981' :
                    insight.trend === '下降' ? '#ef4444' : '#64748b',
                }}
              >
                {insight.trend === '上升' ? <TrendingUp className="w-3 h-3" /> :
                 insight.trend === '下降' ? <TrendingDown className="w-3 h-3" /> :
                 <Minus className="w-3 h-3" />}
                {insight.trend} {insight.trend_value > 0 ? '+' : ''}{insight.trend_value}
              </div>

              {insight.prev_month_avg != null && (
                <div className="text-[11px] text-[#64748b]">
                  上月 <span className="text-[#94a3b8] font-medium">{insight.prev_month_avg}</span>
                  <span className={cn(
                    'ml-1',
                    insight.avg_mood_score > insight.prev_month_avg ? 'text-green-400' :
                    insight.avg_mood_score < insight.prev_month_avg ? 'text-red-400' : 'text-[#64748b]',
                  )}>
                    {insight.avg_mood_score > insight.prev_month_avg ? '↑' :
                     insight.avg_mood_score < insight.prev_month_avg ? '↓' : '→'}
                    {Math.abs(insight.avg_mood_score - insight.prev_month_avg).toFixed(1)}
                  </span>
                </div>
              )}

              {moodMeta[insight.dominant_mood] && (
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]',
                  moodMeta[insight.dominant_mood].bg,
                )}
                  style={{ color: moodMeta[insight.dominant_mood].color }}
                >
                  {(() => {
                    const Icon = moodMeta[insight.dominant_mood].icon
                    return <Icon className="w-3 h-3" />
                  })()}
                  {moodMeta[insight.dominant_mood].label}
                </div>
              )}

              <MiniSparkline scores={insight.daily_scores} />
            </div>

            {/* ---- 高光 / 低谷 ---- */}
            {insight.highlights.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {insight.highlights.map((h, i) => (
                  <div key={i}
                    className={cn(
                      'p-3 rounded-xl',
                      h.label === '最佳日' ? 'bg-green-500/[0.05] border border-green-500/10' :
                      'bg-red-500/[0.05] border border-red-500/10',
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3 h-3"
                        style={{ color: h.label === '最佳日' ? '#10b981' : '#ef4444' }}
                      />
                      <span className="text-[11px] font-medium text-[#94a3b8]">
                        {h.label} · {h.date}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748b] leading-relaxed">{h.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ---- 主题词 & 象征词 ---- */}
            <div className="flex flex-wrap items-center gap-2">
              {insight.themes.map((t) => (
                <span key={t} className="px-2 py-0.5 text-[11px] bg-[#8b5cf6]/10 text-[#c4b5fd] rounded-md">
                  {t}
                </span>
              ))}
              {insight.top_symbols.map((s) => (
                <span key={s} className="px-2 py-0.5 text-[11px] bg-white/5 text-[#94a3b8] rounded-md border border-white/5">
                  {s}
                </span>
              ))}
              {insight.top_tags.map((t) => (
                <span key={t} className="px-2 py-0.5 text-[11px] bg-[#8b5cf6]/5 text-[#a78bfa] rounded-md">
                  #{t}
                </span>
              ))}
            </div>

            {/* ---- 洞察正文 ---- */}
            <div className="space-y-3 p-4 bg-white/[0.02] rounded-xl border border-white/[0.04]">
              <p className="text-sm text-[#94a3b8] leading-relaxed">{insight.insight_text}</p>
              {insight.lucidity_note && (
                <p className="text-xs text-[#64748b] italic">{insight.lucidity_note}</p>
              )}
            </div>

            {/* ---- 情绪维度对比 ---- */}
            {insight.emotion_shift && (
              <div className="grid grid-cols-4 gap-2">
                {['fear', 'joy', 'sadness', 'calm'].map((key) => {
                  const val = insight.emotion_shift![key] ?? 0
                  const labels: Record<string, string> = { fear: '恐惧', joy: '喜悦', sadness: '悲伤', calm: '平静' }
                  const colors: Record<string, string> = { fear: '#ef4444', joy: '#10b981', sadness: '#6366f1', calm: '#8b5cf6' }
                  return (
                    <div key={key}
                      className="px-2.5 py-2 rounded-lg text-center bg-white/[0.02] border border-white/[0.04]"
                    >
                      <div className="text-[10px] text-[#64748b] mb-0.5">{labels[key]}</div>
                      <div className="text-xs font-medium" style={{ color: colors[key] }}>
                        {val > 0 ? '+' : ''}{val}
                      </div>
                      <div className="text-[9px] text-[#64748b]/50">vs 上月</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ---- 改善建议 ---- */}
            {insight.suggestion && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#8b5cf6]/[0.06] border border-[#8b5cf6]/10">
                <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0 mt-0.5" />
                <p className="text-xs text-[#a78bfa] leading-relaxed">{insight.suggestion}</p>
              </div>
            )}
          </div>
        ) : insightError ? (
          <p className="text-xs text-red-400">{insightError}</p>
        ) : (
          <p className="text-xs text-[#64748b]">
            {aiConfig?.model_name
              ? '点击按钮让 AI 分析本月的梦境数据，生成情绪趋势解读'
              : '请先在设置中配置 AI 模型'}
          </p>
        )}
      </GlowCard>

      {/* ===================== 图表区 ===================== */}
      <GlowCard className="p-5">
        <h3 className="text-sm font-medium text-[#94a3b8] mb-4">近{timeRange}天情绪潮汐</h3>
        <MoodTrendChart days={timeRange} />
      </GlowCard>

      <div className="grid grid-cols-2 gap-4">
        <GlowCard className="p-5">
          <h3 className="text-sm font-medium text-[#94a3b8] mb-2">多维情绪分布均值</h3>
          <EmotionRadar days={timeRange} />
        </GlowCard>
        <GlowCard className="p-5">
          <h3 className="text-sm font-medium text-[#94a3b8] mb-4">梦境活跃周期热力</h3>
          <DreamHeatmap />
        </GlowCard>
      </div>

      <GlowCard className="p-5">
        <h3 className="text-sm font-medium text-[#94a3b8] mb-4">梦境高频词云 · 标签 vs AI 象征</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
              <span className="text-[11px] text-[#64748b]">你的标签</span>
            </div>
            <div className="flex justify-center min-h-[220px] items-center bg-white/[0.01] rounded-xl">
              <WordCloud
                words={tags ?? []}
                width={700}
                height={220}
                colorScheme="purple"
                maxWords={20}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#14b8a6]" />
              <span className="text-[11px] text-[#64748b]">AI 象征元素</span>
            </div>
            <div className="flex justify-center min-h-[220px] items-center bg-white/[0.01] rounded-xl">
              <WordCloud
                words={aiSymbols ?? []}
                width={700}
                height={220}
                colorScheme="teal"
                maxWords={20}
              />
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  )
}
