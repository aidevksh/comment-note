/* =============================================================
   bridge.js — 앱 셸(Tauri)과 파일 시스템을 잇는 층

   브라우저에서 index.html 을 그냥 열면 window.__TAURI__ 가 없으므로
   이 파일은 아무것도 하지 않고, app.js 의 샘플 노트가 그대로 보인다.
   Tauri 안에서 실행되면 실제 폴더를 읽어 트리와 노트를 갈아 끼운다.
   ============================================================= */
(function(){
"use strict";

var T = window.__TAURI__;
if(!T || !T.core || !window.CommentNote) return;

var CN = window.CommentNote;
var invoke = T.core.invoke;
var openDialog = T.dialog && T.dialog.open;

var SAVE_DELAY = 700;          /* 편집이 멈춘 뒤 이만큼 있다가 저장 */
var saveTimer = null;
var loading = false;           /* 파일을 읽어 넣는 중에는 저장하지 않는다 */

function toast(m){ CN.showToast(m); }

/* ── 설정 ────────────────────────────────────────────────────── */
function readConfig(){
  return invoke("read_config").then(function(txt){
    try{ return JSON.parse(txt || "{}"); }catch(e){ return {}; }
  }).catch(function(){ return {}; });
}
function writeConfig(cfg){
  return invoke("write_config", { contents:JSON.stringify(cfg, null, 2) }).catch(function(e){
    console.error("설정을 저장하지 못했습니다:", e);
  });
}

/* ── 폴더 → 노트/트리 ────────────────────────────────────────── */
/* Rust 의 list_notes 결과(kind/name/rel/path/text/children)를
   app.js 가 쓰는 NOTES + TREE 모양으로 바꾼다. */
function adopt(root, entries){
  var notes = [], tree = [], seq = 0;

  function walk(list, out, dir){
    list.forEach(function(e){
      if(e.kind === "dir"){
        var node = { type:"dir", name:e.name, open:dir === "", children:[] };
        out.push(node);
        walk(e.children || [], node.children, dir ? dir + "\\" + e.name : e.name);
      }else{
        var id = "f" + (++seq);
        notes.push({
          id:id,
          title:e.name.replace(/\.md$/i, ""),
          file:e.name,
          path:e.path,
          date:e.modified || "",
          src:e.text || "",
          annos:[]
        });
        out.push({ type:"file", note:id });
      }
    });
  }
  walk(entries, tree, "");

  loading = true;
  CN.NOTES.length = 0;
  notes.forEach(function(n){ CN.NOTES.push(n); });
  CN.TREE.length = 0;
  tree.forEach(function(t){ CN.TREE.push(t); });
  CN.setLocation(root);
  CN.indexTree();
  if(CN.NOTES.length) CN.loadNote(CN.NOTES[0]);
  else CN.renderTree();
  loading = false;
  return notes.length;
}

function openFolder(root, quiet){
  return invoke("list_notes", { root:root }).then(function(entries){
    var n = adopt(root, entries);
    if(!quiet) toast(n ? (root + " — 노트 " + n + "개를 열었습니다.") : (root + " — 아직 .md 파일이 없습니다."));
    return writeConfig({ root:root });
  }).catch(function(e){
    toast("폴더를 읽지 못했습니다: " + e);
  });
}

/* ── 저장 ────────────────────────────────────────────────────── */
function saveNow(){
  var note = CN.currentNote();
  if(!note || !note.path) return;
  var text = CN.currentText();
  note.src = text;
  invoke("write_note", { path:note.path, contents:text }).catch(function(e){
    toast("저장하지 못했습니다: " + e);
  });
}

CN.hooks.onChange = function(force){
  if(loading) return;
  clearTimeout(saveTimer);
  if(force) saveNow();
  else saveTimer = setTimeout(saveNow, SAVE_DELAY);
};

CN.hooks.onPickFolder = function(){
  if(!openDialog){ toast("폴더 선택 창을 열 수 없습니다."); return; }
  openDialog({ directory:true, multiple:false, title:"메모를 저장할 폴더" }).then(function(picked){
    if(!picked) return;
    openFolder(picked);
  }).catch(function(e){
    toast("폴더 선택을 취소했거나 실패했습니다: " + e);
  });
};

/* ── 시작 ────────────────────────────────────────────────────── */
readConfig().then(function(cfg){
  if(cfg && cfg.root){
    return openFolder(cfg.root, true).then(function(){
      toast("저장 위치: " + cfg.root);
    });
  }
  toast("저장 위치를 아직 고르지 않았습니다. 왼쪽 위 폴더를 눌러 메모를 둘 폴더를 고르세요.");
});

window.addEventListener("beforeunload", function(){
  clearTimeout(saveTimer);
  saveNow();
});

})();
