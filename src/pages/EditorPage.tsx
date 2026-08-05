import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Save,
  Sparkles,
  Smile,
  Frown,
  Meh,
  Zap,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings,
  BarChart3,
  AlertTriangle,
  X,
  Flame,
  Star,
  Wind,
} from 'lucide-react'
import { invoke } from '@/lib/tauri'
import { cn } from '@/lib/utils'
import type { AiConfig } from '@/types'
import { moodLabels } from '@/constants/moods'

interface DreamInput {
  title: string
  content: string
  dream_date: string
  user_mood: string | null
  lucidity: number
  tags: string[]
}

interface DreamResponse {
  id: string
  title: string
  content: string
  dream_date: string
}

interface AiResult {
  summary: string
  symbols: { element: string; meaning: string }[]
  insight: string
  primary_mood: string
  mood_score: number
  emotions: string
  tags: string[]
}

const moods = [
  { value: 'joy', label: '喜悦', icon: Smile, color: '#10b981' },
  { value: 'sadness', label: '悲伤', icon: Frown, color: '#ef4444' },
  { value: 'anger', label: '愤怒', icon: Flame, color: '#f97316' },
  { value: 'fear', label: '恐惧', icon: Zap, color: '#f59e0b' },
  { value: 'surprise', label: '惊讶', icon: Star, color: '#eab308' },
  { value: 'calm', label: '平静', icon: Wind, color: '#8b5cf6' },
  { value: 'neutral', label: '中性', icon: Meh, color: '#64748b' },
]

export default function EditorPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<DreamInput>({
    title: '',
    content: '',
    dream_date: new Date().toISOString().split('T')[0],
    user_mood: null,
    lucidity: 0,
    tags: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [aiExpanded, setAiExpanded] = useState(false)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    invoke<AiConfig>('get_ai_config')
      .then(setAiConfig)
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return

    setSaving(true)
    setSaved(false)

    try {
      await invoke<DreamResponse>('save_dream', {
        input: {
          title: form.title,
          content: form.content,
          user_mood: form.user_mood,
          dream_date: form.dream_date,
          lucidity: form.lucidity,
          tags: form.tags.length > 0 ? form.tags : null,
        },
      }      )

      setSaved(true)
      setAiResult(null)
      setAiExpanded(false)

      queryClient.invalidateQueries({ queryKey: ['moodTrend'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['dreamsByMonth'] })
      queryClient.invalidateQueries({ queryKey: ['dreamHeatmap'] })
      queryClient.invalidateQueries({ queryKey: ['tagFrequencies'] })

      setTimeout(() => setSaved(false), 3000)
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      setSaving(false)
    }
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }))
  }

  const handleSaveAndAnalyze = async () => {
    if (!form.title.trim() || !form.content.trim()) return

    setSaving(true)
    setSaved(false)
    setAiError(null)

    try {
      const result = await invoke<DreamResponse>('save_dream', {
        input: {
          title: form.title,
          content: form.content,
          user_mood: form.user_mood,
          dream_date: form.dream_date,
          lucidity: form.lucidity,
          tags: form.tags.length > 0 ? form.tags : null,
        },
      }      )

      setSaved(true)

      setSaving(false)
      setAnalyzing(true)

      const aiRes = await invoke<AiResult>('analyze_dream', {
        input: {
          dream_id: result.id,
          api_url: aiConfig?.api_url ?? '',
          api_key: aiConfig?.api_key ?? '',
          model_name: aiConfig?.model_name ?? 'qwen3:8b',
          provider: aiConfig?.provider ?? 'builtin',
        },
      })

      setAiResult(aiRes)
      setAiExpanded(true)

      queryClient.invalidateQueries({ queryKey: ['moodTrend'] })
      queryClient.invalidateQueries({ queryKey: ['emotionRadar'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['dreamsByMonth'] })
      queryClient.invalidateQueries({ queryKey: ['dreamHeatmap'] })
      queryClient.invalidateQueries({ queryKey: ['tagFrequencies'] })
      queryClient.invalidateQueries({ queryKey: ['todaySummary'] })
    } catch (error) {
      console.error('操作失败:', error)
      const msg = typeof error === 'string' ? error : '操作失败，请重试'
      setAiError(msg)
      setTimeout(() => setAiError(null), 8000)
    } finally {
      setSaving(false)
      setAnalyzing(false)
    }
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">记录梦境</h2>
          <span className="text-sm text-[#64748b]">
            {new Date(form.dream_date).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>

        <Input
          placeholder="给梦境起个标题..."
          value={form.title}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, title: e.target.value }))
          }
          className="text-lg bg-white/5 border-white/10 text-[#f8fafc] placeholder:text-[#64748b] h-12 rounded-xl"
        />

        <Textarea
          placeholder="在这里描述你的梦境... 越详细，AI 分析越精准。"
          value={form.content}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, content: e.target.value }))
          }
          className="min-h-[320px] bg-white/5 border-white/10 text-[#f8fafc] placeholder:text-[#64748b] rounded-xl resize-none"
        />

        {aiResult && (
          <Card
            className={cn(
              'p-5 border-green-500/20 rounded-2xl transition-all',
              aiResult.mood_score >= 70
                ? 'bg-green-500/5'
                : aiResult.mood_score >= 40
                  ? 'bg-yellow-500/5'
                  : 'bg-red-500/5',
            )}
          >
            <button
              onClick={() => setAiExpanded(!aiExpanded)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
                <span className="text-sm font-medium text-[#f8fafc]">
                  AI 解析结果
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs',
                    aiResult.mood_score >= 70
                      ? 'bg-green-500/20 text-green-400'
                      : aiResult.mood_score >= 40
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400',
                  )}
                >
                  {moodLabels[aiResult.primary_mood] ?? aiResult.primary_mood}{' '}
                  {aiResult.mood_score}/100
                </span>
              </div>
              {aiExpanded ? (
                <ChevronUp className="w-4 h-4 text-[#64748b]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#64748b]" />
              )}
            </button>

            {aiExpanded && (
              <div className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs text-[#94a3b8]">AI 总结</Label>
                  <p className="text-sm text-[#f8fafc] mt-1">
                    {aiResult.summary}
                  </p>
                </div>

                {aiResult.symbols.length > 0 && (
                  <div>
                    <Label className="text-xs text-[#94a3b8]">象征元素</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {aiResult.symbols.map((s, i) => (
                        <div
                          key={i}
                          className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs"
                        >
                          <span className="text-[#8b5cf6] font-medium">
                            {s.element}
                          </span>
                          <span className="text-[#94a3b8] ml-2">
                            {s.meaning}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiResult.tags.length > 0 && (
                  <div>
                    <Label className="text-xs text-[#94a3b8]">AI 生成标签</Label>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {aiResult.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-[11px] bg-[#8b5cf6]/10 text-[#a78bfa] rounded-md border border-[#8b5cf6]/20"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-[#94a3b8]">心理洞察</Label>
                  <p className="text-sm text-[#94a3b8] mt-1">{aiResult.insight}</p>
                </div>

                <div>
                  <Label className="text-xs text-[#94a3b8]">
                    情绪分数
                    <span className="float-right text-[#8b5cf6]">
                      {aiResult.mood_score}/100
                    </span>
                  </Label>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all',
                        aiResult.mood_score >= 70
                          ? 'bg-green-500'
                          : aiResult.mood_score >= 40
                            ? 'bg-yellow-500'
                            : 'bg-red-500',
                      )}
                      style={{ width: `${aiResult.mood_score}%` }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/insights')}
                    className="w-full mt-3 border-[#8b5cf6]/30 text-[#8b5cf6] rounded-lg text-xs h-8"
                  >
                    <BarChart3 className="w-3 h-3 mr-1" />
                    查看洞察看板，发现情绪潮汐
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {aiError && (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-300 break-words">{aiError}</p>
            </div>
            <button
              onClick={() => setAiError(null)}
              className="text-red-400 hover:text-red-300 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.content.trim()}
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl px-6"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? '保存中...' : saved ? '已保存' : '永久保存'}
          </Button>

          <Button
            onClick={handleSaveAndAnalyze}
            disabled={
              analyzing ||
              saving ||
              !form.title.trim() ||
              !form.content.trim()
            }
            variant="outline"
            className={cn(
              'border-[#8b5cf6]/30 text-[#8b5cf6] hover:text-[#f8fafc] hover:bg-[#8b5cf6]/10 rounded-xl',
            )}
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {analyzing ? 'AI 解析中...' : '一键 AI 解析梦境'}
          </Button>
        </div>
      </div>

      <div className="w-[260px] space-y-4">
        <Card className="p-4 bg-white/5 border-white/10 backdrop-blur rounded-2xl">
          <h3 className="text-sm font-medium text-[#f8fafc] mb-3">手动标记</h3>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-[#94a3b8] mb-2 block">情绪</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {moods.map((mood) => (
                  <button
                    key={mood.value}
                    onClick={() =>
                      setForm((prev) => ({ ...prev, user_mood: mood.value }))
                    }
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] transition-all',
                      form.user_mood === mood.value
                        ? 'bg-white/10 text-[#f8fafc] ring-1 ring-white/20'
                        : 'text-[#64748b] hover:text-[#f8fafc] hover:bg-white/5',
                    )}
                  >
                    <mood.icon
                      className="w-4 h-4"
                      style={{ color: mood.color }}
                    />
                    {mood.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-[#94a3b8] mb-2 block">
                清醒度
                <span className="float-right text-[#8b5cf6]">
                  {form.lucidity}/5
                </span>
              </Label>
              <input
                type="range"
                min={0}
                max={5}
                value={form.lucidity}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    lucidity: Number(e.target.value),
                  }))
                }
                className="w-full accent-[#8b5cf6]"
              />
              <div className="flex justify-between text-[10px] text-[#64748b] mt-1">
                <span>
                  <Zap className="w-3 h-3 inline" /> 模糊
                </span>
                <span>清醒</span>
              </div>
            </div>

            <div>
              <Label className="text-xs text-[#94a3b8] mb-2 block">标签</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="添加标签..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  className="h-8 text-xs bg-white/5 border-white/10 text-[#f8fafc] placeholder:text-[#64748b] rounded-lg"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  className="border-white/10 text-[#94a3b8] h-8 rounded-lg"
                >
                  添加
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-[#8b5cf6]/15 text-[#8b5cf6] rounded-full cursor-pointer hover:bg-[#8b5cf6]/25"
                      onClick={() => removeTag(tag)}
                    >
                      {tag}
                      <span className="text-[10px]">×</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white/5 border-white/10 backdrop-blur rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[#f8fafc]">AI 配置</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings')}
              className="h-7 w-7 p-0 text-[#64748b] hover:text-[#f8fafc]"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
          {aiConfig ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#64748b]">服务</span>
                <span className="text-[#94a3b8]">
                  {aiConfig.provider === 'builtin' ? '内置本地引擎' : aiConfig.provider === 'ollama' ? 'Ollama 本地' : 'OpenAI 远程'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748b]">模型</span>
                <span className="text-[#8b5cf6] font-mono max-w-[160px] truncate">
                  {aiConfig.model_name}
                </span>
              </div>
              <p className="text-[10px] text-[#64748b] mt-2">
                点击右侧齿轮图标可修改 AI 配置
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[#64748b]">
                尚未配置 AI 模型，点击下方按钮前往设置
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/settings')}
                className="w-full border-[#8b5cf6]/30 text-[#8b5cf6] rounded-lg"
              >
                <Settings className="w-3 h-3 mr-1" />
                配置 AI
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
