/* =============================================================
   bridge.js — 앱 셸(Tauri)과 파일 시스템을 잇는 층

   브라우저에서 index.html 을 그냥 열면 window.__TAURI__ 가 없으므로
   이 파일은 아무것도 하지 않는다. 화면만 볼 수 있다.
   Tauri 안에서 실행되면 사용자가 연 폴더들을 읽고, 편집 내용을
   그 폴더의 .md 파일에 그대로 쓴다.

   폴더는 여러 개를 동시에 열어 둔다. roots 가 그 목록이고,
   트리의 최상위 항목 하나가 그중 하나다.
   ============================================================= */
(function(){
"use strict";

var T = window.__TAURI__;
if(!T || !T.core || !window.CommentNote) return;

var CN = window.CommentNote;
var t = CN.t, errText = CN.errText;
var invoke = T.core.invoke;
var openDialog = T.dialog && T.dialog.open;
var appWindow = T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;

var SAVE_DELAY = 700;     /* 편집이 멈춘 뒤 이만큼 있다가 저장 */
var saveTimer = null;
var loading = false;      /* 파일을 읽어 넣는 중에는 저장하지 않는다 */
var config = {};
var roots = [];           /* 열어 둔 폴더의 절대 경로 */

function toast(m){ CN.showToast(m); }
/* 백엔드가 준 코드를 사람 말로 바꿔 "무엇을 하다 실패했는지" 와 함께 보여준다 */
function fail(key){
  return function(e){ toast(t(key, {detail:errText(e)})); };
}
function baseName(p){
  var s = String(p).replace(/[\\\/]+$/, "");
  var i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i < 0 ? s : s.slice(i + 1);
}
function countFiles(entries){
  var n = 0;
  (function walk(list){
    (list || []).forEach(function(e){ if(e.kind === "dir") walk(e.children); else n++; });
  })(entries);
  return n;
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
function rememberRoots(){
  config.roots = roots.slice();
  saveConfig();
}

/* ── 읽어 온 폴더들 → 노트/트리 ──────────────────────────────
   최상위 항목 하나가 열어 둔 폴더 하나다. 그 폴더와 바로 아래 폴더는
   펼친 채로 시작하고, 더 깊은 곳은 전에 펼쳐 둔 것만 펼친다. */
function adopt(loaded, keepPath){
  var notes = [], tree = [], seq = 0, openedBefore = config.openFolders || [];

  function walk(list, out, depth){
    (list || []).forEach(function(e){
      if(e.kind === "dir"){
        var node = {
          type:"dir", name:e.name, path:e.path,
          open:depth === 0 || openedBefore.indexOf(e.path) > -1,
          children:[]
        };
        out.push(node);
        walk(e.children, node.children, depth + 1);
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

  loaded.forEach(function(r){
    var node = {
      type:"dir", root:true, name:baseName(r.root), path:r.root,
      open:true, children:[]
    };
    tree.push(node);
    walk(r.entries, node.children, 0);
  });

  loading = true;
  CN.NOTES.length = 0;
  notes.forEach(function(n){ CN.NOTES.push(n); });
  CN.TREE.length = 0;
  tree.forEach(function(n){ CN.TREE.push(n); });
  CN.setRoots(roots);
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

/* 열어 둔 폴더를 모두 (다시) 읽는다. keepPath 가 있으면 그 노트를 다시 열어 준다.
   읽지 못한 폴더는 목록에서 내린다 — 옮겼거나 지운 폴더다. */
function loadAll(keepPath){
  if(!roots.length){
    CN.NOTES.length = 0;
    CN.TREE.length = 0;
    CN.setRoots([]);
    CN.indexTree();
    CN.renderTree();
    CN.loadNote(null);
    return Promise.resolve([]);
  }
  return Promise.all(roots.map(function(r){
    return invoke("list_notes", { root:r })
      .then(function(entries){ return {root:r, entries:entries}; })
      .catch(function(e){
        toast(t("err.readFolder", {detail:errText(e)}));
        return null;
      });
  })).then(function(results){
    var loaded = results.filter(Boolean);
    if(loaded.length !== roots.length){
      roots = loaded.map(function(x){ return x.root; });
      rememberRoots();
    }
    adopt(loaded, keepPath);
    return loaded;
  });
}
function reload(keepPath){
  if(!roots.length) return Promise.resolve([]);
  return loadAll(keepPath);
}
function keepOpenNote(){
  var cur = CN.currentNote();
  return cur ? cur.path : null;
}

/* ── 폴더 열기 / 닫기 ────────────────────────────────────────── */
function addRoots(list){
  var fresh = [];
  list.forEach(function(p){
    if(p && roots.indexOf(p) < 0 && fresh.indexOf(p) < 0) fresh.push(p);
  });
  if(!fresh.length){ toast(t("msg.folderAlready")); return Promise.resolve(); }

  flush();
  roots = roots.concat(fresh);
  rememberRoots();
  return loadAll(keepOpenNote()).then(function(loaded){
    var added = 0;
    loaded.forEach(function(r){ if(fresh.indexOf(r.root) > -1) added += countFiles(r.entries); });
    if(fresh.length === 1){
      toast(added ? t("msg.folderAdded", {name:baseName(fresh[0])}) : t("msg.openedEmpty"));
    }else{
      toast(CN.tn("msg.opened", added));
    }
  });
}
function closeRoot(path){
  if(roots.indexOf(path) < 0) return;
  flush();
  /* 닫는 폴더 안의 노트를 보고 있었으면 그 노트는 놓는다 */
  var cur = keepOpenNote();
  var keep = (cur && cur.indexOf(path) === 0) ? null : cur;
  roots = roots.filter(function(p){ return p !== path; });
  rememberRoots();
  loadAll(keep).then(function(){
    toast(t("msg.folderClosed", {name:baseName(path)}));
  });
}

/* ── 저장 ────────────────────────────────────────────────────── */
function saveNow(){
  var note = CN.currentNote();
  if(!note || !note.path) return;
  var text = CN.currentText();
  note.src = text;
  invoke("write_note", { path:note.path, contents:text }).catch(fail("err.save"));
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
  if(!openDialog){ toast(t("msg.noDialog")); return; }
  /* 한 번에 여러 폴더를 고를 수 있다 */
  openDialog({ directory:true, multiple:true, title:t("dlg.pickFolder") })
    .then(function(picked){
      if(!picked) return;
      addRoots(Array.isArray(picked) ? picked : [picked]);
    })
    .catch(fail("err.pickFolder"));
};

CN.hooks.onCloseFolder = closeRoot;

CN.hooks.onCreateNote = function(dir, name){
  invoke("create_note", { dir:dir, name:name })
    .then(function(newPath){
      flush();
      return reload(newPath).then(function(){ toast(t("msg.created")); });
    })
    .catch(fail("err.createNote"));
};

CN.hooks.onCreateFolder = function(dir, name){
  invoke("create_subfolder", { dir:dir, name:name })
    .then(function(newPath){
      config.openFolders = (config.openFolders || []).concat([newPath]);
      saveConfig();
      return reload(keepOpenNote());
    })
    .then(function(){ toast(t("msg.folderCreated")); })
    .catch(fail("err.createFolder"));
};

CN.hooks.onRename = function(path, newName, isDir){
  var cur = keepOpenNote();
  var wasOpen = cur === path;
  flush();
  invoke("rename_path", { path:path, newName:newName, isDir:!!isDir })
    .then(function(newPath){
      return reload(wasOpen ? newPath : cur);
    })
    .then(function(){ toast(t("msg.renamed")); })
    .catch(fail("err.rename"));
};

CN.hooks.onDelete = function(path, isDir){
  var cur = keepOpenNote();
  var wasOpen = cur === path;
  if(wasOpen){ clearTimeout(saveTimer); saveTimer = null; }   /* 지운 파일을 되쓰지 않는다 */
  invoke("delete_path", { path:path })
    .then(function(){
      return reload(wasOpen ? null : cur);
    })
    .then(function(){ toast(t("msg.trashed")); })
    .catch(fail("err.delete"));
};

CN.hooks.onReveal = function(path){
  invoke("reveal_path", { path:path }).catch(fail("err.reveal"));
};

CN.hooks.onNoteChange = function(note){
  if(!appWindow || !appWindow.setTitle) return;
  appWindow.setTitle(note ? (note.title + " — Comment Note") : "Comment Note")
    .catch(function(){});
};

/* ── 시작 ────────────────────────────────────────────────────── */
loadConfig().then(function(cfg){
  /* 예전 설정은 폴더를 하나만 기억했다 */
  roots = (cfg.roots && cfg.roots.length) ? cfg.roots.slice() : (cfg.root ? [cfg.root] : []);
  delete config.root;
  delete config.recents;
  if(!roots.length){
    saveConfig();
    toast(t("msg.pickFolderStart"));
    return;
  }
  rememberRoots();
  return loadAll(cfg.lastNote);
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
