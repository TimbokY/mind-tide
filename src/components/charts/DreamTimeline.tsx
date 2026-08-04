import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Smile, Frown, Meh, Trash2, ChevronDown, RefreshCw } from 'lucide-react'

interface Dream {
  id: string
  title: string
  content: string
  mood_score: number
  ai_mood: string | null
  user_mood: string | null
  lucidity: number
  tags: string | null
  dream_date: string
}

interface DayGroup {
  date: string
  dreams: Dream[]
  avgScore: number
}

interface DreamTimelineProps {
  groups: DayGroup[]
  onDelete: (id: string) => void
  onReAnalyze?: (dreamId: string) => void
  analyzingId?: string | null
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const moodLabels: Record<string, string> = {
  joy: '喜悦', sadness: '悲伤', fear: '恐惧',
  anger: '愤怒', surprise: '惊讶', calm: '平静', neutral: '中性',
}

function mColor(score: number) {
  if (score >= 70) return { bar: 'bg-green-500', text: 'text-green-400' }
  if (score >= 40) return { bar: 'bg-yellow-500', text: 'text-yellow-400' }
  return { bar: 'bg-red-500', text: 'text-red-400' }
}

export function DreamTimeline({ groups, onDelete, onReAnalyze, analyzingId }: DreamTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const refs = useRef<Map<string, HTMLDivElement>>(new Map())

  const handleDelete = (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id))
    setTimeout(() => {
      onDelete(id)
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 300)
  }

  if (groups.length === 0) return null

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div
          key={group.date}
          ref={(el) => { if (el) refs.current.set(group.date, el) }}
        >
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-xs font-medium text-[#64748b]">
              {new Date(group.date).getDate()}日 {WEEKDAYS[new Date(group.date).getDay()]}
            </span>
            <span className="text-[10px] text-[#64748b]/50">{group.dreams.length}条</span>
            <span className={cn('text-[10px] font-semibold', mColor(group.avgScore).text)}>
              {group.avgScore}/100
            </span>
          </div>

          <div className="space-y-1">
            {group.dreams.map((dream) => {
              const id = dream.id
              const score = dream.mood_score
              const colors = mColor(score)
              const Icon = score >= 70 ? Smile : score >= 40 ? Meh : Frown
              const isExpanded = expandedId === id
              const isDeleting = deletingIds.has(id)
              let tags: string[] = []
              try { if (dream.tags) tags = JSON.parse(dream.tags) } catch {}

              return (
                <motion.div
                  key={id}
                  animate={isDeleting ? { opacity: 0, x: 40, height: 0, marginBottom: 0 } : {}}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group',
                      'bg-white/[0.02] hover:bg-white/[0.04] border border-transparent hover:border-white/5',
                      isExpanded && 'bg-white/[0.04] border-white/5 rounded-b-none',
                    )}
                  >
                    <div className={cn('w-1 self-stretch rounded-full shrink-0', colors.bar)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium text-[#f8fafc] truncate">{dream.title}</h4>
                        <div className="flex items-center gap-2 shrink-0">
                          {dream.ai_mood && (
                            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-white/5 text-[#94a3b8]">
                              <Icon className="w-3 h-3" />{moodLabels[dream.ai_mood] ?? dream.ai_mood}
                            </span>
                          )}
                          <span className={cn('text-sm font-semibold', colors.text)}>{score}</span>
                          <ChevronDown className={cn(
                            'w-3.5 h-3.5 text-[#64748b] transition-transform duration-300',
                            'opacity-0 group-hover:opacity-100',
                            isExpanded && 'rotate-180 opacity-100',
                          )} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-[#64748b]">清醒 {dream.lucidity}/5</span>
                        {dream.user_mood && (
                          <span className="text-[11px] text-[#64748b]">
                            {moodLabels[dream.user_mood] ?? dream.user_mood}
                          </span>
                        )}
                        {tags.map((t) => (
                          <span key={t} className="px-1 py-0.5 text-[10px] bg-[#8b5cf6]/10 text-[#8b5cf6] rounded-md">{t}</span>
                        ))}
                      </div>
                    </div>
                    <motion.button
                      className={cn(
                        'p-1 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0',
                        isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                      )}
                      onClick={(e) => { e.stopPropagation(); handleDelete(id) }}
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                    {onReAnalyze && (
                      <motion.button
                        className={cn(
                          'p-1 rounded-lg text-[#64748b] hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all shrink-0',
                          isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                        onClick={(e) => { e.stopPropagation(); onReAnalyze(id) }}
                        title="重新AI解读"
                        disabled={analyzingId === id}
                      >
                        {analyzingId === id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#8b5cf6]" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                      </motion.button>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 py-3 text-sm text-[#94a3b8] leading-relaxed whitespace-pre-wrap bg-white/[0.01] rounded-b-xl border-t border-white/5">
                          {dream.content}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
