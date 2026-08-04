use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::local_model;
use crate::db::Database;

const CONFIG_KEY: &str = "ai_config";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConfig {
    pub provider: String,
    pub api_url: String,
    pub api_key: String,
    pub model_name: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: "builtin".into(),
            api_url: String::new(),
            api_key: String::new(),
            model_name: "qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
        }
    }
}

#[tauri::command]
pub fn get_ai_config(db: State<Database>) -> Result<AiConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [CONFIG_KEY],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(json) => {
            serde_json::from_str(&json).map_err(|e| format!("配置解析失败: {}", e))
        }
        Err(_) => {
            let default = AiConfig::default();
            let json = serde_json::to_string(&default).unwrap_or_default();
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![CONFIG_KEY, json],
            )
            .map_err(|e| e.to_string())?;
            Ok(default)
        }
    }
}

#[tauri::command]
pub fn save_ai_config(
    db: State<Database>,
    config: AiConfig,
) -> Result<AiConfig, String> {
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        rusqlite::params![CONFIG_KEY, json],
    )
    .map_err(|e| e.to_string())?;

    Ok(config)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<String>,
}

#[tauri::command]
pub async fn fetch_ollama_models(
    base_url: Option<String>,
) -> Result<Vec<OllamaModel>, String> {
    let base = base_url
        .unwrap_or_else(|| "http://localhost:11434".into())
        .trim_end_matches("/v1")
        .trim_end_matches('/')
        .to_string();

    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/api/tags", base))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("无法连接 Ollama: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析模型列表失败: {}", e))?;

    let models = body["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|m| OllamaModel {
            name: m["name"].as_str().unwrap_or("unknown").to_string(),
            size: m["size"].as_i64().map(|s| format_size(s as u64)),
        })
        .collect();

    Ok(models)
}

fn format_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{} KB", bytes / 1024)
    }
}

#[tauri::command]
pub fn get_available_local_models() -> Result<Vec<local_model::DownloadableModel>, String> {
    Ok(local_model::available_models())
}

#[tauri::command]
pub fn check_local_model(
    filename: String,
    app_handle: AppHandle,
) -> Result<bool, String> {
    let models_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    Ok(local_model::check_model_exists(&models_dir, &filename))
}

#[tauri::command]
pub fn is_local_model_loaded() -> Result<bool, String> {
    Ok(local_model::is_model_loaded())
}

#[tauri::command]
pub async fn download_local_model(
    filename: String,
    url: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let models_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");

    let model = local_model::DownloadableModel {
        name: String::new(),
        display_name: String::new(),
        size: String::new(),
        url,
        filename: filename.clone(),
    };

    let app_clone = app_handle.clone();
    let path = local_model::download_model(
        &models_dir,
        &model,
        move |downloaded, total| {
            let _ = app_clone.emit("model-download-progress", serde_json::json!({
                "downloaded": downloaded,
                "total": total,
                "filename": filename,
            }));
        },
    )
    .await?;

    let path_str = path.to_string_lossy().to_string();
    Ok(path_str)
}

#[tauri::command]
pub fn load_local_model(
    filename: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let models_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");

    let model_path = models_dir.join(&filename);
    if !model_path.exists() {
        return Err(format!("模型文件不存在: {}", filename));
    }

    local_model::load_model(&model_path)
}

#[tauri::command]
pub fn ensure_model_loaded(
    app_handle: AppHandle,
    db: State<'_, Database>,
) -> Result<bool, String> {
    if local_model::is_model_loaded() {
        return Ok(true);
    }

    let config = get_ai_config_from_db(&db)?;
    if config.provider != "builtin" || config.model_name.is_empty() {
        return Ok(false);
    }

    let models_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    let model_path = models_dir.join(&config.model_name);

    if !model_path.exists() {
        return Ok(false);
    }

    match local_model::load_model(&model_path) {
        Ok(()) => Ok(true),
        Err(e) => {
            log::warn!("自动加载模型失败: {}", e);
            Ok(false)
        }
    }
}

fn get_ai_config_from_db(db: &Database) -> Result<AiConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        ["ai_config"],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(json) => serde_json::from_str(&json).map_err(|e| format!("配置解析失败: {}", e)),
        Err(_) => Ok(AiConfig::default()),
    }
}
