mod ai;
mod commands;
mod db;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app.path().app_local_data_dir().map_err(|e| {
                Box::<dyn std::error::Error>::from(e.to_string())
            })?;

            let database = Database::new(app_data_dir)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dreams::save_dream,
            commands::dreams::get_dreams,
            commands::dreams::get_dream,
            commands::dreams::analyze_dream,
            commands::dreams::get_dreams_by_month,
            commands::dreams::delete_dream,
            commands::dreams::generate_monthly_insight,
            commands::dreams::generate_today_summary,
            commands::dreams::export_dreams,
            commands::dreams::export_dreams_file,
            commands::dreams::import_dreams,
            commands::dreams::clear_all_dreams,
            commands::dreams::save_ai_summary,
            commands::dreams::get_ai_summary,
            commands::stats::get_mood_trend,
            commands::stats::get_emotion_radar,
            commands::stats::get_dashboard_stats,
            commands::stats::get_dream_heatmap,
            commands::stats::get_tag_frequencies,
            commands::settings::get_ai_config,
            commands::settings::save_ai_config,
            commands::settings::get_all_ai_configs,
            commands::settings::save_all_ai_configs,
            commands::settings::fetch_ollama_models,
            commands::settings::get_available_local_models,
            commands::settings::check_local_model,
            commands::settings::is_local_model_loaded,
            commands::settings::download_local_model,
            commands::settings::load_local_model,
            commands::settings::ensure_model_loaded,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
