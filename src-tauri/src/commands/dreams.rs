use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::ai::{self, AiEmotionResponse};
use crate::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Dream {
    pub id: String,
    pub title: String,
    pub content: String,
    pub user_mood: Option<String>,
    pub ai_mood: Option<String>,
    pub mood_score: i32,
    pub emotions: Option<String>,
    pub tags: Option<String>,
    pub lucidity: i32,
    pub dream_date: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiAnalysisResult {
    pub dream: Dream,
    pub summary: String,
    pub symbols: Vec<ai::Symbol>,
    pub insight: String,
    pub primary_mood: String,
    pub mood_score: i32,
    pub emotions: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveDreamInput {
    pub title: String,
    pub content: String,
    pub user_mood: Option<String>,
    pub dream_date: String,
    pub lucidity: Option<i32>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub fn save_dream(db: State<Database>, input: SaveDreamInput) -> Result<Dream, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags_json = serde_json::to_string(&input.tags.unwrap_or_default()).unwrap_or_default();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO dreams (id, title, content, user_mood, dream_date, lucidity, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            id,
            input.title,
            input.content,
            input.user_mood,
            input.dream_date,
            input.lucidity.unwrap_or(0),
            tags_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    let dream = conn
        .query_row(
            "SELECT id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date, created_at, updated_at
             FROM dreams WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Dream {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    user_mood: row.get(3)?,
                    ai_mood: row.get(4)?,
                    mood_score: row.get(5)?,
                    emotions: row.get(6)?,
                    tags: row.get(7)?,
                    lucidity: row.get(8)?,
                    dream_date: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(dream)
}

#[tauri::command]
pub fn get_dreams(db: State<Database>, limit: Option<i32>, offset: Option<i32>) -> Result<Vec<Dream>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(20);
    let offset = offset.unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date, created_at, updated_at
             FROM dreams ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let dreams = stmt
        .query_map(rusqlite::params![limit, offset], |row| {
            Ok(Dream {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                user_mood: row.get(3)?,
                ai_mood: row.get(4)?,
                mood_score: row.get(5)?,
                emotions: row.get(6)?,
                tags: row.get(7)?,
                lucidity: row.get(8)?,
                dream_date: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for dream in dreams {
        results.push(dream.map_err(|e| e.to_string())?);
    }

    Ok(results)
}

#[tauri::command]
pub fn get_dream(db: State<Database>, id: String) -> Result<Dream, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let dream = conn
        .query_row(
            "SELECT id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date, created_at, updated_at
             FROM dreams WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Dream {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    user_mood: row.get(3)?,
                    ai_mood: row.get(4)?,
                    mood_score: row.get(5)?,
                    emotions: row.get(6)?,
                    tags: row.get(7)?,
                    lucidity: row.get(8)?,
                    dream_date: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(dream)
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeDreamInput {
    pub dream_id: String,
    pub api_url: String,
    pub api_key: String,
    pub model_name: String,
    pub provider: Option<String>,
}

#[tauri::command]
pub async fn analyze_dream(
    db: State<'_, Database>,
    input: AnalyzeDreamInput,
) -> Result<AiAnalysisResult, String> {
    let content = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT content FROM dreams WHERE id = ?1",
            rusqlite::params![input.dream_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| format!("梦境不存在: {}", e))?
    };

    let ai_result: AiEmotionResponse = if input.provider.as_deref() == Some("builtin") {
        ai::local_model::run_local_analysis(&content)?
    } else {
        ai::call_ai(
            &input.api_url,
            &input.api_key,
            &input.model_name,
            &content,
        )
        .await?
    };

    let emotions_json = serde_json::to_string(&ai_result.emotion_analysis.dimensions)
        .unwrap_or_default();
    let symbols_json = serde_json::to_string(&ai_result.symbols).unwrap_or_default();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let existing_tags_json: Option<String> = conn
        .query_row(
            "SELECT tags FROM dreams WHERE id = ?1",
            rusqlite::params![input.dream_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let mut merged_tags: Vec<String> = if let Some(ref t) = existing_tags_json {
        serde_json::from_str(t).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };
    for tag in &ai_result.tags {
        if !merged_tags.contains(tag) {
            merged_tags.push(tag.clone());
        }
    }
    let merged_tags_json = serde_json::to_string(&merged_tags).unwrap_or_default();

    conn.execute(
        "UPDATE dreams SET ai_mood = ?1, mood_score = ?2, emotions = ?3, tags = ?4, updated_at = datetime('now','localtime') WHERE id = ?5",
        rusqlite::params![
            ai_result.emotion_analysis.primary_mood,
            ai_result.emotion_analysis.mood_score,
            emotions_json,
            merged_tags_json,
            input.dream_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM analyses WHERE dream_id = ?1", rusqlite::params![input.dream_id])
        .map_err(|e| e.to_string())?;

    let analysis_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO analyses (id, dream_id, model_name, summary, symbols, insight)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            analysis_id,
            input.dream_id,
            input.model_name,
            ai_result.summary,
            symbols_json,
            ai_result.insight,
        ],
    )
    .map_err(|e| e.to_string())?;

    let dream = conn
        .query_row(
            "SELECT id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date, created_at, updated_at
             FROM dreams WHERE id = ?1",
            rusqlite::params![input.dream_id],
            |row| {
                Ok(Dream {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    user_mood: row.get(3)?,
                    ai_mood: row.get(4)?,
                    mood_score: row.get(5)?,
                    emotions: row.get(6)?,
                    tags: row.get(7)?,
                    lucidity: row.get(8)?,
                    dream_date: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(AiAnalysisResult {
        dream,
        summary: ai_result.summary,
        symbols: ai_result.symbols,
        insight: ai_result.insight,
        primary_mood: ai_result.emotion_analysis.primary_mood,
        mood_score: ai_result.emotion_analysis.mood_score,
        emotions: emotions_json,
        tags: merged_tags,
    })
}

#[derive(Debug, Serialize, Clone)]
pub struct CalendarDream {
    pub id: String,
    pub title: String,
    pub content: String,
    pub mood_score: i32,
    pub ai_mood: Option<String>,
    pub user_mood: Option<String>,
    pub lucidity: i32,
    pub tags: Option<String>,
    pub dream_date: String,
    pub summary: Option<String>,
    pub symbols: Option<String>,
    pub insight: Option<String>,
}

#[tauri::command]
pub fn get_dreams_by_month(
    db: State<Database>,
    year: i32,
    month: i32,
) -> Result<Vec<CalendarDream>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let start = format!("{}-{:02}-01", year, month);
    let end = if month == 12 {
        format!("{}-01-01", year + 1)
    } else {
        format!("{}-{:02}-01", year, month + 1)
    };

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.title, d.content, d.mood_score, d.ai_mood, d.user_mood,
                    d.lucidity, d.tags, d.dream_date,
                    a.summary, a.symbols, a.insight
             FROM dreams d
             LEFT JOIN analyses a ON a.dream_id = d.id
             WHERE d.dream_date >= ?1 AND d.dream_date < ?2
             ORDER BY d.dream_date ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([start, end], |row| {
            Ok(CalendarDream {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                mood_score: row.get(3)?,
                ai_mood: row.get(4)?,
                user_mood: row.get(5)?,
                lucidity: row.get(6)?,
                tags: row.get(7)?,
                dream_date: row.get(8)?,
                summary: row.get(9)?,
                symbols: row.get(10)?,
                insight: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for dream in rows {
        results.push(dream.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn delete_dream(db: State<Database>, id: String) -> Result<bool, String> {
    log::info!("删除梦境: {}", id);
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM dreams WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("未找到梦境: {}", id));
    }
    log::info!("已删除 {} 条记录", affected);
    Ok(true)
}

#[derive(Debug, Serialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub dreams: Vec<Dream>,
}

#[tauri::command]
pub fn export_dreams(db: State<Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date, created_at, updated_at
             FROM dreams ORDER BY dream_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Dream {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                user_mood: row.get(3)?,
                ai_mood: row.get(4)?,
                mood_score: row.get(5)?,
                emotions: row.get(6)?,
                tags: row.get(7)?,
                lucidity: row.get(8)?,
                dream_date: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut dreams = Vec::new();
    for row in rows {
        dreams.push(row.map_err(|e| e.to_string())?);
    }
    let data = ExportData {
        version: "1.0".into(),
        exported_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        dreams,
    };
    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_dreams_file(app_handle: AppHandle, db: State<Database>) -> Result<String, String> {
    let json = export_dreams(db)?;
    let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
    let default_name = format!("dream-tide-export-{}.json", date_str);

    let path = app_handle
        .dialog()
        .file()
        .add_filter("JSON 文件", &["json"])
        .set_file_name(&default_name)
        .blocking_save_file();

    match path {
        Some(file_path) => {
            std::fs::write(file_path.as_path().unwrap(), &json)
                .map_err(|e| format!("写入文件失败: {}", e))?;
            Ok(format!("已导出到 {}", file_path.as_path().unwrap().display()))
        }
        None => Err("已取消导出".into()),
    }
}

#[derive(Debug, Deserialize)]
pub struct ImportDream {
    pub id: Option<String>,
    pub title: String,
    pub content: String,
    pub user_mood: Option<String>,
    pub ai_mood: Option<String>,
    pub mood_score: Option<i32>,
    pub emotions: Option<String>,
    pub tags: Option<String>,
    pub lucidity: Option<i32>,
    pub dream_date: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportData {
    pub dreams: Vec<ImportDream>,
}

#[tauri::command]
pub fn import_dreams(db: State<Database>, json: String) -> Result<String, String> {
    let data: ImportData = serde_json::from_str(&json).map_err(|e| format!("JSON 解析失败: {}", e))?;
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut count = 0;
    for dream in &data.dreams {
        let id = dream.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let tags_json = dream.tags.clone().unwrap_or_else(|| "[]".into());
        conn.execute(
            "INSERT OR REPLACE INTO dreams (id, title, content, user_mood, ai_mood, mood_score, emotions, tags, lucidity, dream_date)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                id,
                dream.title,
                dream.content,
                dream.user_mood,
                dream.ai_mood,
                dream.mood_score.unwrap_or(50),
                dream.emotions,
                tags_json,
                dream.lucidity.unwrap_or(0),
                dream.dream_date,
            ],
        )
        .map_err(|e| format!("导入失败: {}", e))?;
        count += 1;
    }
    Ok(format!("成功导入 {} 条梦境记录", count))
}

#[tauri::command]
pub fn clear_all_dreams(db: State<Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM dreams", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM analyses", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ai_summaries", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM dreams", [])
        .map_err(|e| e.to_string())?;
    log::info!("已清除全部 {} 条梦境记录及关联数据", count);
    Ok(format!("已清除全部 {} 条梦境记录", count))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSummary {
    pub id: String,
    pub summary_type: String,
    pub ref_date: String,
    pub content: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveAiSummaryInput {
    pub summary_type: String,
    pub ref_date: String,
    pub content: String,
}

#[tauri::command]
pub fn save_ai_summary(db: State<Database>, input: SaveAiSummaryInput) -> Result<AiSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM ai_summaries WHERE summary_type = ?1 AND ref_date = ?2",
            rusqlite::params![input.summary_type, input.ref_date],
            |row| row.get(0),
        )
        .ok();
    if let Some(eid) = existing {
        conn.execute(
            "UPDATE ai_summaries SET content = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            rusqlite::params![input.content, eid],
        )
        .map_err(|e| e.to_string())?;
        let summary = conn
            .query_row(
                "SELECT id, summary_type, ref_date, content, created_at, updated_at FROM ai_summaries WHERE id = ?1",
                rusqlite::params![eid],
                |row| {
                    Ok(AiSummary {
                        id: row.get(0)?,
                        summary_type: row.get(1)?,
                        ref_date: row.get(2)?,
                        content: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        return Ok(summary);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ai_summaries (id, summary_type, ref_date, content) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, input.summary_type, input.ref_date, input.content],
    )
    .map_err(|e| e.to_string())?;
    let summary = conn
        .query_row(
            "SELECT id, summary_type, ref_date, content, created_at, updated_at FROM ai_summaries WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(AiSummary {
                    id: row.get(0)?,
                    summary_type: row.get(1)?,
                    ref_date: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(summary)
}

#[tauri::command]
pub fn get_ai_summary(
    db: State<Database>,
    summary_type: String,
    ref_date: String,
) -> Result<Option<AiSummary>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, summary_type, ref_date, content, created_at, updated_at FROM ai_summaries WHERE summary_type = ?1 AND ref_date = ?2",
        rusqlite::params![summary_type, ref_date],
        |row| {
            Ok(AiSummary {
                id: row.get(0)?,
                summary_type: row.get(1)?,
                ref_date: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct InsightInput {
    pub year: i32,
    pub month: i32,
    pub api_url: String,
    pub api_key: String,
    pub model_name: String,
    pub provider: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct HighlightDay {
    pub label: String,
    pub date: String,
    pub desc: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MonthlyInsight {
    pub year: i32,
    pub month: i32,
    pub total_dreams: i32,
    pub avg_mood_score: f64,
    pub avg_lucidity: f64,
    pub trend: String,
    pub trend_value: i32,
    pub dominant_mood: String,
    pub highlights: Vec<HighlightDay>,
    pub themes: Vec<String>,
    pub insight_text: String,
    pub suggestion: String,
    pub emotion_shift: Option<std::collections::HashMap<String, i32>>,
    pub lucidity_note: String,
    pub top_symbols: Vec<String>,
    pub top_tags: Vec<String>,
    pub daily_scores: Vec<(String, i32)>,
    pub prev_month_avg: Option<f64>,
}

#[tauri::command]
pub async fn generate_monthly_insight(
    db: State<'_, Database>,
    input: InsightInput,
) -> Result<MonthlyInsight, String> {
    let start = format!("{}-{:02}-01", input.year, input.month);
    let end = if input.month == 12 {
        format!("{}-01-01", input.year + 1)
    } else {
        format!("{}-{:02}-01", input.year, input.month + 1)
    };

    #[derive(Debug)]
    struct DreamRow {
        title: String,
        dream_date: String,
        mood_score: i32,
        ai_mood: Option<String>,
        lucidity: i32,
        emotions: Option<String>,
        summary: Option<String>,
        symbols: Option<String>,
        insight: Option<String>,
        tags: Option<String>,
    }

    let dreams: Vec<DreamRow> = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT d.title, d.dream_date, d.mood_score, d.ai_mood, d.lucidity,
                        d.emotions, a.summary, a.symbols, a.insight, d.tags
                 FROM dreams d
                 LEFT JOIN analyses a ON a.dream_id = d.id
                 WHERE d.dream_date >= ?1 AND d.dream_date < ?2
                 ORDER BY d.dream_date ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![&start, &end], |row| {
                Ok(DreamRow {
                    title: row.get(0)?,
                    dream_date: row.get(1)?,
                    mood_score: row.get(2)?,
                    ai_mood: row.get(3)?,
                    lucidity: row.get(4)?,
                    emotions: row.get(5)?,
                    summary: row.get(6)?,
                    symbols: row.get(7)?,
                    insight: row.get(8)?,
                    tags: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        results
    };

    if dreams.is_empty() {
        return Err("该月暂无梦境记录".into());
    }

    let total_dreams = dreams.len() as i32;
    let avg_mood_score = dreams.iter().map(|d| d.mood_score as f64).sum::<f64>() / total_dreams as f64;
    let avg_lucidity = dreams.iter().map(|d| d.lucidity as f64).sum::<f64>() / total_dreams as f64;

    let first_score = dreams.first().map(|d| d.mood_score).unwrap_or(0);
    let last_score = dreams.last().map(|d| d.mood_score).unwrap_or(0);
    let trend_value = last_score - first_score;

    let mut mood_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for d in &dreams {
        if let Some(ref m) = d.ai_mood {
            *mood_counts.entry(m.clone()).or_insert(0) += 1;
        }
    }
    let top_mood = mood_counts.iter()
        .max_by_key(|&(_, v)| v)
        .map(|(k, _)| k.clone())
        .unwrap_or_else(|| "calm".into());

    let mut symbol_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for d in &dreams {
        if let Some(ref s) = d.symbols {
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(s) {
                for item in &arr {
                    if let Some(e) = item["element"].as_str() {
                        *symbol_counts.entry(e.to_string()).or_insert(0) += 1;
                    }
                }
            }
        }
    }
    let mut top_symbols: Vec<String> = {
        let mut pairs: Vec<_> = symbol_counts.into_iter().collect();
        pairs.sort_by(|a, b| b.1.cmp(&a.1));
        pairs.into_iter().map(|(k, _)| k).take(5).collect()
    };

    let mut tag_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for d in &dreams {
        if let Some(ref t) = d.tags {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(t) {
                for tag in tags {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }
    }
    let mut top_tags: Vec<String> = {
        let mut pairs: Vec<_> = tag_counts.into_iter().collect();
        pairs.sort_by(|a, b| b.1.cmp(&a.1));
        pairs.into_iter().map(|(k, _)| k).take(5).collect()
    };

    let mut fear_sum = 0f64;
    let mut joy_sum = 0f64;
    let mut sadness_sum = 0f64;
    let mut calm_sum = 0f64;
    let mut emo_count = 0;
    for d in &dreams {
        if let Some(ref e) = d.emotions {
            if let Ok(dims) = serde_json::from_str::<serde_json::Value>(e) {
                fear_sum += dims["fear"].as_f64().unwrap_or(0.0);
                joy_sum += dims["joy"].as_f64().unwrap_or(0.0);
                sadness_sum += dims["sadness"].as_f64().unwrap_or(0.0);
                calm_sum += dims["calm"].as_f64().unwrap_or(0.0);
                emo_count += 1;
            }
        }
    }
    let (fear_avg, joy_avg, sadness_avg, calm_avg) = if emo_count > 0 {
        (
            (fear_sum / emo_count as f64).round() as i32,
            (joy_sum / emo_count as f64).round() as i32,
            (sadness_sum / emo_count as f64).round() as i32,
            (calm_sum / emo_count as f64).round() as i32,
        )
    } else {
        (20, 30, 10, 40)
    };

    let dream_list = dreams
        .iter()
        .enumerate()
        .map(|(i, d)| {
            let mood_cn = match d.ai_mood.as_deref() {
                Some("joy") => "喜悦",
                Some("sadness") => "悲伤",
                Some("fear") => "恐惧",
                Some("anger") => "愤怒",
                Some("surprise") => "惊讶",
                Some("calm") => "平静",
                _ => "无",
            };
            let mut line = format!(
                "{}. [{}] {}(分:{},情绪:{},清醒:{})",
                i + 1, &d.dream_date[5..], d.title, d.mood_score, mood_cn, d.lucidity,
            );
            if let Some(ref s) = d.summary {
                let shortened = if s.chars().count() > 30 {
                    format!("{}…", s.chars().take(30).collect::<String>())
                } else {
                    s.clone()
                };
                line.push_str(&format!(" - {}", shortened));
            }
            let mut symbol_text = String::new();
            if let Some(ref s) = d.symbols {
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(s) {
                    let elements: Vec<&str> = arr.iter()
                        .filter_map(|v| v["element"].as_str())
                        .take(3)
                        .collect();
                    if !elements.is_empty() {
                        symbol_text = format!(" [{}]", elements.join(","));
                    }
                }
            }
            if !symbol_text.is_empty() {
                line.push_str(&symbol_text);
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n");

    let last_month_comparison = get_last_month_comparison(&db, input.year, input.month);

    let prompt = crate::ai::prompts::MONTHLY_INSIGHT_PROMPT
        .replace("{year}", &input.year.to_string())
        .replace("{month}", &input.month.to_string())
        .replace("{count}", &total_dreams.to_string())
        .replace("{dream_list}", &dream_list)
        .replace("{avg_score}", &format!("{:.1}", avg_mood_score))
        .replace("{avg_lucidity}", &format!("{:.1}", avg_lucidity))
        .replace("{top_mood}", &top_mood)
        .replace("{top_symbols}", &top_symbols.join(", "))
        .replace("{top_tags}", &top_tags.join(", "))
        .replace("{fear_avg}", &fear_avg.to_string())
        .replace("{joy_avg}", &joy_avg.to_string())
        .replace("{sadness_avg}", &sadness_avg.to_string())
        .replace("{calm_avg}", &calm_avg.to_string())
        .replace("{last_month_comparison}", &last_month_comparison);

    log::info!("月度洞察 prompt 长度: {} 字符", prompt.len());
    let result = if input.provider.as_deref() == Some("builtin") {
        let r = crate::ai::local_model::run_text_simple(&prompt)?;
        log::info!("本地模型返回 {} 字符: {}", r.len(), safe_truncate(&r, 200));
        r
    } else {
        let r = ai::call_ai_text_with_system_and_tokens(
            &input.api_url,
            &input.api_key,
            &input.model_name,
            Some("你是一位梦境心理分析师。请根据数据生成月度情绪洞察，严格按照 JSON 格式输出，不要添加任何解释或 Markdown。"),
            &prompt,
            4096,
        ).await?;
        log::info!("远程模型返回 {} 字符: {}", r.len(), safe_truncate(&r, 200));
        r
    };

    let best_day = dreams.iter().max_by_key(|d| d.mood_score);
    let worst_day = dreams.iter().min_by_key(|d| d.mood_score);

    fn mood_label(mood: Option<&String>) -> &str {
        match mood.and_then(|m| Option::from(m.as_str())) {
            Some("joy") => "喜悦",
            Some("sadness") => "悲伤",
            Some("fear") => "恐惧",
            Some("anger") => "愤怒",
            Some("surprise") => "惊讶",
            Some("calm") => "平静",
            Some(m) => m,
            None => "无",
        }
    }

    let mut highlights = Vec::new();
    if let Some(d) = best_day {
        highlights.push(HighlightDay {
            label: "最佳日".into(),
            date: d.dream_date[5..].to_string(),
            desc: format!("情绪分 {} 分，情绪为 {}", d.mood_score,
                mood_label(d.ai_mood.as_ref())),
        });
    }
    if let Some(d) = worst_day {
        highlights.push(HighlightDay {
            label: "低谷日".into(),
            date: d.dream_date[5..].to_string(),
            desc: format!("情绪分 {} 分，情绪为 {}", d.mood_score,
                mood_label(d.ai_mood.as_ref())),
        });
    }

    let parsed = extract_insight_json(&result);

    let daily_scores: Vec<(String, i32)> = dreams.iter()
        .map(|d| (d.dream_date.clone(), d.mood_score))
        .collect();

    let prev_month_avg = get_prev_month_avg(&db, input.year, input.month);

    let trend_str = if trend_value > 5 { "上升" } else if trend_value < -5 { "下降" } else { "平稳" };
    let computed_themes: Vec<String> = top_symbols.iter().take(2).chain(top_tags.iter().take(2)).cloned().collect();

    let insight = if let Some(ref parsed) = parsed {
        let emotion_shift = if let Some(shift) = parsed.get("emotion_shift") {
            let mut map = std::collections::HashMap::new();
            for key in ["fear", "joy", "sadness", "calm"].iter() {
                map.insert(key.to_string(), shift[*key].as_i64().unwrap_or(0) as i32);
            }
            Some(map)
        } else {
            None
        };

        MonthlyInsight {
            year: input.year, month: input.month, total_dreams,
            avg_mood_score: (avg_mood_score * 10.0).round() / 10.0,
            avg_lucidity: (avg_lucidity * 10.0).round() / 10.0,
            trend: parsed["trend"].as_str().unwrap_or(trend_str).to_string(),
            trend_value,
            dominant_mood: parsed["dominant_mood"].as_str().unwrap_or(&top_mood).to_string(),
            highlights,
            themes: parsed["themes"].as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or(computed_themes),
            insight_text: parsed["insight_text"].as_str().unwrap_or("").to_string(),
            suggestion: parsed["suggestion"].as_str().unwrap_or("").to_string(),
            emotion_shift,
            lucidity_note: parsed["lucidity_note"].as_str().unwrap_or("").to_string(),
            top_symbols, top_tags, daily_scores, prev_month_avg,
        }
    } else {
        let fallback_insight = format!(
            "{}月共记录 {} 条梦境，平均情绪分 {:.1} 分，情绪趋势{}（{}分→{}分）。主导情绪为{}，平均清醒度 {:.1}/5。高频象征元素包括：{}。",
            input.month, total_dreams,
            (avg_mood_score * 10.0).round() / 10.0,
            trend_str, first_score, last_score,
            mood_label(Some(&top_mood)),
            (avg_lucidity * 10.0).round() / 10.0,
            top_symbols.iter().take(3).map(|s| s.as_str()).collect::<Vec<_>>().join("、"),
        );

        MonthlyInsight {
            year: input.year, month: input.month, total_dreams,
            avg_mood_score: (avg_mood_score * 10.0).round() / 10.0,
            avg_lucidity: (avg_lucidity * 10.0).round() / 10.0,
            trend: trend_str.to_string(),
            trend_value,
            dominant_mood: top_mood,
            highlights,
            themes: computed_themes,
            insight_text: fallback_insight,
            suggestion: String::new(),
            emotion_shift: None,
            lucidity_note: String::new(),
            top_symbols, top_tags, daily_scores, prev_month_avg,
        }
    };

    let ref_date = format!("{}-{:02}", input.year, input.month);
    let json_str = serde_json::to_string(&insight).map_err(|e| e.to_string())?;
    let _ = save_summary_internal(&db, "monthly", &ref_date, &json_str);

    Ok(insight)
}

fn safe_truncate(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

fn extract_insight_json(raw: &str) -> Option<serde_json::Value> {
    log::info!("尝试提取洞察 JSON，长度: {}", raw.len());

    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        log::info!("洞察 JSON 直接解析成功");
        return Some(v);
    }

    for marker in &["```json", "```"] {
        if let Some(start) = raw.find(marker) {
            let prefix_len = marker.len();
            let content_start = raw[start + prefix_len..]
                .find('\n')
                .map(|n| start + prefix_len + n + 1)
                .unwrap_or(start + prefix_len);
            for end_marker in &["\n```", "```"] {
                if let Some(end) = raw[content_start..].find(end_marker) {
                    let cleaned = raw[content_start..content_start + end].trim();
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(cleaned) {
                        log::info!("洞察 JSON Markdown 提取成功");
                        return Some(v);
                    }
                }
            }
        }
    }

    if let Some(start) = raw.find('{') {
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escape = false;
        let bytes = raw.as_bytes();
        for (i, &b) in bytes.iter().enumerate().skip(start) {
            if escape { escape = false; continue; }
            if in_string {
                match b { b'"' => in_string = false, b'\\' => escape = true, _ => {} }
                continue;
            }
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        let candidate = String::from_utf8_lossy(&bytes[start..=i]);
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&candidate) {
                            log::info!("洞察 JSON 括号平衡提取成功");
                            return Some(v);
                        }
                        break;
                    }
                }
                _ => {}
            }
        }
    }

    log::info!("洞察 JSON 解析全部失败，返回 None");
    None
}

fn get_last_month_comparison(db: &State<'_, Database>, year: i32, month: i32) -> String {
    let (prev_year, prev_month) = if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    };
    let prev_start = format!("{}-{:02}-01", prev_year, prev_month);
    let prev_end = if prev_month == 12 {
        format!("{}-01-01", prev_year + 1)
    } else {
        format!("{}-{:02}-01", prev_year, prev_month + 1)
    };

    let conn = match db.conn.lock() { Ok(c) => c, Err(_) => return "无上月数据".into() };
    let mut stmt = match conn.prepare(
        "SELECT COUNT(*), COALESCE(AVG(mood_score), 50), COALESCE(AVG(lucidity), 0)
         FROM dreams WHERE dream_date >= ?1 AND dream_date < ?2",
    ) {
        Ok(s) => s,
        Err(_) => return "无上月数据".into(),
    };

    let (count, avg_score, avg_lucidity): (i32, f64, f64) = match stmt.query_row(
        rusqlite::params![&prev_start, &prev_end],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ) {
        Ok(r) => r,
        Err(_) => return "无上月数据".into(),
    };

    if count == 0 {
        return format!("上月（{}年{}月）无梦境记录，无法对比。", prev_year, prev_month);
    }

    let mut emo_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    if let Ok(mut s) = conn.prepare(
        "SELECT ai_mood FROM dreams WHERE dream_date >= ?1 AND dream_date < ?2 AND ai_mood IS NOT NULL",
    ) {
        if let Ok(rows) = s.query_map(rusqlite::params![&prev_start, &prev_end], |row| row.get::<_, String>(0)) {
            for row in rows {
                if let Ok(mood) = row {
                    *emo_counts.entry(mood).or_insert(0) += 1;
                }
            }
        }
    }
    let prev_top_mood = emo_counts.iter()
        .max_by_key(|&(_, v)| v)
        .map(|(k, _)| k.clone())
        .unwrap_or_else(|| "calm".into());

    format!(
        "上月（{}年{}月）共 {} 条梦境，平均情绪分 {:.1}，平均清醒度 {:.1}，主导情绪 {}",
        prev_year, prev_month, count,
        (avg_score * 10.0).round() / 10.0,
        (avg_lucidity * 10.0).round() / 10.0,
        prev_top_mood,
    )
}

fn get_prev_month_avg(db: &State<'_, Database>, year: i32, month: i32) -> Option<f64> {
    let (prev_year, prev_month) = if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    };
    let prev_start = format!("{}-{:02}-01", prev_year, prev_month);
    let prev_end = if prev_month == 12 {
        format!("{}-01-01", prev_year + 1)
    } else {
        format!("{}-{:02}-01", prev_year, prev_month + 1)
    };

    let conn = db.conn.lock().ok()?;
    let (count, avg_score): (i32, f64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(AVG(mood_score), 50) FROM dreams WHERE dream_date >= ?1 AND dream_date < ?2",
            rusqlite::params![&prev_start, &prev_end],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()?;
    if count == 0 { None } else { Some((avg_score * 10.0).round() / 10.0) }
}

#[tauri::command]
pub async fn generate_today_summary(
    db: State<'_, Database>,
    input: InsightInput,
) -> Result<String, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let dreams: Vec<String> = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT title FROM dreams WHERE dream_date = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&today], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| e.to_string())?);
        }
        results
    };

    if dreams.is_empty() {
        return Err("今天还没有梦境记录".into());
    }

    let content = dreams.join("、");
    let prompt = crate::ai::prompts::TODAY_SUMMARY_PROMPT.replace("{content}", &content);

    let result = if input.provider.as_deref() == Some("builtin") {
        crate::ai::local_model::run_text_simple(&prompt)
    } else {
        crate::ai::call_ai_text(&input.api_url, &input.api_key, &input.model_name, &prompt).await
    }?;

    let ref_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let _ = save_summary_internal(&db, "today", &ref_date, &result);

    Ok(result)
}

fn save_summary_internal(
    db: &State<'_, Database>,
    summary_type: &str,
    ref_date: &str,
    content: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM ai_summaries WHERE summary_type = ?1 AND ref_date = ?2",
            rusqlite::params![summary_type, ref_date],
            |row| row.get(0),
        )
        .ok();
    if let Some(eid) = existing {
        conn.execute(
            "UPDATE ai_summaries SET content = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            rusqlite::params![content, eid],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO ai_summaries (id, summary_type, ref_date, content) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, summary_type, ref_date, content],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
