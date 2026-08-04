import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@/lib/tauri'
import { GlowCard } from '@/components/ui/glow-card'
import { Button } from '@/components/ui/button'
import { MoodTrendChart } from '@/components/charts/MoodTrendChart'
import { EmotionRadar } from '@/components/charts/EmotionRadar'
import { DreamHeatmap } from '@/components/charts/DreamHeatmap'
import { cn } from '@/lib/utils'
import { Sparkles, Loader2, Lightbulb, RefreshCw } from 'lucide-react'

interface TagFrequency { tag: string; count: number }

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
      const saved = await invoke<{content: string} | null>('get_ai_summary', { summaryType: 'monthly', refDate })
      return saved?.content ?? null
    },
  })

  const { data: tags } = useQuery({
    queryKey: ['tagFrequencies'],
    queryFn: () => invoke<TagFrequency[]>('get_tag_frequencies'),
  })

  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: () => invoke<{provider: string; model_name: string; api_url: string; api_key: string}>('get_ai_config'),
  })

  const maxCount = tags ? Math.max(...tags.map((t) => t.count), 1) : 1

  const handleMonthlyInsight = async () => {
    if (!aiConfig?.model_name) return
    setInsightLoading(true)
    setInsightError(null)
    try {
      await invoke<string>('generate_monthly_insight', {
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

      {/* AI 月度洞察 */}
      <GlowCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-medium text-[#f8fafc]">AI 月度情绪洞察</h3>
          </div>
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
        {monthlyInsight ? (
          <p className="text-sm text-[#94a3b8] leading-relaxed">{monthlyInsight}</p>
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
        <h3 className="text-sm font-medium text-[#94a3b8] mb-4">近期梦境高频象征词</h3>
        {tags && tags.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-3 min-h-[120px]">
            {tags.map((tag) => {
              const size = 14 + (tag.count / maxCount) * 30
              const opacity = 0.5 + (tag.count / maxCount) * 0.5
              return (
                <span key={tag.tag} className="text-[#8b5cf6] font-medium"
                  style={{ fontSize: `${size}px`, opacity }}>
                  {tag.tag}
                </span>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-[120px] text-[#64748b] text-sm">暂无标签</div>
        )}
      </GlowCard>
    </div>
  )
}
