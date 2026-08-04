type TauriInvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
type TauriListenFn = typeof import('@tauri-apps/api/event').listen

let _invoke: TauriInvokeFn | null = null
let _listen: TauriListenFn | null = null
let _initialized = false

async function initTauri(): Promise<void> {
  if (_initialized) return

  try {
    const [core, event] = await Promise.all([
      import('@tauri-apps/api/core'),
      import('@tauri-apps/api/event'),
    ])
    _invoke = core.invoke as TauriInvokeFn
    _listen = event.listen as TauriListenFn
  } catch {
    console.warn(
      '⚠️ 未检测到 Tauri 运行环境（可能是在浏览器中预览）。\n' +
      '   请使用 npm run tauri dev 启动完整桌面应用。',
    )
  }
  _initialized = true
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!_initialized) await initTauri()
  if (!_invoke) {
    throw new Error(
      `Tauri API 不可用。请使用 npm run tauri dev 启动桌面应用。\n命令: ${cmd}`,
    )
  }
  return _invoke(cmd, args)
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  if (!_initialized) await initTauri()
  if (!_listen) {
    return () => {}
  }
  return _listen(event, handler)
}
