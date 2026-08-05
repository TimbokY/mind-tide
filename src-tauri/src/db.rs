use rusqlite::{Connection, Result as SqliteResult};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> SqliteResult<Self> {
        fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("mind_tide.db");
        let conn = Connection::open(db_path)?;

        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

        Self::init_tables(&conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    fn init_tables(conn: &Connection) -> SqliteResult<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS dreams (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                content     TEXT NOT NULL,
                user_mood   TEXT DEFAULT 'neutral',
                ai_mood     TEXT,
                mood_score  INTEGER DEFAULT 50,
                emotions    TEXT DEFAULT '{}',
                tags        TEXT DEFAULT '[]',
                lucidity    INTEGER DEFAULT 0,
                dream_date  TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id          TEXT PRIMARY KEY,
                dream_id    TEXT NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
                model_name  TEXT NOT NULL,
                summary     TEXT,
                symbols     TEXT DEFAULT '[]',
                insight     TEXT,
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE INDEX IF NOT EXISTS idx_dreams_date ON dreams(dream_date);
            CREATE INDEX IF NOT EXISTS idx_dreams_ai_mood ON dreams(ai_mood);
            CREATE INDEX IF NOT EXISTS idx_dreams_created_at ON dreams(created_at);
            CREATE INDEX IF NOT EXISTS idx_analyses_dream_id ON analyses(dream_id);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_summaries (
                id           TEXT PRIMARY KEY,
                summary_type TEXT NOT NULL,
                ref_date     TEXT NOT NULL,
                content      TEXT NOT NULL,
                created_at   TEXT DEFAULT (datetime('now','localtime')),
                updated_at   TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_type_date
                ON ai_summaries(summary_type, ref_date);",
        )?;

        Ok(())
    }
}
