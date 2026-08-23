// 릴리스 빌드에서 콘솔 창이 같이 뜨지 않게 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    comment_note_lib::run()
}
