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
}

pub fn available_models() -> Vec<DownloadableModel> {
    vec![
        DownloadableModel {
            name: "qwen2.5-1.5b".into(),
            display_name: "Qwen2.5 1.5B（轻量快速）".into(),
            size: "~1 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
        },
        DownloadableModel {
            name: "qwen2.5-3b".into(),
            display_name: "Qwen2.5 3B（推荐平衡）".into(),
            size: "~2 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-3b-instruct-q4_k_m.gguf".into(),
        },
        DownloadableModel {
            name: "qwen2.5-7b".into(),
            display_name: "Qwen2.5 7B（最佳效果）".into(),
            size: "~4.5 GB".into(),
            url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf".into(),
            filename: "qwen2.5-7b-instruct-q4_k_m.gguf".into(),
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
        let chunk = chunk.map_err(|e| format!("下载失败: {}", e))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total_size);
    }

    Ok(file_path)
}

pub fn load_model(model_path: &PathBuf) -> Result<(), String> {
    let backend = LlamaBackend::init().map_err(|e| format!("初始化后端失败: {}", e))?;

    let model_params = LlamaModelParams::default();
    let model = LlamaModel::load_from_file(&backend, model_path, &model_params)
        .map_err(|e| format!("加载模型失败: {}", e))?;

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
    let cell = LOCAL_MODEL
        .get()
        .ok_or("本地模型未加载，请先下载并加载模型")?;
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    let instance = guard.as_mut().ok_or("本地模型未加载")?;

    let n_ctx = 4096u32;
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
    let mut batch = LlamaBatch::new(n_tokens, 1);

    for (i, token) in tokens_list.iter().enumerate() {
        let is_last = i == tokens_list.len() - 1;
        batch
            .add(*token, i as i32, &[0], is_last)
            .map_err(|e| format!("构建批次失败: {}", e))?;
    }

    ctx.decode(&mut batch)
        .map_err(|e| format!("解码失败: {}", e))?;

    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::temp(0.7),
        LlamaSampler::top_p(0.9, 1),
    ]);

    let eos_token = instance.model.token_eos();
    let mut output = String::new();
    let n_predict = 1024;
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

    Ok(output)
}

pub fn run_local_analysis(content: &str) -> Result<AiEmotionResponse, String> {
    let full_prompt = prompts::DREAM_ANALYSIS_PROMPT.replace("{content}", content);
    let raw_output = run_inference(&full_prompt)?;
    crate::ai::parse_ai_response(&raw_output)
}

pub fn is_model_loaded() -> bool {
    LOCAL_MODEL
        .get()
        .and_then(|cell| cell.lock().ok())
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn run_text_simple(prompt: &str) -> Result<String, String> {
    run_inference(prompt)
}
