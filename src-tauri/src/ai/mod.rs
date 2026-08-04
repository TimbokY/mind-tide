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
    log::info!("尝试解析 AI 响应，长度: {}", raw_text.len());

    // 第1层：直接解析原始文本
    if let Ok(res) = serde_json::from_str::<AiEmotionResponse>(raw_text) {
        log::info!("第1层解析成功");
        return Ok(res);
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw_text) {
        log::info!("第1层宽松解析成功");
        return Ok(build_response_from_value(&v));
    }

    // 第2层：从 Markdown 代码块提取 JSON
    if let Some(cleaned) = extract_json_from_markdown(raw_text) {
        log::info!("第2层：Markdown 提取");
        if let Ok(res) = serde_json::from_str::<AiEmotionResponse>(&cleaned) {
            return Ok(res);
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cleaned) {
            return Ok(build_response_from_value(&v));
        }
    }

    // 第3层：括号平衡提取最大的 JSON 对象
    if let Some(json_str) = extract_balanced_json(raw_text) {
        log::info!("第3层：括号平衡提取");
        if let Ok(res) = serde_json::from_str::<AiEmotionResponse>(&json_str) {
            return Ok(res);
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_str) {
            return Ok(build_response_from_value(&v));
        }
    }

    // 第4层：正则提取已知字段
    log::info!("第4层：正则字段提取");
    Ok(build_response_from_regex(raw_text))
}

fn safe_truncate(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

fn extract_json_from_markdown(text: &str) -> Option<String> {
    let markers = ["```json", "```"];
    for marker in &markers {
        if let Some(start) = text.find(marker) {
            let prefix_len = marker.len();
            let content_start = text[start + prefix_len..]
                .find('\n')
                .map(|n| start + prefix_len + n + 1)
                .unwrap_or(start + prefix_len);
            for end_marker in &["\n```", "```"] {
                if let Some(end) = text[content_start..].find(end_marker) {
                    let result = text[content_start..content_start + end].trim().to_string();
                    if result.starts_with('{') || result.starts_with('[') {
                        return Some(result);
                    }
                }
            }
        }
    }
    None
}

fn extract_balanced_json(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape_next = false;
    let bytes = text.as_bytes();

    for (i, &b) in bytes.iter().enumerate().skip(start) {
        if escape_next {
            escape_next = false;
            continue;
        }
        if in_string {
            match b {
                b'"' => in_string = false,
                b'\\' => escape_next = true,
                _ => {}
            }
            continue;
        }
        match b {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    let candidate = String::from_utf8_lossy(&bytes[start..=i]).to_string();
                    log::info!("括号平衡提取: {}", safe_truncate(&candidate, 200));
                    return Some(candidate);
                }
            }
            _ => {}
        }
    }
    None
}

fn build_response_from_value(value: &serde_json::Value) -> AiEmotionResponse {
    log::info!("从 JSON Value 构建结果");

    let summary = value["summary"]
        .as_str()
        .unwrap_or("梦境解析完成")
        .to_string();

    let insight = value["insight"]
        .as_str()
        .unwrap_or("这是一段有趣的梦境体验")
        .to_string();

    let symbols: Vec<Symbol> = value["symbols"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    Some(Symbol {
                        element: s["element"].as_str()?.to_string(),
                        meaning: s["meaning"].as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let emotion_analysis = if let Some(ea) = value.get("emotion_analysis") {
        EmotionAnalysis {
            primary_mood: ea["primary_mood"].as_str().unwrap_or("calm").to_string(),
            mood_score: ea["mood_score"].as_i64().unwrap_or(50) as i32,
            dimensions: ea["dimensions"].as_object().map_or_else(default_dimensions, |obj| {
                obj.iter()
                    .map(|(k, v)| (k.to_string(), v.as_i64().unwrap_or(50) as i32))
                    .collect()
            }),
        }
    } else {
        EmotionAnalysis {
            primary_mood: "calm".to_string(),
            mood_score: 50,
            dimensions: default_dimensions(),
        }
    };

    AiEmotionResponse {
        summary,
        symbols,
        insight,
        emotion_analysis,
    }
}

fn default_dimensions() -> HashMap<String, i32> {
    let mut dims = HashMap::new();
    dims.insert("fear".to_string(), 20);
    dims.insert("joy".to_string(), 30);
    dims.insert("sadness".to_string(), 10);
    dims.insert("calm".to_string(), 40);
    dims
}

fn build_response_from_regex(text: &str) -> AiEmotionResponse {
    log::info!("正则提取构建结果");

    let summary = extract_str_field(text, "summary")
        .unwrap_or_else(|| "梦境解析完成".to_string());

    let insight = extract_str_field(text, "insight")
        .unwrap_or_else(|| "这是一段有趣的梦境体验".to_string());

    let symbols = extract_symbols(text);

    let primary_mood = extract_str_field(text, "primary_mood")
        .map(|s| s.trim_matches('"').to_string())
        .unwrap_or_else(|| "calm".to_string());

    let mood_score = extract_i32_field(text, "mood_score").unwrap_or(50);

    let mut dimensions = default_dimensions();
    for key in &["fear", "joy", "sadness", "calm"] {
        if let Some(val) = extract_i32_field_in_object(text, key) {
            dimensions.insert(key.to_string(), val);
        }
    }

    AiEmotionResponse {
        summary,
        symbols,
        insight,
        emotion_analysis: EmotionAnalysis {
            primary_mood,
            mood_score,
            dimensions,
        },
    }
}

fn extract_str_field(text: &str, field: &str) -> Option<String> {
    let pattern = format!("\"{}\"", field);
    let start = text.find(&pattern)?;
    let after_key = &text[start + pattern.len()..];
    let after_colon = after_key.trim_start().strip_prefix(':')?.trim_start();
    if after_colon.starts_with('"') {
        let content = &after_colon[1..];
        let mut result = String::new();
        let mut escape = false;
        for ch in content.chars() {
            if escape {
                result.push(ch);
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                break;
            } else {
                result.push(ch);
            }
        }
        Some(result)
    } else if after_colon.starts_with('{') || after_colon.starts_with('[') {
        None
    } else {
        let end = after_colon.find(|c: char| c == ',' || c == '\n' || c == '}').unwrap_or(after_colon.len());
        let val = after_colon[..end].trim().to_string();
        if val.is_empty() { None } else { Some(val) }
    }
}

fn extract_i32_field(text: &str, field: &str) -> Option<i32> {
    let pattern = format!("\"{}\"", field);
    let start = text.find(&pattern)?;
    let after_key = &text[start + pattern.len()..];
    let after_colon = after_key.trim_start().strip_prefix(':')?.trim_start();
    let end = after_colon.find(|c: char| c == ',' || c == '\n' || c == '}').unwrap_or(after_colon.len());
    after_colon[..end].trim().parse().ok()
}

fn extract_i32_field_in_object(text: &str, field: &str) -> Option<i32> {
    let pattern = format!("\"{}\"", field);
    let start = text.find(&pattern)?;
    let after_key = &text[start + pattern.len()..];
    let after_colon = after_key.trim_start().strip_prefix(':')?.trim_start();
    let end = after_colon.find(|c: char| c == ',' || c == '\n' || c == '}').unwrap_or(after_colon.len());
    after_colon[..end].trim().parse().ok()
}

fn extract_symbols(text: &str) -> Vec<Symbol> {
    let mut symbols = Vec::new();
    if let Some(arr_start) = text.find("\"symbols\"") {
        let after_key = &text[arr_start + 10..];
        if let Some(bracket_start) = after_key.find('[') {
            let rest = &after_key[bracket_start..];
            let mut i = 1usize;
            let bytes = rest.as_bytes();
            let mut depth = 1i32;
            let mut in_string = false;
            let mut escape = false;
            while i < bytes.len() && depth > 0 {
                if escape { escape = false; i += 1; continue; }
                if in_string {
                    match bytes[i] {
                        b'"' => in_string = false,
                        b'\\' => escape = true,
                        _ => {}
                    }
                } else {
                    match bytes[i] {
                        b'"' => in_string = true,
                        b'[' => depth += 1,
                        b']' => depth -= 1,
                        _ => {}
                    }
                }
                i += 1;
            }
            let symbols_json = String::from_utf8_lossy(&bytes[0..i]);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&symbols_json) {
                if let Some(arr) = v.as_array() {
                    for item in arr {
                        if let (Some(element), Some(meaning)) = (
                            item["element"].as_str(),
                            item["meaning"].as_str(),
                        ) {
                            symbols.push(Symbol {
                                element: element.to_string(),
                                meaning: meaning.to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    symbols
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
            .or_else(|| body["error"].as_str())
            .unwrap_or("未知错误");
        return Err(format!("AI 请求失败 (HTTP {}): {}", status, err_msg));
    }

    let ai_text = extract_text_from_response(&body)?;

    log::info!("AI 提取文本: {}", safe_truncate(ai_text, 200));

    parse_ai_response(ai_text)
}

fn extract_text_from_response(body: &serde_json::Value) -> Result<&str, String> {
    if let Some(text) = body["choices"][0]["message"]["content"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["choices"][0]["text"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["message"]["content"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["response"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["output"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["content"].as_str() {
        return Ok(text);
    }
    if let Some(text) = body["text"].as_str() {
        return Ok(text);
    }
    if let Some(choices) = body["choices"].as_array() {
        if let Some(choice) = choices.first() {
            if let Some(text) = choice["delta"]["content"].as_str() {
                return Ok(text);
            }
            if let Some(text) = choice["text"].as_str() {
                return Ok(text);
            }
        }
    }
    Err(format!(
        "AI 返回内容为空。原始响应: {}",
        serde_json::to_string(body).unwrap_or_default()
    ))
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

    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|e| format!("解析响应失败: {}", e))?;

    if !status.is_success() {
        let err_msg = body["error"]["message"]
            .as_str()
            .or_else(|| body["error"].as_str())
            .unwrap_or("未知错误");
        return Err(format!("AI 请求失败 (HTTP {}): {}", status, err_msg));
    }

    let text = extract_text_from_response(&body)?.to_string();

    Ok(text.trim().to_string())
}
