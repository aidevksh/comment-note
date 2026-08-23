/* =============================================================
   bridge.js — 앱 셸(Tauri)과 파일 시스템을 잇는 층

   브라우저에서 index.html 을 그냥 열면 window.__TAURI__ 가 없으므로
   이 파일은 아무것도 하지 않는다. 화면만 볼 수 있다.
   Tauri 안에서 실행되면 사용자가 고른 폴더를 읽고, 편집 내용을
   그 폴더의 .md 파일에 그대로 쓴다.
   ============================================================= */
(function(){
"use strict";

var T = window.__TAURI__;
if(!T || !T.core || !window.CommentNote) return;

var CN = window.CommentNote;
var invoke = T.core.invoke;
var openDialog = T.dialog && T.dialog.open;
var appWindow = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;

var SAVE_DELAY = 700;     /* 편집이 멈춘 뒤 이만큼 있다가 저장 */
var saveTimer = null;
var loading = false;      /* 파일을 읽어 넣는 중에는 저장하지 않는다 */
var config = {};

function toast(m){ CN.showToast(m); }
function fail(what){
  return function(e){ toast(what + ": " + (e && e.message ? e.message : e)); };
}

/* ── 설정 ────────────────────────────────────────────────────── */
function loadConfig(){
  return invoke("read_config").then(function(txt){
    try{ config = JSON.parse(txt || "{}") || {}; }catch(e){ config = {}; }
    return config;
  }).catch(function(){ config = {}; return config; });
}
function saveConfig(){
  return invoke("write_config", { contents:JSON.stringify(config, null, 2) })
    .catch(function(e){ console.error("설정 저장 실패", e); });
}

/* ── 폴더 → 노트/트리 ────────────────────────────────────────── */
function adopt(root, entries, keepPath){
  var notes = [], tree = [], seq = 0, openedBefore = config.openFolders || [];

  function walk(list, out, depth){
    list.forEach(function(e){
      if(e.kind === "dir"){
        var node = {
          type:"dir", name:e.name, path:e.path,
          open:depth === 0 || openedBefore.indexOf(e.path) > -1,
          children:[]
        };
        out.push(node);
        walk(e.children || [], node.children, depth + 1);
      }else{
        var id = "f" + (++seq);
        notes.push({
          id:id,
          title:e.name.replace(/\.(md|markdown)$/i, ""),
          file:e.name,
          path:e.path,
          src:e.text || "",
          annos:[]
        });
        out.push({ type:"file", note:id });
      }
    });
  }
  walk(entries, tree, 0);

  loading = true;
  CN.NOTES.length = 0;
  notes.forEach(function(n){ CN.NOTES.push(n); });
  CN.TREE.length = 0;
  tree.forEach(function(t){ CN.TREE.push(t); });
  CN.setLocation(root);
  CN.indexTree();
  CN.renderTree();

  var target = null;
  if(keepPath){
    notes.forEach(function(n){ if(n.path === keepPath) target = n; });
  }
  CN.loadNote(target);       /* 못 찾으면 빈 화면 */
  loading = false;
  return notes.length;
}

/* 폴더를 (다시) 읽는다. keepPath 가 있으면 그 노트를 다시 열어 준다. */
function openFolder(root, keepPath, quiet){
  return invoke("list_notes", { root:root }).then(function(entries){
    var n = adopt(root, entries, keepPath);
    config.root = root;
    config.recents = [root].concat((config.recents || []).filter(function(p){ return p !== root; })).slice(0, 5);
    CN.setRecents(config.recents);
    saveConfig();
    if(!quiet) toast(n ? ("노트 " + n + "개를 열었습니다.") : "이 폴더에는 아직 .md 파일이 없습니다.");
    return n;
  }).catch(function(e){
    toast("폴더를 읽지 못했습니다: " + e);
  });
}
function reload(keepPath){
  var root = CN.getLocation();
  if(!root) return Promise.resolve();
  return openFolder(root, keepPath, true);
}

/* ── 저장 ────────────────────────────────────────────────────── */
function saveNow(){
  var note = CN.currentNote();
  if(!note || !note.path) return;
  var text = CN.currentText();
  note.src = text;
  invoke("write_note", { path:note.path, contents:text }).catch(fail("저장하지 못했습니다"));
}
function flush(){
  clearTimeout(saveTimer);
  saveTimer = null;
  saveNow();
}

/* ── 훅 연결 ─────────────────────────────────────────────────── */
CN.hooks.onChange = function(force){
  if(loading) return;
  clearTimeout(saveTimer);
  if(force) saveNow();
  else saveTimer = setTimeout(saveNow, SAVE_DELAY);
};

CN.hooks.onPickFolder = function(){
  if(!openDialog){ toast("폴더 선택 창을 열 수 없습니다."); return; }
  openDialog({ directory:true, multiple:false, title:"메모를 저장할 폴더" })
    .then(function(picked){
      if(!picked) return;
      flush();
      openFolder(typeof picked === "string" ? picked : picked[0]);
    })
    .catch(fail("폴더를 고르지 못했습니다"));
};

CN.hooks.onOpenFolder = function(path){
  flush();
  openFolder(path);
};

CN.hooks.onCreateNote = function(dir, name){
  invoke("create_note", { dir:dir, name:name })
    .then(function(newPath){
      flush();
      return reload(newPath).then(function(){ toast("만들었습니다."); });
    })
    .catch(fail("노트를 만들지 못했습니다"));
};

CN.hooks.onCreateFolder = function(dir, name){
  invoke("create_subfolder", { dir:dir, name:name })
    .then(function(newPath){
      config.openFolders = (config.openFolders || []).concat([newPath]);
      saveConfig();
      return reload(CN.currentNote() ? CN.currentNote().path : null);
    })
    .then(function(){ toast("폴더를 만들었습니다."); })
    .catch(fail("폴더를 만들지 못했습니다"));
};

CN.hooks.onRename = function(path, newName, isDir){
  var cur = CN.currentNote();
  var wasOpen = !!(cur && cur.path === path);
  flush();
  invoke("rename_path", { path:path, newName:newName, isDir:!!isDir })
    .then(function(newPath){
      return reload(wasOpen ? newPath : (cur ? cur.path : null));
    })
    .then(function(){ toast("이름을 바꿨습니다."); })
    .catch(fail("이름을 바꾸지 못했습니다"));
};

CN.hooks.onDelete = function(path, isDir){
  var cur = CN.currentNote();
  var wasOpen = !!(cur && cur.path === path);
  if(wasOpen){ clearTimeout(saveTimer); saveTimer = null; }   /* 지운 파일을 되쓰지 않는다 */
  invoke("delete_path", { path:path })
    .then(function(){
      return reload(wasOpen ? null : (cur ? cur.path : null));
    })
    .then(function(){ toast("휴지통으로 보냈습니다."); })
    .catch(fail("삭제하지 못했습니다"));
};

CN.hooks.onReveal = function(path){
  invoke("reveal_path", { path:path }).catch(fail("탐색기를 열지 못했습니다"));
};

CN.hooks.onNoteChange = function(note){
  if(!appWindow || !appWindow.setTitle) return;
  appWindow.setTitle(note ? (note.title + " — Comment Note") : "Comment Note")
    .catch(function(){});
};

/* ── 시작 ────────────────────────────────────────────────────── */
loadConfig().then(function(cfg){
  if(cfg.recents) CN.setRecents(cfg.recents);
  if(cfg.root){
    return openFolder(cfg.root, cfg.lastNote, true);
  }
  toast("메모를 둘 폴더를 먼저 고르세요. 왼쪽 위의 폴더 선택.");
});

/* 창을 닫기 전에 마지막 편집을 저장하고, 어디를 보고 있었는지 남긴다 */
window.addEventListener("beforeunload", function(){
  var cur = CN.currentNote();
  if(cur && cur.path){
    config.lastNote = cur.path;
    saveConfig();
  }
  flush();
});

})();
