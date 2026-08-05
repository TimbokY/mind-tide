use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel, Special};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::LlamaToken;
use serde::{Deserialize, Serialize};
use std::num::NonZero;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;

use crate::ai::prompts;
use crate::ai::AiEmotionResponse;

static LOCAL_MODEL: OnceLock<Mutex<Option<LocalModel>>> = OnceLock::new();

pub struct LocalModel {
    pub model: LlamaModel,
    pub backend: LlamaBackend,
    pub model_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadableModel {
    pub name: String,
    pub display_name: String,
    pub size: String,
    pub url: String,
    pub filename: String,
    pub expected_bytes: u64,
}

pub fn available_models() -> Vec<DownloadableModel> {
    vec![
        DownloadableModel {
            name: "qwen2.5-1.5b".into(),
            display_name: "Qwen2.5 1.5B（轻量快速）".into(),
            size: "~1 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
            expected_bytes: 986_000_000,
        },
        DownloadableModel {
            name: "qwen2.5-3b".into(),
            display_name: "Qwen2.5 3B（推荐平衡）".into(),
            size: "~2 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-3b-instruct-q4_k_m.gguf".into(),
            expected_bytes: 2_147_000_000,
        },
        DownloadableModel {
            name: "qwen2.5-7b".into(),
            display_name: "Qwen2.5 7B（最佳效果）".into(),
            size: "~4.5 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-7b-instruct-q4_k_m.gguf".into(),
            expected_bytes: 4_700_000_000,
        },
    ]
}

pub fn check_model_exists(models_dir: &PathBuf, filename: &str) -> bool {
    models_dir.join(filename).exists()
}

pub async fn download_model(
    models_dir: &PathBuf,
    model: &DownloadableModel,
    on_progress: impl Fn(u64, u64) + Send + 'static,
    cancel_flag: Option<&AtomicBool>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(models_dir).map_err(|e| e.to_string())?;

    let file_path = models_dir.join(&model.filename);

    let client = reqwest::Client::new();
    let response = client
        .get(&model.url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);

    let mut downloaded = 0u64;
    let mut file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        if let Some(flag) = cancel_flag {
            if flag.load(Ordering::Relaxed) {
                drop(file);
                let _ = std::fs::remove_file(&file_path);
                return Err("下载已取消".into());
            }
        }
        let chunk = chunk.map_err(|e| format!("下载失败: {}", e))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total_size);
    }

    let actual_size = std::fs::metadata(&file_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let expected = model.expected_bytes;
    let tolerance = expected / 20; // 5% tolerance
    if actual_size < expected - tolerance {
        let _ = std::fs::remove_file(&file_path);
        return Err(format!(
            "下载不完整！文件大小 {} MB，预期约 {} MB。\n已删除不完整文件，请重新下载。",
            actual_size / 1_000_000,
            expected / 1_000_000,
        ));
    }
    log::info!("模型下载完成: {} MB", actual_size / 1_000_000);
    Ok(file_path)
}

pub fn load_model(model_path: &PathBuf) -> Result<(), String> {
    let file_size = std::fs::metadata(model_path)
        .map(|m| m.len())
        .unwrap_or(0);
    log::info!("加载模型: {:?}, 文件大小: {} bytes (CPU only)", model_path, file_size);

    let backend = LlamaBackend::init().map_err(|e| format!("初始化后端失败: {}", e))?;

    let model = LlamaModel::load_from_file(
        &backend,
        model_path,
        &LlamaModelParams::default().with_n_gpu_layers(0),
    )
    .map_err(|e| format!("加载模型失败（{} MB）: {}", file_size / 1024 / 1024, e))?;

    let instance = LocalModel {
        model,
        backend,
        model_path: model_path.clone(),
    };

    let cell = LOCAL_MODEL.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    *guard = Some(instance);

    Ok(())
}

pub fn run_inference(prompt: &str) -> Result<String, String> {
    run_inference_with_params(prompt, 4096u32, 1024)
}

pub fn run_inference_with_params(
    prompt: &str,
    n_ctx: u32,
    n_predict: usize,
) -> Result<String, String> {
    let cell = LOCAL_MODEL
        .get()
        .ok_or("本地模型未加载，请先下载并加载模型")?;
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    let instance = guard.as_mut().ok_or("本地模型未加载")?;

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZero::new(n_ctx));

    let mut ctx = instance
        .model
        .new_context(&instance.backend, ctx_params)
        .map_err(|e| format!("创建上下文失败: {}", e))?;

    let tokens_list = instance
        .model
        .str_to_token(prompt, AddBos::Always)
        .map_err(|e| format!("分词失败: {}", e))?;

    let n_tokens = tokens_list.len();
    log::info!(
        "推理: prompt 长度 {} 字符, {} tokens, n_ctx={}, n_predict={}",
        prompt.len(),
        n_tokens,
        n_ctx,
        n_predict,
    );

    if n_tokens > n_ctx as usize {
        log::warn!(
            "Prompt token 数 {} 超过上下文窗口 {}，可能被截断",
            n_tokens,
            n_ctx,
        );
    }

    let mut batch = LlamaBatch::new(n_tokens, 1);

    for (i, token) in tokens_list.iter().enumerate() {
        let is_last = i == tokens_list.len() - 1;
        batch
            .add(*token, i as i32, &[0], is_last)
            .map_err(|e| format!("构建批次失败: {}", e))?;
    }

    ctx.decode(&mut batch)
        .map_err(|e| format!("解码失败: {}", e))?;

    let mut sampler = LlamaSampler::greedy();

    let eos_token = instance.model.token_eos();
    let mut output = String::new();
    let mut n_cur = batch.n_tokens();

    for _ in 0..n_predict {
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);

        if token == eos_token {
            break;
        }

        let token_str = instance
            .model
            .token_to_str(token, Special::Tokenize)
            .map_err(|e| format!("token转文本失败: {}", e))?;

        output.push_str(&token_str);

        batch.clear();
        batch
            .add(token, n_cur, &[0], true)
            .map_err(|e| format!("构建批次失败: {}", e))?;
        n_cur += 1;

        ctx.decode(&mut batch)
            .map_err(|e| format!("解码失败: {}", e))?;
    }

    log::info!("推理完成: 输出 {} 字符", output.len());
    Ok(output)
}

pub fn run_local_analysis(content: &str) -> Result<AiEmotionResponse, String> {
    let full_prompt = prompts::DREAM_ANALYSIS_PROMPT.replace("{content}", content);
    match run_inference(&full_prompt) {
        Ok(raw_output) => crate::ai::parse_ai_response(&raw_output),
        Err(e) => {
            log::warn!("本地模型推理失败: {}，使用兜底结果", e);
            crate::ai::parse_ai_response("")
        }
    }
}

pub fn is_model_loaded() -> bool {
    LOCAL_MODEL
        .get()
        .and_then(|cell| cell.lock().ok())
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn unload_model() -> bool {
    LOCAL_MODEL
        .get()
        .and_then(|cell| cell.lock().ok())
        .map(|mut guard| {
            let had_model = guard.is_some();
            *guard = None;
            had_model
        })
        .unwrap_or(false)
}

pub fn run_text_simple(prompt: &str) -> Result<String, String> {
    run_inference_with_params(prompt, 4096u32, 2048)
}
