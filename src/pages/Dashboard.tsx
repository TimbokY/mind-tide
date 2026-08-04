import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, type Transition } from 'framer-motion'
import { invoke } from '@/lib/tauri'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { GlowCard } from '@/components/ui/glow-card'
import { MoodTrendChart } from '@/components/charts/MoodTrendChart'
import {
  PenLine,
  Sparkles,
  Loader2,
  Cpu,
  ArrowRight,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardStats {
  total_dreams: number
  monthly_avg_score: number
  weekly_count: number
  top_mood: string
}

const moodLabels: Record<string, string> = {
  joy: '喜悦', sadness: '悲伤', fear: '恐惧',
  anger: '愤怒', surprise: '惊讶', calm: '平静', neutral: '中性',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [insightLoading, setInsightLoading] = useState(false)

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => invoke<DashboardStats>('get_dashboard_stats'),
    refetchInterval: 30000,
  })

  const { data: aiConfig } = useQuery({
    queryKey: ['aiConfig'],
    queryFn: () => invoke<{provider: string; model_name: string; api_url: string; api_key: string}>('get_ai_config'),
  })

  const { data: aiReady } = useQuery({
    queryKey: ['aiReady'],
    queryFn: async () => {
      if (!aiConfig?.model_name) return false
      if (aiConfig.provider === 'builtin') {
        return invoke<boolean>('is_local_model_loaded')
      }
      return true
    },
    enabled: !!aiConfig,
  })

  const { data: todaySummary, refetch: refetchToday, isRefetching: todayRefetching } = useQuery({
    queryKey: ['todaySummary'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const saved = await invoke<{content: string} | null>('get_ai_summary', { summaryType: 'today', refDate: today })
      if (saved?.content) return saved.content

      if (!aiConfig?.model_name || !aiReady) return null
      return await invoke<string>('generate_today_summary', {
        input: { year: new Date().getFullYear(), month: new Date().getMonth() + 1,
          api_url: aiConfig!.api_url, api_key: aiConfig!.api_key,
          model_name: aiConfig!.model_name, provider: aiConfig!.provider },
      })
    },
    enabled: !!aiConfig,
    staleTime: 5 * 60 * 1000,
  })

  const handleGenerateInsight = async () => {
    setInsightLoading(true)
    try {
      await refetchToday()
    } catch {
      // refetch 失败后 React Query 会保留原有数据，不做额外处理
    } finally {
      setInsightLoading(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-[#64748b]">加载中...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">首页仪表盘</h2>
        <Button onClick={() => navigate('/editor')}
          className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl">
          <PenLine className="w-4 h-4 mr-2" />记录梦境
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '总梦境记录数', value: stats?.total_dreams ?? 0, sub: '条', onClick: () => navigate('/calendar') },
          { label: '本月平均情绪分', value: stats?.monthly_avg_score ?? '--', sub: '/100' },
          { label: '本周梦境条数', value: stats?.weekly_count ?? 0, sub: '条' },
          { label: '高频情绪标签', value: stats?.top_mood ? moodLabels[stats.top_mood] ?? stats.top_mood : '--', sub: '' },
        ].map((stat, i) => (
          <motion.div key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: 'easeOut' } as Transition}
          >
            <GlowCard className={cn('p-4', stat.onClick && 'cursor-pointer hover:bg-white/[0.06]')}>
              <div onClick={stat.onClick}>
                <p className="text-xs text-[#94a3b8]">{stat.label}</p>
                <p className="text-2xl font-medium mt-1">
                  {typeof stat.value === 'number' && stat.sub === '/100'
                    ? (stat.value as number).toFixed(1) : stat.value}
                  <span className="text-sm text-[#64748b] ml-1">{stat.sub}</span>
                </p>
              </div>
            </GlowCard>
          </motion.div>
        ))}
      </div>

      {/* AI 引擎卡片 + 今日摘要 */}
      <div className="grid grid-cols-2 gap-4">
        <GlowCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className={cn('w-4 h-4', aiReady ? 'text-green-400' : 'text-[#64748b]')} />
            <h3 className="text-sm font-medium text-[#f8fafc]">AI 引擎</h3>
            {aiReady && <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]" />}
          </div>
          {aiConfig?.model_name ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">模式</span>
                <span className="text-[#94a3b8]">
                  {aiConfig.provider === 'builtin' ? '内置本地引擎' : aiConfig.provider === 'ollama' ? 'Ollama' : '远程 API'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">模型</span>
                <span className="text-[#8b5cf6] font-mono truncate max-w-[180px]">{aiConfig.model_name}</span>
              </div>
              {!aiReady && (
                <Button onClick={() => navigate('/settings')} variant="outline" size="sm"
                  className="w-full mt-2 border-[#8b5cf6]/30 text-[#8b5cf6] rounded-lg text-xs h-8">
                  <Download className="w-3 h-3 mr-1" />前往加载模型
                </Button>
              )}
              <Button onClick={() => navigate('/settings')} variant="ghost" size="sm"
                className="w-full mt-1 text-[#64748b] hover:text-[#f8fafc] rounded-lg text-xs h-7">
                修改配置 <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#64748b]">尚未配置 AI 模型，3 步启用本地 AI：</p>
              <ol className="space-y-1.5 text-xs text-[#94a3b8]">
                <li className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#8b5cf6]/20 text-[10px] text-[#8b5cf6] flex items-center justify-center shrink-0">1</span>
                  进入设置页
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#8b5cf6]/20 text-[10px] text-[#8b5cf6] flex items-center justify-center shrink-0">2</span>
                  选择并下载模型
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-[#8b5cf6]/20 text-[10px] text-[#8b5cf6] flex items-center justify-center shrink-0">3</span>
                  加载后即可使用
                </li>
              </ol>
              <Button onClick={() => navigate('/settings')}
                className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-lg text-xs h-8">
                开始配置
              </Button>
            </div>
          )}
        </GlowCard>

        <GlowCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
              <h3 className="text-sm font-medium text-[#f8fafc]">今日梦境快讯</h3>
            </div>
            {aiReady && (
              <Button onClick={handleGenerateInsight} disabled={insightLoading || todayRefetching} variant="ghost" size="sm"
                className="h-7 text-xs text-[#8b5cf6] hover:text-[#a78bfa] rounded-lg">
                {insightLoading || todayRefetching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                生成
              </Button>
            )}
          </div>
          {todaySummary ? (
            <p className="text-sm text-[#94a3b8] leading-relaxed">{todaySummary}</p>
          ) : (
            <p className="text-xs text-[#64748b]">
              {aiReady ? '点击「生成」获取 AI 为你总结的今日梦境简报' : '配置 AI 后即可自动生成今日梦境简报'}
            </p>
          )}
        </GlowCard>
      </div>

      <GlowCard className="p-5">
        <h3 className="text-sm font-medium text-[#94a3b8] mb-4">近30天情绪趋势</h3>
        <MoodTrendChart days={30} />
      </GlowCard>
    </div>
  )
}
