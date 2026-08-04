pub mod local_model;
pub mod prompts;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Symbol {
    pub element: String,
    pub meaning: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EmotionAnalysis {
    pub primary_mood: String,
    pub mood_score: i32,
    pub dimensions: HashMap<String, i32>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AiEmotionResponse {
    pub summary: String,
    pub symbols: Vec<Symbol>,
    pub insight: String,
    pub emotion_analysis: EmotionAnalysis,
}

pub fn parse_ai_response(raw_text: &str) -> Result<AiEmotionResponse, String> {
    if let Ok(res) = serde_json::from_str::<AiEmotionResponse>(raw_text) {
        return Ok(res);
    }

    let start = raw_text.find('{').unwrap_or(0);
    let end = raw_text.rfind('}').unwrap_or(raw_text.len());
    let json_str = &raw_text[start..=end];

    serde_json::from_str::<AiEmotionResponse>(json_str)
        .map_err(|e| format!("AI 返回格式解析失败: {}", e))
}

pub async fn call_ai(
    api_url: &str,
    api_key: &str,
    model_name: &str,
    content: &str,
) -> Result<AiEmotionResponse, String> {
    let prompt = prompts::DREAM_ANALYSIS_PROMPT.replace("{content}", content);

    let url = if api_url.ends_with("/chat/completions") {
        api_url.to_string()
    } else {
        format!("{}/chat/completions", api_url.trim_end_matches('/'))
    };
    log::info!("AI 请求地址: {}", url);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model_name,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.7,
            "max_tokens": 1024
        }))
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {}", e))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 AI 响应失败 (HTTP {}): {}", status, e))?;

    log::info!("AI 原始返回: {}", serde_json::to_string_pretty(&body).unwrap_or_default());

    if !status.is_success() {
        let err_msg = body["error"]["message"]
            .as_str()
            .unwrap_or("未知错误");
        return Err(format!("AI 请求失败 (HTTP {}): {}", status, err_msg));
    }

    let ai_text = body["choices"][0]["message"]["content"]
        .as_str()
        .or_else(|| body["response"].as_str())
        .or_else(|| body["output"].as_str())
        .or_else(|| body["message"]["content"].as_str())
        .ok_or_else(|| {
            format!(
                "AI 返回内容为空。原始响应: {}",
                serde_json::to_string(&body).unwrap_or_default()
            )
        })?;

    log::info!("AI 提取文本: {}", &ai_text[..std::cmp::min(200, ai_text.len())]);

    parse_ai_response(ai_text)
}

pub async fn call_ai_text(
    api_url: &str,
    api_key: &str,
    model_name: &str,
    user_prompt: &str,
) -> Result<String, String> {
    let url = if api_url.ends_with("/chat/completions") {
        api_url.to_string()
    } else {
        format!("{}/chat/completions", api_url.trim_end_matches('/'))
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": model_name,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": 0.8,
            "max_tokens": 512
        }))
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {}", e))?;

    let body: serde_json::Value = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    let text = body["choices"][0]["message"]["content"]
        .as_str()
        .or_else(|| body["response"].as_str())
        .or_else(|| body["output"].as_str())
        .ok_or_else(|| format!("AI 返回为空"))?
        .to_string();

    Ok(text.trim().to_string())
}
