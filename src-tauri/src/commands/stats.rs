use serde::Serialize;
use tauri::State;

use crate::db::Database;

#[derive(Debug, Serialize)]
pub struct MoodTrend {
    pub date: String,
    pub score: i32,
    pub primary_mood: String,
    pub count: i32,
}

#[derive(Debug, Serialize)]
pub struct EmotionDimension {
    pub name: String,
    pub value: f64,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_dreams: i32,
    pub monthly_avg_score: f64,
    pub weekly_count: i32,
    pub top_mood: String,
}

#[derive(Debug, Serialize)]
pub struct HeatmapEntry {
    pub date: String,
    pub count: i32,
    pub avg_score: i32,
}

#[derive(Debug, Serialize)]
pub struct TagFrequency {
    pub tag: String,
    pub count: i32,
}

#[tauri::command]
pub fn get_mood_trend(
    db: State<Database>,
    days: Option<i32>,
) -> Result<Vec<MoodTrend>, String> {
    let days = days.unwrap_or(30);
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT strftime('%m-%d', dream_date) as date,
                    CAST(AVG(mood_score) AS INTEGER) as score,
                    COALESCE(ai_mood, 'neutral') as primary_mood,
                    COUNT(*) as count
             FROM dreams
             WHERE dream_date >= date('now', ?1 || ' days')
             GROUP BY dream_date
             ORDER BY dream_date ASC",
        )
        .map_err(|e| e.to_string())?;

    let days_param = format!("-{}", days);
    let rows = stmt
        .query_map([days_param], |row| {
            Ok(MoodTrend {
                date: row.get(0)?,
                score: row.get(1)?,
                primary_mood: row.get(2)?,
                count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_emotion_radar(
    db: State<Database>,
    days: Option<i32>,
) -> Result<Vec<EmotionDimension>, String> {
    let days = days.unwrap_or(30);
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT emotions FROM dreams
             WHERE dream_date >= date('now', ?1 || ' days')
             AND emotions IS NOT NULL AND emotions != '{}'",
        )
        .map_err(|e| e.to_string())?;

    let days_param = format!("-{}", days);
    let rows = stmt
        .query_map([days_param], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut fear_total = 0.0;
    let mut joy_total = 0.0;
    let mut sadness_total = 0.0;
    let mut calm_total = 0.0;
    let mut count = 0;

    for row in rows {
        let json_str = row.map_err(|e| e.to_string())?;
        if let Ok(dims) = serde_json::from_str::<serde_json::Value>(&json_str) {
            fear_total += dims["fear"].as_f64().unwrap_or(0.0);
            joy_total += dims["joy"].as_f64().unwrap_or(0.0);
            sadness_total += dims["sadness"].as_f64().unwrap_or(0.0);
            calm_total += dims["calm"].as_f64().unwrap_or(0.0);
            count += 1;
        }
    }

    if count == 0 {
        return Ok(vec![
            EmotionDimension { name: "恐惧".into(), value: 0.0 },
            EmotionDimension { name: "喜悦".into(), value: 0.0 },
            EmotionDimension { name: "悲伤".into(), value: 0.0 },
            EmotionDimension { name: "平静".into(), value: 0.0 },
        ]);
    }

    Ok(vec![
        EmotionDimension { name: "恐惧".into(), value: (fear_total / count as f64).round() },
        EmotionDimension { name: "喜悦".into(), value: (joy_total / count as f64).round() },
        EmotionDimension { name: "悲伤".into(), value: (sadness_total / count as f64).round() },
        EmotionDimension { name: "平静".into(), value: (calm_total / count as f64).round() },
    ])
}

#[tauri::command]
pub fn get_dashboard_stats(db: State<Database>) -> Result<DashboardStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let total_dreams: i32 = conn
        .query_row("SELECT COUNT(*) FROM dreams", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let monthly_avg_score: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(mood_score), 50.0) FROM dreams WHERE dream_date >= date('now', '-30 days')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let weekly_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM dreams WHERE dream_date >= date('now', '-7 days')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let top_mood: String = conn
        .query_row(
            "SELECT COALESCE(ai_mood, 'neutral') FROM dreams
             WHERE dream_date >= date('now', '-30 days')
             GROUP BY ai_mood ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "neutral".into());

    Ok(DashboardStats {
        total_dreams,
        monthly_avg_score: (monthly_avg_score * 10.0).round() / 10.0,
        weekly_count,
        top_mood,
    })
}

#[tauri::command]
pub fn get_dream_heatmap(
    db: State<Database>,
    year: Option<i32>,
    month: Option<i32>,
) -> Result<Vec<HeatmapEntry>, String> {
    let year = year.unwrap_or_else(|| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap();
        let secs = now.as_secs();
        1970 + (secs / 31556952) as i32
    });
    let month = month.unwrap_or(1);

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let start = format!("{}-{:02}-01", year, month);
    let end = if month == 12 {
        format!("{}-01-01", year + 1)
    } else {
        format!("{}-{:02}-01", year, month + 1)
    };

    let mut stmt = conn
        .prepare(
            "SELECT dream_date, COUNT(*) as count, CAST(AVG(mood_score) AS INTEGER) as avg_score
             FROM dreams
             WHERE dream_date >= ?1 AND dream_date < ?2
             GROUP BY dream_date
             ORDER BY dream_date ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([start, end], |row| {
            Ok(HeatmapEntry {
                date: row.get(0)?,
                count: row.get(1)?,
                avg_score: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_tag_frequencies(db: State<Database>) -> Result<Vec<TagFrequency>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT tags FROM dreams WHERE tags IS NOT NULL AND tags != '[]'")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut tag_counts: std::collections::HashMap<String, i32> = std::collections::HashMap::new();
    for row in rows {
        let json_str = row.map_err(|e| e.to_string())?;
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(&json_str) {
            for tag in tags {
                *tag_counts.entry(tag).or_insert(0) += 1;
            }
        }
    }

    let mut results: Vec<TagFrequency> = tag_counts
        .into_iter()
        .map(|(tag, count)| TagFrequency { tag, count })
        .collect();
    results.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(results)
}
