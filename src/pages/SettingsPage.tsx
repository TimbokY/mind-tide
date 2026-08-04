import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Save,
  Globe,
  Cpu,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Box,
  Play,
  Upload,
  Trash2,
  Shield,
} from 'lucide-react'
import { invoke, listen } from '@/lib/tauri'
import { cn } from '@/lib/utils'

interface AiConfig {
  provider: string
  api_url: string
  api_key: string
  model_name: string
}

interface OllamaModel {
  name: string
  size: string | null
}

interface DownloadableModelInfo {
  name: string
  display_name: string
  size: string
  url: string
  filename: string
}

const PRESETS: Record<string, {
  label: string
  icon: typeof Cpu
  url?: string
  key?: string
  placeholder?: string
}> = {
  builtin: {
    label: '内置本地引擎',
    icon: Box,
  },
  ollama: {
    label: 'Ollama（本地）',
    icon: Cpu,
    url: 'http://localhost:11434/v1',
    key: 'ollama',
    placeholder: 'qwen3:8b',
  },
  openai: {
    label: 'OpenAI 兼容（远程）',
    icon: Globe,
    url: 'https://api.openai.com/v1',
    key: '',
    placeholder: 'gpt-4o-mini',
  },
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AiConfig>({
    provider: 'builtin',
    api_url: '',
    api_key: '',
    model_name: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchError, setModelFetchError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  const [availableModels, setAvailableModels] = useState<DownloadableModelInfo[]>([])
  const [modelExists, setModelExists] = useState<Record<string, boolean>>({})
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{downloaded: number; total: number} | null>(null)
  const [modelLoaded, setModelLoaded] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [clearStep, setClearStep] = useState<'idle' | 'confirm' | 'typing'>('idle')
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadConfig()
    loadAvailableModels()

    const unlisten = listen<{downloaded: number; total: number; filename: string}>(
      'model-download-progress',
      (event) => {
        setDownloadProgress({
          downloaded: event.payload.downloaded,
          total: event.payload.total,
        })
      },
    )
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  useEffect(() => {
    if (config.provider === 'builtin') {
      checkModelFiles()
      checkModelLoaded()
    }
  }, [config.provider, config.model_name])

  const loadConfig = async () => {
    try {
      const loaded = await invoke<AiConfig>('get_ai_config')
      setConfig(loaded)
    } catch {
      // 默认值
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableModels = async () => {
    try {
      const models = await invoke<DownloadableModelInfo[]>('get_available_local_models')
      setAvailableModels(models)
    } catch {
      // ignore
    }
  }

  const checkModelFiles = async () => {
    const result: Record<string, boolean> = {}
    for (const m of availableModels) {
      try {
        const exists = await invoke<boolean>('check_local_model', { filename: m.filename })
        result[m.filename] = exists
      } catch {
        result[m.filename] = false
      }
    }
    setModelExists(result)
  }

  const checkModelLoaded = async () => {
    try {
      const loaded = await invoke<boolean>('is_local_model_loaded')
      setModelLoaded(loaded)
    } catch {
      setModelLoaded(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await invoke('save_ai_config', { config })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('保存配置失败:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleFetchModels = async () => {
    setFetchingModels(true)
    setModelFetchError(null)
    try {
      const models = await invoke<OllamaModel[]>('fetch_ollama_models', {
        baseUrl: config.api_url,
      })
      setOllamaModels(models)
      if (models.length === 0) {
        setModelFetchError('未找到已安装的模型')
      }
    } catch (e) {
      setModelFetchError(String(e))
      setOllamaModels([])
    } finally {
      setFetchingModels(false)
    }
  }

  const handleTest = async () => {
    setTestResult('testing')
    try {
      if (config.provider === 'ollama') {
        const models = await invoke<OllamaModel[]>('fetch_ollama_models', {
          baseUrl: config.api_url,
        })
        setTestResult(models.length > 0 ? 'ok' : 'fail')
        setOllamaModels(models)
      } else if (config.provider === 'builtin') {
        if (!config.model_name) {
          setTestResult('fail')
        } else {
          const exists = await invoke<boolean>('check_local_model', {
            filename: config.model_name,
          })
          setTestResult(exists ? 'ok' : 'fail')
        }
      } else {
        setTestResult('ok')
      }
    } catch {
      setTestResult('fail')
    }
    setTimeout(() => setTestResult('idle'), 3000)
  }

  const handleDownload = async (model: DownloadableModelInfo) => {
    setDownloading(model.filename)
    setDownloadProgress(null)
    try {
      await invoke('download_local_model', {
        filename: model.filename,
        url: model.url,
      })
      setModelExists((prev) => ({ ...prev, [model.filename]: true }))
      setConfig((p) => ({ ...p, model_name: model.filename }))
      await invoke('load_local_model', { filename: model.filename })
      setModelLoaded(true)
    } catch (e) {
      console.error('下载或加载失败:', e)
    } finally {
      setDownloading(null)
      setDownloadProgress(null)
    }
  }

  const handleLoadModel = async () => {
    if (!config.model_name) return
    try {
      await invoke('load_local_model', { filename: config.model_name })
      setModelLoaded(true)
    } catch (e) {
      console.error('加载失败:', e)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const msg = await invoke<string>('export_dreams_file')
      setImportMessage(msg)
      setExported(true)
      setTimeout(() => {
        setExported(false)
        setImportMessage(null)
      }, 4000)
    } catch (e) {
      if (String(e) !== '已取消导出') {
        setImportMessage(`导出失败: ${String(e)}`)
        setTimeout(() => setImportMessage(null), 4000)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMessage(null)
    try {
      const text = await file.text()
      const msg = await invoke<string>('import_dreams', { json: text })
      setImportMessage(msg)
      setTimeout(() => setImportMessage(null), 4000)
    } catch (e) {
      setImportMessage(String(e))
      setTimeout(() => setImportMessage(null), 4000)
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const msg = await invoke<string>('clear_all_dreams')
      setClearStep('idle')
      setClearConfirmText('')
      setImportMessage(msg)
      setTimeout(() => setImportMessage(null), 4000)
    } catch (e) {
      setImportMessage(String(e))
      setTimeout(() => setImportMessage(null), 4000)
    } finally {
      setClearing(false)
    }
  }

  const handleProviderChange = (provider: string) => {
    const preset = PRESETS[provider]
    const newConfig: AiConfig = {
      provider,
      api_url: preset.url ?? '',
      api_key: preset.key ?? '',
      model_name: provider === 'builtin'
        ? 'qwen2.5-1.5b-instruct-q4_k_m.gguf'
        : '',
    }
    setConfig(newConfig)
    setOllamaModels([])
    setModelFetchError(null)
    setTestResult('idle')
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024*1024*1024)).toFixed(1)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / (1024*1024)).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#64748b]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载配置...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-medium">AI 设置</h2>

      <Card className="p-5 bg-white/5 border-white/10 backdrop-blur rounded-2xl space-y-5">
        <div>
          <Label className="text-xs text-[#94a3b8] mb-2 block">模型服务</Label>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(PRESETS).map(([key, preset]) => {
              const Icon = preset.icon
              return (
                <button
                  key={key}
                  onClick={() => handleProviderChange(key)}
                  className={cn(
                    'flex flex-col items-center gap-2 py-3 px-2 rounded-xl text-sm transition-all',
                    config.provider === key
                      ? 'bg-[#8b5cf6]/15 text-[#f8fafc] ring-1 ring-[#8b5cf6]/40'
                      : 'bg-white/5 text-[#94a3b8] hover:bg-white/10',
                  )}
                >
                  <Icon
                    className={cn(
                      'w-5 h-5',
                      config.provider === key ? 'text-[#8b5cf6]' : 'text-[#64748b]',
                    )}
                  />
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>

        {config.provider === 'builtin' && (
          <>
            <div>
              <Label className="text-xs text-[#94a3b8] mb-2 block">
                可选模型
                <span className="text-[#64748b] ml-1">（下载后即可离线使用）</span>
              </Label>
              <div className="space-y-2">
                {availableModels.map((m) => {
                  const exists = modelExists[m.filename]
                  const isSelected = config.model_name === m.filename
                  const isDownloading = downloading === m.filename

                  return (
                    <div
                      key={m.filename}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-xl transition-all',
                        isSelected
                          ? 'bg-[#8b5cf6]/10 ring-1 ring-[#8b5cf6]/20'
                          : 'bg-white/5',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#f8fafc]">{m.display_name}</span>
                          <span className="text-xs text-[#64748b]">{m.size}</span>
                        </div>
                        {isDownloading && downloadProgress && (
                          <div className="mt-1.5">
                            <div className="w-full bg-white/10 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-[#8b5cf6] transition-all"
                                style={{
                                  width: downloadProgress.total > 0
                                    ? `${(downloadProgress.downloaded / downloadProgress.total) * 100}%`
                                    : '0%',
                                }}
                              />
                            </div>
                            <p className="text-[10px] text-[#64748b] mt-0.5">
                              {formatSize(downloadProgress.downloaded)}
                              {downloadProgress.total > 0 && ` / ${formatSize(downloadProgress.total)}`}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {exists ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfig((p) => ({ ...p, model_name: m.filename }))}
                              className={cn(
                                'h-7 text-xs rounded-lg',
                                isSelected ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]' : 'text-[#94a3b8]',
                              )}
                            >
                              {isSelected ? '已选' : '选择'}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(m)}
                            disabled={isDownloading}
                            className="border-[#8b5cf6]/30 text-[#8b5cf6] h-7 text-xs rounded-lg"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Download className="w-3 h-3 mr-1" />
                            )}
                            下载
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl">
              <div className="flex-1">
                <p className="text-xs text-[#94a3b8]">已加载模型</p>
                <p className="text-sm text-[#f8fafc]">{modelLoaded ? config.model_name || '已就绪' : '未加载'}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadModel}
                disabled={modelLoaded || !config.model_name || !modelExists[config.model_name]}
                className="border-white/10 text-[#94a3b8] h-7 text-xs rounded-lg"
              >
                <Play className="w-3 h-3 mr-1" />
                加载
              </Button>
            </div>
          </>
        )}

        {config.provider === 'ollama' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-[#94a3b8] mb-1 block">API 地址</Label>
              <Input
                value={config.api_url}
                onChange={(e) => setConfig((p) => ({ ...p, api_url: e.target.value }))}
                className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                placeholder={PRESETS.ollama.url}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94a3b8] mb-1 block">API Key</Label>
              <Input
                value={config.api_key}
                onChange={(e) => setConfig((p) => ({ ...p, api_key: e.target.value }))}
                type="password"
                className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                placeholder="ollama"
              />
            </div>
          </div>
        )}

        {config.provider === 'openai' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-[#94a3b8] mb-1 block">API 地址</Label>
              <Input
                value={config.api_url}
                onChange={(e) => setConfig((p) => ({ ...p, api_url: e.target.value }))}
                className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                placeholder={PRESETS.openai.url}
              />
            </div>
            <div>
              <Label className="text-xs text-[#94a3b8] mb-1 block">API Key</Label>
              <Input
                value={config.api_key}
                onChange={(e) => setConfig((p) => ({ ...p, api_key: e.target.value }))}
                type="password"
                className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                placeholder="sk-..."
              />
            </div>
          </div>
        )}

        {(config.provider === 'ollama' || config.provider === 'openai') && (
          <>
            {config.provider === 'ollama' && (
              <div>
                <Label className="text-xs text-[#94a3b8] mb-2 block">
                  模型选择
                  <button
                    onClick={handleFetchModels}
                    disabled={fetchingModels}
                    className="ml-2 text-[#8b5cf6] hover:text-[#a78bfa] disabled:opacity-50"
                  >
                    {fetchingModels ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : (
                      <span>获取本地模型列表</span>
                    )}
                  </button>
                </Label>
                {ollamaModels.length > 0 ? (
                  <div className="space-y-1.5">
                    {ollamaModels.map((m) => (
                      <button
                        key={m.name}
                        onClick={() => setConfig((p) => ({ ...p, model_name: m.name }))}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                          config.model_name === m.name
                            ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] ring-1 ring-[#8b5cf6]/30'
                            : 'bg-white/5 text-[#94a3b8] hover:bg-white/10',
                        )}
                      >
                        <span className="font-medium">{m.name}</span>
                        {m.size && <span className="text-xs text-[#64748b]">{m.size}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    value={config.model_name}
                    onChange={(e) => setConfig((p) => ({ ...p, model_name: e.target.value }))}
                    className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                    placeholder={PRESETS.ollama.placeholder}
                  />
                )}
                {modelFetchError && (
                  <p className="text-xs text-[#ef4444] mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {modelFetchError}
                  </p>
                )}
              </div>
            )}
            {config.provider === 'openai' && (
              <div>
                <Label className="text-xs text-[#94a3b8] mb-1 block">模型名称</Label>
                <Input
                  value={config.model_name}
                  onChange={(e) => setConfig((p) => ({ ...p, model_name: e.target.value }))}
                  className="h-10 text-sm bg-white/5 border-white/10 text-[#f8fafc] rounded-xl font-mono"
                  placeholder={PRESETS.openai.placeholder}
                />
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !config.model_name.trim()}
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl px-6"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {saving ? '保存中...' : saved ? '已保存' : '保存配置'}
          </Button>
          <Button
            onClick={handleTest}
            disabled={testResult === 'testing'}
            variant="outline"
            className={cn(
              'border-white/10 rounded-xl',
              testResult === 'ok'
                ? 'text-[#10b981] border-[#10b981]/30'
                : testResult === 'fail'
                  ? 'text-[#ef4444] border-[#ef4444]/30'
                  : 'text-[#94a3b8]',
            )}
          >
            {testResult === 'testing' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : testResult === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            ) : testResult === 'fail' ? (
              <AlertCircle className="w-4 h-4 mr-2" />
            ) : (
              <Globe className="w-4 h-4 mr-2" />
            )}
            {testResult === 'ok' ? '就绪' : testResult === 'fail' ? '失败' : '测试连接'}
          </Button>
        </div>
      </Card>

      <Card className="p-5 bg-white/5 border-white/10 backdrop-blur rounded-2xl space-y-3">
        <h3 className="text-sm font-medium text-[#f8fafc]">模式说明</h3>
        <ul className="space-y-2 text-sm text-[#94a3b8]">
          <li className="flex items-start gap-2">
            <Box className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
            <span>内置本地引擎：无需安装任何软件，选择模型后下载即可离线使用，数据不上传</span>
          </li>
          <li className="flex items-start gap-2">
            <Cpu className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
            <span>Ollama 本地：需要先安装 Ollama 并拉取模型（brew install ollama），模型不离开本机</span>
          </li>
          <li className="flex items-start gap-2">
            <Globe className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" />
            <span>远程 OpenAI 兼容：连接 OpenAI / DeepSeek / ChatAnywhere 等远程服务</span>
          </li>
        </ul>
      </Card>

      <Card className="p-5 bg-white/5 border-white/10 backdrop-blur rounded-2xl space-y-4">
        <h3 className="text-sm font-medium text-[#f8fafc]">数据管理</h3>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleExport}
            disabled={exporting || exported}
            variant="outline"
            className={cn(
              'border-white/10 rounded-xl h-9 transition-colors duration-300',
              exported ? 'text-[#10b981] border-[#10b981]/30' : 'text-[#94a3b8] hover:text-[#f8fafc]',
            )}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : exported ? (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {exporting ? '导出中…' : exported ? '已导出' : '导出全部梦境'}
          </Button>
          <Button
            onClick={handleImportClick}
            disabled={importing}
            variant="outline"
            className="border-white/10 text-[#94a3b8] hover:text-[#f8fafc] rounded-xl h-9"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            导入梦境
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {importMessage && (
          <p className={cn(
            'text-xs flex items-center gap-1.5',
            importMessage.includes('失败') ? 'text-[#ef4444]' : 'text-[#10b981]',
          )}>
            {importMessage.includes('失败') ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {importMessage}
          </p>
        )}

        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#94a3b8]">清除全部梦境数据</p>
              <p className="text-[10px] text-[#64748b] mt-0.5">此操作不可恢复，请谨慎操作</p>
            </div>
            {clearStep === 'idle' && (
              <Button
                onClick={() => setClearStep('confirm')}
                variant="ghost"
                className="text-[#64748b] hover:text-[#ef4444] rounded-lg text-xs h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                清除全部梦境
              </Button>
            )}
            {clearStep === 'confirm' && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setClearStep('typing')}
                  variant="outline"
                  className="border-[#ef4444]/30 text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg text-xs h-8"
                >
                  再次确认清除
                </Button>
                <Button
                  onClick={() => setClearStep('idle')}
                  variant="ghost"
                  className="text-[#64748b] rounded-lg text-xs h-8"
                >
                  取消
                </Button>
              </div>
            )}
            {clearStep === 'typing' && (
              <div className="flex items-center gap-2">
                <Input
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder='请输入"确认删除"'
                  className="h-8 w-40 text-xs bg-white/5 border-white/10 text-[#f8fafc] rounded-lg"
                />
                <Button
                  onClick={handleClearAll}
                  disabled={clearConfirmText !== '确认删除' || clearing}
                  className="bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg text-xs h-8"
                >
                  {clearing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  确认清除
                </Button>
                <Button
                  onClick={() => { setClearStep('idle'); setClearConfirmText('') }}
                  variant="ghost"
                  className="text-[#64748b] rounded-lg text-xs h-8"
                >
                  取消
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] text-[#64748b]">
          <Shield className="w-3 h-3 text-[#10b981] shrink-0" />
          你的梦境数据仅存储在本机，全程离线，不会上传至任何服务器。你的梦，只属于你。
        </div>
      </Card>
    </div>
  )
}
