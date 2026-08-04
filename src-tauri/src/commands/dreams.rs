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

    conn.execute(
        "UPDATE dreams SET ai_mood = ?1, mood_score = ?2, emotions = ?3, updated_at = datetime('now','localtime') WHERE id = ?4",
        rusqlite::params![
            ai_result.emotion_analysis.primary_mood,
            ai_result.emotion_analysis.mood_score,
            emotions_json,
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
            "SELECT id, title, content, mood_score, ai_mood, user_mood, lucidity, tags, dream_date
             FROM dreams
             WHERE dream_date >= ?1 AND dream_date < ?2
             ORDER BY dream_date ASC",
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
    conn.execute("DELETE FROM dreams", [])
        .map_err(|e| e.to_string())?;
    log::info!("已清除全部 {} 条梦境记录", count);
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

#[tauri::command]
pub async fn generate_monthly_insight(
    db: State<'_, Database>,
    input: InsightInput,
) -> Result<String, String> {
    let start = format!("{}-{:02}-01", input.year, input.month);
    let end = if input.month == 12 {
        format!("{}-01-01", input.year + 1)
    } else {
        format!("{}-{:02}-01", input.year, input.month + 1)
    };

    let dreams: Vec<(String, i32)> = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT title, mood_score FROM dreams WHERE dream_date >= ?1 AND dream_date < ?2 ORDER BY dream_date")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![start, end], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
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

    let dream_list = dreams
        .iter()
        .enumerate()
        .map(|(i, (title, score))| format!("{}. {} (情绪分: {})", i + 1, title, score))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = crate::ai::prompts::MONTHLY_INSIGHT_PROMPT
        .replace("{year}", &input.year.to_string())
        .replace("{month}", &input.month.to_string())
        .replace("{count}", &dreams.len().to_string())
        .replace("{dream_list}", &dream_list);

    let result = if input.provider.as_deref() == Some("builtin") {
        crate::ai::local_model::run_text_simple(&prompt)
    } else {
        crate::ai::call_ai_text(&input.api_url, &input.api_key, &input.model_name, &prompt).await
    }?;

    let ref_date = format!("{}-{:02}", input.year, input.month);
    let _ = save_summary_internal(&db, "monthly", &ref_date, &result);

    Ok(result)
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
