// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{Local, NaiveDate};
use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

// Database wrapper for thread-safe access
pub struct Database(pub Mutex<Connection>);

// Data structures
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WaterEntry {
    pub id: i64,
    pub amount_ml: i32,
    pub timestamp: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyStats {
    pub date: String,
    pub total_ml: i32,
    pub goal_ml: i32,
    pub entries_count: i32,
    pub percentage: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonthlyStats {
    pub month: String,
    pub year: i32,
    pub days: Vec<DailyStats>,
    pub total_ml: i32,
    pub average_ml: f32,
    pub days_goal_met: i32,
    pub current_streak: i32,
    pub best_streak: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub daily_goal_ml: i32,
    pub reminder_interval_minutes: i32,
    pub reminder_enabled: bool,
    pub sound_enabled: bool,
    pub start_with_system: bool,
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            daily_goal_ml: 4000,
            reminder_interval_minutes: 60,
            reminder_enabled: true,
            sound_enabled: true,
            start_with_system: false,
            theme: "dark".to_string(),
        }
    }
}

// Initialize database
fn init_db(conn: &Connection) -> SqliteResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS water_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount_ml INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            date TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            daily_goal_ml INTEGER DEFAULT 4000,
            reminder_interval_minutes INTEGER DEFAULT 60,
            reminder_enabled INTEGER DEFAULT 1,
            sound_enabled INTEGER DEFAULT 1,
            start_with_system INTEGER DEFAULT 0,
            theme TEXT DEFAULT 'dark'
        )",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO settings (id) VALUES (1)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_date ON water_entries(date)",
        [],
    )?;

    Ok(())
}

// Get database path
fn get_db_path() -> String {
    if let Some(proj_dirs) = directories::ProjectDirs::from("com", "hydra", "tracker") {
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir).ok();
        data_dir.join("hydra.db").to_string_lossy().to_string()
    } else {
        "hydra.db".to_string()
    }
}

// Tauri commands
#[tauri::command]
fn add_water(db: State<Database>, amount_ml: i32) -> Result<WaterEntry, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let date = now.format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO water_entries (amount_ml, timestamp, date) VALUES (?1, ?2, ?3)",
        [&amount_ml.to_string(), &timestamp, &date],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(WaterEntry {
        id,
        amount_ml,
        timestamp,
        date,
    })
}

#[tauri::command]
fn remove_entry(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM water_entries WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_today_stats(db: State<Database>) -> Result<DailyStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    let (total_ml, entries_count): (i32, i32) = conn
        .query_row(
            "SELECT COALESCE(SUM(amount_ml), 0), COUNT(*) FROM water_entries WHERE date = ?1",
            [&today],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let goal_ml: i32 = conn
        .query_row("SELECT daily_goal_ml FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .unwrap_or(4000);

    let percentage = if goal_ml > 0 {
        (total_ml as f32 / goal_ml as f32) * 100.0
    } else {
        0.0
    };

    Ok(DailyStats {
        date: today,
        total_ml,
        goal_ml,
        entries_count,
        percentage,
    })
}

#[tauri::command]
fn get_today_entries(db: State<Database>) -> Result<Vec<WaterEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    let mut stmt = conn
        .prepare("SELECT id, amount_ml, timestamp, date FROM water_entries WHERE date = ?1 ORDER BY timestamp DESC")
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([&today], |row| {
            Ok(WaterEntry {
                id: row.get(0)?,
                amount_ml: row.get(1)?,
                timestamp: row.get(2)?,
                date: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
fn get_monthly_stats(db: State<Database>, year: i32, month: u32) -> Result<MonthlyStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let month_str = format!("{:04}-{:02}", year, month);

    let goal_ml: i32 = conn
        .query_row("SELECT daily_goal_ml FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .unwrap_or(4000);

    let mut stmt = conn
        .prepare(
            "SELECT date, SUM(amount_ml), COUNT(*) FROM water_entries 
             WHERE date LIKE ?1 || '%' GROUP BY date ORDER BY date",
        )
        .map_err(|e| e.to_string())?;

    let days: Vec<DailyStats> = stmt
        .query_map([&month_str], |row| {
            let date: String = row.get(0)?;
            let total_ml: i32 = row.get(1)?;
            let entries_count: i32 = row.get(2)?;
            let percentage = if goal_ml > 0 {
                (total_ml as f32 / goal_ml as f32) * 100.0
            } else {
                0.0
            };
            Ok(DailyStats {
                date,
                total_ml,
                goal_ml,
                entries_count,
                percentage,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total_ml: i32 = days.iter().map(|d| d.total_ml).sum();
    let days_with_data = days.len() as f32;
    let average_ml = if days_with_data > 0.0 {
        total_ml as f32 / days_with_data
    } else {
        0.0
    };
    let days_goal_met = days.iter().filter(|d| d.total_ml >= goal_ml).count() as i32;

    // Calculate streaks
    let (current_streak, best_streak) = calculate_streaks(&conn, goal_ml);

    let month_name = match month {
        1 => "January", 2 => "February", 3 => "March", 4 => "April",
        5 => "May", 6 => "June", 7 => "July", 8 => "August",
        9 => "September", 10 => "October", 11 => "November", 12 => "December",
        _ => "Unknown",
    };

    Ok(MonthlyStats {
        month: month_name.to_string(),
        year,
        days,
        total_ml,
        average_ml,
        days_goal_met,
        current_streak,
        best_streak,
    })
}

fn calculate_streaks(conn: &Connection, goal_ml: i32) -> (i32, i32) {
    let mut stmt = match conn.prepare(
        "SELECT date, SUM(amount_ml) as total FROM water_entries 
         GROUP BY date ORDER BY date DESC",
    ) {
        Ok(s) => s,
        Err(_) => return (0, 0),
    };

    let results: Vec<(String, i32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .ok()
        .map(|iter| iter.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    let today = Local::now().date_naive();
    let mut current_streak = 0;
    let mut best_streak = 0;
    let mut temp_streak = 0;
    let mut checking_current = true;

    for (i, (date_str, total)) in results.iter().enumerate() {
        if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            let expected_date = today - chrono::Duration::days(i as i64);
            
            if date == expected_date && *total >= goal_ml {
                temp_streak += 1;
                if checking_current {
                    current_streak = temp_streak;
                }
            } else if date == expected_date {
                checking_current = false;
                best_streak = best_streak.max(temp_streak);
                temp_streak = 0;
            } else {
                best_streak = best_streak.max(temp_streak);
                break;
            }
        }
    }

    best_streak = best_streak.max(temp_streak);
    (current_streak, best_streak)
}

#[tauri::command]
fn get_settings(db: State<Database>) -> Result<Settings, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    conn.query_row(
        "SELECT daily_goal_ml, reminder_interval_minutes, reminder_enabled, 
                sound_enabled, start_with_system, theme FROM settings WHERE id = 1",
        [],
        |row| {
            Ok(Settings {
                daily_goal_ml: row.get(0)?,
                reminder_interval_minutes: row.get(1)?,
                reminder_enabled: row.get::<_, i32>(2)? != 0,
                sound_enabled: row.get::<_, i32>(3)? != 0,
                start_with_system: row.get::<_, i32>(4)? != 0,
                theme: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(db: State<Database>, settings: Settings) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE settings SET 
            daily_goal_ml = ?1,
            reminder_interval_minutes = ?2,
            reminder_enabled = ?3,
            sound_enabled = ?4,
            start_with_system = ?5,
            theme = ?6
         WHERE id = 1",
        [
            &settings.daily_goal_ml.to_string(),
            &settings.reminder_interval_minutes.to_string(),
            &(settings.reminder_enabled as i32).to_string(),
            &(settings.sound_enabled as i32).to_string(),
            &(settings.start_with_system as i32).to_string(),
            &settings.theme,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_yearly_overview(db: State<Database>, year: i32) -> Result<Vec<MonthlyStats>, String> {
    let mut months = Vec::new();
    for month in 1..=12 {
        if let Ok(stats) = get_monthly_stats_internal(&db, year, month) {
            months.push(stats);
        }
    }
    Ok(months)
}

fn get_monthly_stats_internal(db: &State<Database>, year: i32, month: u32) -> Result<MonthlyStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let month_str = format!("{:04}-{:02}", year, month);

    let goal_ml: i32 = conn
        .query_row("SELECT daily_goal_ml FROM settings WHERE id = 1", [], |row| {
            row.get(0)
        })
        .unwrap_or(4000);

    let mut stmt = conn
        .prepare(
            "SELECT date, SUM(amount_ml), COUNT(*) FROM water_entries 
             WHERE date LIKE ?1 || '%' GROUP BY date ORDER BY date",
        )
        .map_err(|e| e.to_string())?;

    let days: Vec<DailyStats> = stmt
        .query_map([&month_str], |row| {
            let date: String = row.get(0)?;
            let total_ml: i32 = row.get(1)?;
            let entries_count: i32 = row.get(2)?;
            let percentage = if goal_ml > 0 {
                (total_ml as f32 / goal_ml as f32) * 100.0
            } else {
                0.0
            };
            Ok(DailyStats {
                date,
                total_ml,
                goal_ml,
                entries_count,
                percentage,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total_ml: i32 = days.iter().map(|d| d.total_ml).sum();
    let days_with_data = days.len() as f32;
    let average_ml = if days_with_data > 0.0 {
        total_ml as f32 / days_with_data
    } else {
        0.0
    };
    let days_goal_met = days.iter().filter(|d| d.total_ml >= goal_ml).count() as i32;

    let month_name = match month {
        1 => "Jan", 2 => "Feb", 3 => "Mar", 4 => "Apr",
        5 => "May", 6 => "Jun", 7 => "Jul", 8 => "Aug",
        9 => "Sep", 10 => "Oct", 11 => "Nov", 12 => "Dec",
        _ => "?",
    };

    Ok(MonthlyStats {
        month: month_name.to_string(),
        year,
        days,
        total_ml,
        average_ml,
        days_goal_met,
        current_streak: 0,
        best_streak: 0,
    })
}

// Setup system tray
fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let add_250 = MenuItem::with_id(app, "add_250", "Quick Add 250ml", true, None::<&str>)?;
    let add_500 = MenuItem::with_id(app, "add_500", "Quick Add 500ml", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &add_250, &add_500, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "add_250" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("quick-add", 250);
                }
            }
            "add_500" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("quick-add", 500);
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn main() {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open database");
    init_db(&conn).expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // If another instance tries to start, focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(Database(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![
            add_water,
            remove_entry,
            get_today_stats,
            get_today_entries,
            get_monthly_stats,
            get_settings,
            save_settings,
            get_yearly_overview,
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            
            // Show window after setup
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
