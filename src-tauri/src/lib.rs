//! Comment Note — 파일 시스템 쪽 명령
//!
//! 이 앱은 사용자가 고른 폴더 하나를 열고 그 안의 `.md` 파일을 그대로 다룬다.
//! 앱 전용 데이터베이스는 없다. 파일이 곧 메모다.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 한 번에 읽어 들이는 최대 깊이. 이보다 깊은 폴더는 접어 둔다.
const MAX_DEPTH: usize = 8;
/// 노트 하나의 상한. 이보다 큰 파일은 목록에만 두고 내용을 읽지 않는다.
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// 폴더 트리의 한 항목. `kind` 가 `"dir"` 이면 `children`, `"file"` 이면 `text` 를 본다.
#[derive(Serialize)]
pub struct Entry {
    pub kind: String,
    pub name: String,
    pub path: String,
    pub text: String,
    pub children: Vec<Entry>,
}

impl Entry {
    fn dir(name: String, path: String, children: Vec<Entry>) -> Self {
        Entry { kind: "dir".into(), name, path, text: String::new(), children }
    }
    fn file(name: String, path: String, text: String) -> Self {
        Entry { kind: "file".into(), name, path, text, children: Vec::new() }
    }
}

fn is_markdown(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"),
        None => false,
    }
}

/// 숨김 폴더와 도구가 만든 폴더는 건너뛴다.
fn is_skipped(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules" || name == "target"
}

fn walk(dir: &Path, depth: usize) -> Vec<Entry> {
    let mut dirs: Vec<Entry> = Vec::new();
    let mut files: Vec<Entry> = Vec::new();

    let read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    for item in read.flatten() {
        let path = item.path();
        let name = item.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if is_skipped(&name) || depth + 1 >= MAX_DEPTH {
                continue;
            }
            let children = walk(&path, depth + 1);
            dirs.push(Entry::dir(name, path.to_string_lossy().to_string(), children));
        } else if is_markdown(&path) {
            let small = fs::metadata(&path).map(|m| m.len() <= MAX_BYTES).unwrap_or(false);
            let text = if small {
                fs::read_to_string(&path).unwrap_or_default()
            } else {
                String::new()
            };
            files.push(Entry::file(name, path.to_string_lossy().to_string(), text));
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    dirs
}

/// 고른 폴더 안의 폴더와 `.md` 파일을 트리로 돌려준다.
#[tauri::command]
fn list_notes(root: String) -> Result<Vec<Entry>, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("폴더가 아닙니다: {}", root));
    }
    Ok(walk(&path, 0))
}

#[tauri::command]
fn read_note(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{}: {}", path, e))
}

#[tauri::command]
fn write_note(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    }
    fs::write(&path, contents).map_err(|e| format!("{}: {}", path, e))
}

#[tauri::command]
fn create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("{}: {}", path, e))
}

/// 폴더 안에 새 노트를 만든다. 같은 이름이 있으면 뒤에 숫자를 붙인다.
/// 만들어진 파일의 전체 경로를 돌려준다.
#[tauri::command]
fn create_note(dir: String, name: String) -> Result<String, String> {
    let dir_path = PathBuf::from(&dir);
    fs::create_dir_all(&dir_path).map_err(|e| format!("{}: {}", dir, e))?;

    let safe = safe_file_name(name);
    let stem = safe.trim_end_matches(".md").trim_end_matches(".markdown").to_string();
    let mut candidate = dir_path.join(format!("{}.md", stem));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir_path.join(format!("{} {}.md", stem, n));
        n += 1;
        if n > 999 {
            return Err("같은 이름의 파일이 너무 많습니다".into());
        }
    }
    let title = candidate
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("새 노트")
        .to_string();
    fs::write(&candidate, format!("# {}\n\n", title))
        .map_err(|e| format!("{}: {}", candidate.display(), e))?;
    Ok(candidate.to_string_lossy().to_string())
}

/// 폴더 안에 새 폴더를 만든다. 만들어진 폴더의 전체 경로를 돌려준다.
#[tauri::command]
fn create_subfolder(dir: String, name: String) -> Result<String, String> {
    let base = PathBuf::from(&dir);
    let safe = safe_file_name(name);
    let mut candidate = base.join(&safe);
    let mut n = 2;
    while candidate.exists() {
        candidate = base.join(format!("{} {}", safe, n));
        n += 1;
        if n > 999 {
            return Err("같은 이름의 폴더가 너무 많습니다".into());
        }
    }
    fs::create_dir_all(&candidate).map_err(|e| format!("{}: {}", candidate.display(), e))?;
    Ok(candidate.to_string_lossy().to_string())
}

/// 이름을 바꾼다. 같은 폴더 안에서만 움직이고, 이미 있는 이름으로는 바꾸지 않는다.
/// 바뀐 경로를 돌려준다.
#[tauri::command]
fn rename_path(path: String, new_name: String, is_dir: bool) -> Result<String, String> {
    let from = PathBuf::from(&path);
    if !from.exists() {
        return Err(format!("찾을 수 없습니다: {}", path));
    }
    let parent = from
        .parent()
        .ok_or_else(|| "상위 폴더를 찾을 수 없습니다".to_string())?;

    let mut safe = safe_file_name(new_name);
    if !is_dir && !(safe.to_lowercase().ends_with(".md") || safe.to_lowercase().ends_with(".markdown"))
    {
        safe.push_str(".md");
    }
    let to = parent.join(&safe);

    // 대소문자만 바꾸는 경우는 같은 파일이므로 통과시킨다.
    let same = to
        .to_string_lossy()
        .eq_ignore_ascii_case(&from.to_string_lossy());
    if to.exists() && !same {
        return Err(format!("이미 있는 이름입니다: {}", safe));
    }
    fs::rename(&from, &to).map_err(|e| format!("{}: {}", path, e))?;
    Ok(to.to_string_lossy().to_string())
}

/// 휴지통으로 보낸다. 되돌릴 수 없는 완전 삭제는 하지 않는다.
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("찾을 수 없습니다: {}", path));
    }
    trash::delete(&p).map_err(|e| format!("휴지통으로 보내지 못했습니다: {}", e))
}

/// 탐색기에서 해당 항목을 선택한 상태로 연다.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("찾을 수 없습니다: {}", path));
    }
    // explorer 는 성공해도 0 이 아닌 값을 돌려주므로 종료 코드를 보지 않는다.
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", p.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("탐색기를 열지 못했습니다: {}", e))
}

/// 윈도우에서 파일 이름으로 쓸 수 없는 문자와 예약된 이름을 걸러 준다.
#[tauri::command]
fn safe_file_name(name: String) -> String {
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    let mut cleaned: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if (c as u32) < 0x20 => '-',
            c => c,
        })
        .collect();

    // 윈도우는 이름 끝의 점과 공백을 허용하지 않는다.
    while cleaned.ends_with('.') || cleaned.ends_with(' ') {
        cleaned.pop();
    }
    if cleaned.is_empty() {
        cleaned.push_str("새 노트");
    }

    let stem = cleaned.split('.').next().unwrap_or("").to_uppercase();
    if RESERVED.contains(&stem.as_str()) {
        cleaned.insert(0, '_');
    }
    cleaned
}

/// 설정 파일 경로.
/// exe 옆에 `config.json` 이 있으면 그것을 쓴다 (USB 에 넣어 쓰는 경우).
/// 없으면 `%APPDATA%\CommentNote\config.json`.
fn config_path() -> Result<PathBuf, String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let portable = dir.join("config.json");
            if portable.is_file() {
                return Ok(portable);
            }
        }
    }
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .map_err(|_| "APPDATA 환경 변수를 찾지 못했습니다".to_string())?;
    Ok(base.join("CommentNote").join("config.json"))
}

#[tauri::command]
fn read_config() -> Result<String, String> {
    let path = config_path()?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(_) => Ok("{}".to_string()),
    }
}

#[tauri::command]
fn write_config(contents: String) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{}: {}", parent.display(), e))?;
    }
    fs::write(&path, contents).map_err(|e| format!("{}: {}", path.display(), e))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_notes,
            read_note,
            write_note,
            create_folder,
            create_note,
            create_subfolder,
            rename_path,
            delete_path,
            reveal_path,
            safe_file_name,
            read_config,
            write_config
        ])
        .run(tauri::generate_context!())
        .expect("Comment Note 를 시작하지 못했습니다");
}
