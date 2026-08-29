(function(){
"use strict";

/* =============================================================
   Comment Note — 편집기 본체
   주석 모델: 마크다운 원문의 문자 오프셋 [start, end).
   원문 패널에서는 DOM 안의 span 이 사실상의 위치이고, 렌더할 때마다
   오프셋을 다시 읽어 온다. 미리보기와 위지윅은 그 오프셋을 마크다운
   텍스트에 경계 표시로 심은 뒤 렌더하므로 항상 같은 구간이 잡힌다.
   ============================================================= */

var $ = function(id){ return document.getElementById(id); };

/* 렌더 파이프라인에서만 쓰는 경계 문자 (사용자가 입력할 수 없는 기호) */
var M_OPEN  = String.fromCharCode(0x241E);
var M_SEP   = String.fromCharCode(0x241F);
var M_END   = String.fromCharCode(0x2400);
var RE_OPEN = new RegExp(M_OPEN + "([^" + M_SEP + "]*)" + M_SEP, "g");
var RE_END  = new RegExp(M_END, "g");
var RE_ANY  = new RegExp("[" + M_OPEN + M_SEP + M_END + "]", "g");
/* 줄머리의 블록 기호 — 주석 경계는 이 뒤로 밀어 넣는다 */
var RE_LEAD = /^[ \t]*(?:>[ \t]?)*(?:[-*+][ \t]+|\d+[.)][ \t]+|#{1,6}[ \t]+)?/;

/* ── 상태: 열어 둔 폴더와 그 안의 노트 ────────────────────────
   앱은 사용자가 고른 폴더 하나만 다룬다. 처음 실행하면 아무것도 없다.
   실제 파일 읽기/쓰기는 bridge.js 가 채운다. */
var NOTES = [];        /* {id, title, file, path, dir, src, annos:[]} */
var TREE = [];         /* {type:"dir", name, path, open, children} | {type:"file", note} */
var LOCATIONS = [];    /* 최근에 열어 본 폴더 */
var curLoc = "";       /* 지금 열어 둔 폴더. 비어 있으면 아직 고르지 않은 상태 */

/* ── refs ────────────────────────────────────────────────────── */
var src=$("src"), doc=$("doc"), paneSrc=$("paneSrc"), panePrev=$("panePrev"), divider=$("divider"),
    panes=$("panes"), srcScroll=$("srcScroll"), prevScroll=$("prevScroll"), rail=$("rail"),
    tree=$("tree"), locMenu=$("locMenu"), locPath=$("locPath"),
    shelf=$("shelf"), shelfList=$("shelfList"), shelfEmpty=$("shelfEmpty"),
    shelfCount=$("shelfCount"), menu=$("menu"), composer=$("composer"), composerText=$("composerText"),
    composerQuote=$("composerQuote"), tip=$("tip"), tipText=$("tipText"), tipMeta=$("tipMeta"),
    toast=$("toast"), drop=$("drop"), prevLabel=$("prevLabel"), prevHint=$("prevHint"),
    treeMenu=$("treeMenu"), railEmpty=$("railEmpty"), paneEmpty=$("paneEmpty"),
    namer=$("namer"), namerInput=$("namerInput"), namerTitle=$("namerTitle"), namerHint=$("namerHint");

var state = {
  note:null, mode:"md", theme:"system", text:"", activeId:null, seq:100,
  pending:null, menuSel:null, wysiwygDirty:false, suppressSync:false
};

/* 앱 셸(Tauri)이 채우는 훅. 브라우저에서 그냥 열면 비어 있고,
   파일이 필요한 동작은 안내만 하고 아무 일도 하지 않는다. */
var HOOKS = {
  onChange:null,       /* (force) 편집 내용을 파일에 쓴다 */
  onPickFolder:null,   /* 폴더 선택 창 */
  onCreateNote:null,   /* (dirPath, name) */
  onCreateFolder:null, /* (dirPath, name) */
  onRename:null,       /* (path, newName, isDir) */
  onDelete:null,       /* (path, isDir) */
  onReveal:null,       /* (path) 탐색기에서 보기 */
  onOpenFolder:null,   /* (path) 최근 목록에서 고른 폴더 열기 */
  onNoteChange:null,   /* (note) 창 제목 갱신 */
  resolveAsset:null    /* (url) 상대 경로 이미지 해석 */
};
function needsApp(){
  showToast("이 동작은 앱에서만 됩니다. 브라우저에서는 파일을 만들거나 지울 수 없습니다.");
}

/* ── 마크다운 → HTML ─────────────────────────────────────────── */
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function bare(s){ return String(s).replace(RE_OPEN,"").replace(RE_END,"").replace(RE_ANY,""); }
function assetUrl(u){
  if(HOOKS.resolveAsset){
    try{ return HOOKS.resolveAsset(u) || u; }catch(e){ return u; }
  }
  return u;
}

function inl(s){
  s = esc(s);
  var codes = [];
  s = s.replace(/`([^`]+)`/g, function(m,c){ codes.push(c); return "@@CN-CODE-"+(codes.length-1)+"@@"; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function(m,a,u){
        return '<img src="'+assetUrl(bare(u))+'" alt="'+bare(a)+'">'; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(m,t,u){
        return '<a href="'+bare(u)+'" target="_blank" rel="noopener noreferrer">'+t+'</a>'; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  s = s.replace(/@@CN-CODE-(\d+)@@/g, function(m,n){ return "<code>"+codes[+n]+"</code>"; });
  return s;
}

function renderMd(text){
  var lines = String(text).replace(/\r/g,"").split("\n");
  var out = "", para = [], i = 0, m;
  function closeP(){ if(para.length){ out += "<p>"+para.map(inl).join("<br>")+"</p>"; para = []; } }
  while(i < lines.length){
    var ln = lines[i], flat = bare(ln);
    if(/^```/.test(flat)){
      closeP(); i++;
      var body = [];
      while(i < lines.length && !/^```/.test(bare(lines[i]))){ body.push(lines[i]); i++; }
      i++;
      out += "<pre><code>" + esc(body.join("\n")) + "</code></pre>";
      continue;
    }
    if(!flat.trim()){ closeP(); i++; continue; }
    if((m = ln.match(/^(#{1,6})\s+([\s\S]*)$/))){
      closeP();
      var lv = Math.min(m[1].length, 3);
      out += "<h"+lv+">"+inl(m[2])+"</h"+lv+">"; i++; continue;
    }
    if(/^(-{3,}|\*{3,}|_{3,})\s*$/.test(flat)){ closeP(); out += "<hr>"; i++; continue; }
    if(/^>\s?/.test(flat)){
      closeP();
      var q = [];
      while(i < lines.length && /^>\s?/.test(bare(lines[i]))){ q.push(lines[i].replace(/^>\s?/,"")); i++; }
      out += "<blockquote>"+q.map(inl).join("<br>")+"</blockquote>";
      continue;
    }
    if(flat.indexOf("|") > -1 && lines[i+1] && /^[\s|:-]*-[\s|:-]*$/.test(bare(lines[i+1]))){
      closeP();
      var cells = function(row){
        return row.replace(/^\s*\|/,"").replace(/\|\s*$/,"").split("|").map(function(x){ return x.trim(); });
      };
      var head = cells(ln); i += 2;
      var rows = [];
      while(i < lines.length && bare(lines[i]).indexOf("|") > -1 && bare(lines[i]).trim()){
        rows.push(cells(lines[i])); i++;
      }
      out += '<div class="tw"><table><thead><tr>'
           + head.map(function(h){ return "<th>"+inl(h)+"</th>"; }).join("")
           + "</tr></thead><tbody>"
           + rows.map(function(r){
               return "<tr>"+r.map(function(c){ return "<td>"+inl(c)+"</td>"; }).join("")+"</tr>";
             }).join("")
           + "</tbody></table></div>";
      continue;
    }
    if(/^\s*[-*+]\s+/.test(flat)){
      closeP();
      var ui = [];
      while(i < lines.length && /^\s*[-*+]\s+/.test(bare(lines[i]))){
        ui.push(lines[i].replace(/^\s*[-*+]\s+/,"")); i++;
      }
      out += "<ul>"+ui.map(function(t){ return "<li>"+inl(t)+"</li>"; }).join("")+"</ul>";
      continue;
    }
    if(/^\s*\d+[.)]\s+/.test(flat)){
      closeP();
      var oi = [];
      while(i < lines.length && /^\s*\d+[.)]\s+/.test(bare(lines[i]))){
        oi.push(lines[i].replace(/^\s*\d+[.)]\s+/,"")); i++;
      }
      out += "<ol>"+oi.map(function(t){ return "<li>"+inl(t)+"</li>"; }).join("")+"</ol>";
      continue;
    }
    para.push(ln); i++;
  }
  closeP();
  return out;
}

/* ── 오프셋 → 렌더 결과의 주석 span ─────────────────────────── */
/* 각 주석 구간을 줄 단위로 쪼개고 줄머리 기호 뒤로 밀어 넣는다.
   그래서 경계가 블록 요소를 가로지르지 않고, "- " 같은 기호도 물지 않는다. */
function injectMarks(text, ranges){
  var ins = [];
  Object.keys(ranges).forEach(function(id){
    var r = ranges[id];
    if(!r || r.end <= r.start) return;
    var parts = text.slice(r.start, r.end).split("\n");
    var pos = r.start;
    parts.forEach(function(part){
      var lineStart = text.lastIndexOf("\n", pos - 1) + 1;
      var nl = text.indexOf("\n", lineStart);
      var lineText = text.slice(lineStart, nl < 0 ? text.length : nl);
      var s = pos, e = pos + part.length;
      if(s === lineStart){
        var lead = text.slice(lineStart).match(RE_LEAD);
        if(lead && lead[0]) s = Math.min(lineStart + lead[0].length, e);
      }
      /* 표 행이면 셀 경계에서 한 번 더 쪼갠다 — span 이 td 를 넘을 수 없다 */
      var segs = [];
      if(/^\s*\|/.test(lineText)){
        var cur = s;
        for(var k = s; k < e; k++){
          if(text.charAt(k) === "|"){
            if(k > cur) segs.push([cur, k]);
            cur = k + 1;
          }
        }
        if(e > cur) segs.push([cur, e]);
      }else{
        segs.push([s, e]);
      }
      segs.forEach(function(seg){
        var a = seg[0], b = seg[1];
        while(a < b && /\s/.test(text.charAt(a))) a++;
        while(b > a && /\s/.test(text.charAt(b-1))) b--;
        if(b > a){
          ins.push({pos:a, open:true, str:M_OPEN + id + M_SEP});
          ins.push({pos:b, open:false, str:M_END});
        }
      });
      pos += part.length + 1;
    });
  });
  ins.sort(function(a,b){
    if(b.pos !== a.pos) return b.pos - a.pos;
    return (a.open ? -1 : 1);
  });
  var out = text;
  ins.forEach(function(x){ out = out.slice(0, x.pos) + x.str + out.slice(x.pos); });
  return out;
}
function renderInto(target, text, ranges){
  var html = renderMd(injectMarks(text, ranges));
  html = html.replace(RE_OPEN, '<span class="anno" data-anno="$1">').replace(RE_END, "</span>");
  html = html.replace(RE_ANY, "");
  target.innerHTML = html;
}

/* ── 원문 패널 읽기 / 쓰기 ──────────────────────────────────── */
/* 원문 DOM 을 훑어 텍스트와 주석 오프셋을 함께 얻는다 */
function readSource(){
  var text = "", ranges = {};
  (function walk(node, annoId){
    for(var c = node.firstChild; c; c = c.nextSibling){
      if(c.nodeType === 3){
        if(annoId){
          var r = ranges[annoId];
          if(!r) ranges[annoId] = {start:text.length, end:text.length + c.nodeValue.length};
          else r.end = text.length + c.nodeValue.length;
        }
        text += c.nodeValue;
      }else if(c.nodeType === 1){
        if(c.nodeName === "BR"){ text += "\n"; continue; }
        var id = annoId;
        if(c.classList && c.classList.contains("anno")) id = c.getAttribute("data-anno");
        if(/^(DIV|P)$/.test(c.nodeName) && text && text.charAt(text.length-1) !== "\n") text += "\n";
        walk(c, id);
      }
    }
  })(src, null);
  return {text:text, ranges:ranges};
}
/* 텍스트 + 오프셋으로 원문 패널을 다시 만든다 */
function writeSource(text, ranges){
  src.textContent = text;
  var ids = Object.keys(ranges).sort(function(a,b){ return ranges[b].start - ranges[a].start; });
  ids.forEach(function(id){
    var r = ranges[id];
    if(!r) return;
    var node = null, off = 0;
    /* 텍스트 노드는 앞선 span 삽입으로 쪼개져 있을 수 있으므로 매번 찾는다 */
    var walker = document.createTreeWalker(src, NodeFilter.SHOW_TEXT, null), n;
    var start = Math.max(0, Math.min(r.start, text.length));
    var end = Math.max(start, Math.min(r.end, text.length));
    if(end <= start) return;
    var a = null, b = null;
    while((n = walker.nextNode())){
      var len = n.nodeValue.length;
      if(!a && start >= off && start < off + len) a = {node:n, off:start - off};
      if(!b && end > off && end <= off + len) b = {node:n, off:end - off};
      off += len;
      if(a && b) break;
    }
    if(!a || !b) return;
    var range = document.createRange();
    range.setStart(a.node, a.off);
    range.setEnd(b.node, b.off);
    var span = document.createElement("span");
    span.className = "anno";
    span.setAttribute("data-anno", id);
    try{ span.appendChild(range.extractContents()); range.insertNode(span); }catch(e){}
  });
  src.normalize();
}

/* ── 위지윅 DOM → 마크다운 ──────────────────────────────────── */
function serializeDoc(root){
  var out = "", ranges = {}, prefix = "";
  function emit(s){ out += s; }
  function blank(){
    if(!out) return;
    if(/\n\n$/.test(out)) return;
    emit(/\n$/.test(out) ? "\n" : "\n\n");
  }
  function record(id, start){
    var r = ranges[id];
    if(!r) ranges[id] = {start:start, end:out.length};
    else { r.start = Math.min(r.start, start); r.end = Math.max(r.end, out.length); }
  }
  function walk(node, inPre){
    for(var c = node.firstChild; c; c = c.nextSibling){
      if(c.nodeType === 3){ emit(c.nodeValue.replace(/ /g," ")); continue; }
      if(c.nodeType !== 1) continue;
      if(c.classList && c.classList.contains("anno")){
        var id = c.getAttribute("data-anno"), st = out.length;
        walk(c, inPre);
        record(id, st);
        continue;
      }
      var tag = c.nodeName;
      switch(tag){
        case "BR": emit("\n" + prefix); break;
        case "STRONG": case "B": emit("**"); walk(c, inPre); emit("**"); break;
        case "EM": case "I": emit("*"); walk(c, inPre); emit("*"); break;
        case "DEL": case "S": case "STRIKE": emit("~~"); walk(c, inPre); emit("~~"); break;
        case "MARK": emit("=="); walk(c, inPre); emit("=="); break;
        case "CODE":
          if(inPre){ walk(c, inPre); } else { emit("`"); walk(c, inPre); emit("`"); }
          break;
        case "A": emit("["); walk(c, inPre); emit("](" + (c.getAttribute("href")||"") + ")"); break;
        case "IMG": emit("![" + (c.getAttribute("alt")||"") + "](" + (c.getAttribute("src")||"") + ")"); break;
        case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
          blank();
          emit(new Array(+tag.charAt(1) + 1).join("#") + " ");
          walk(c, inPre);
          emit("\n\n");
          break;
        case "P":
          if(prefix){ walk(c, inPre); if(c.nextSibling) emit("\n" + prefix); }
          else { blank(); walk(c, inPre); emit("\n\n"); }
          break;
        case "DIV": blank(); walk(c, inPre); emit("\n\n"); break;
        case "UL": case "OL": {
          blank();
          var n = 1;
          for(var li = c.firstChild; li; li = li.nextSibling){
            if(li.nodeType !== 1 || li.nodeName !== "LI") continue;
            emit(tag === "OL" ? (n++) + ". " : "- ");
            walk(li, inPre);
            emit("\n");
          }
          emit("\n");
          break;
        }
        case "BLOCKQUOTE": {
          blank();
          var keep = prefix;
          prefix = "> ";
          emit("> ");
          walk(c, inPre);
          prefix = keep;
          emit("\n\n");
          break;
        }
        case "PRE":
          blank();
          emit("```\n");
          walk(c, true);
          if(!/\n$/.test(out)) emit("\n");
          emit("```\n\n");
          break;
        case "HR": blank(); emit("---\n\n"); break;
        case "TABLE": {
          blank();
          var rows = c.querySelectorAll("tr");
          Array.prototype.forEach.call(rows, function(tr, ri){
            emit("|");
            Array.prototype.forEach.call(tr.children, function(cell){
              emit(" "); walk(cell, inPre); emit(" |");
            });
            emit("\n");
            if(ri === 0){
              emit("|");
              Array.prototype.forEach.call(tr.children, function(){ emit(" --- |"); });
              emit("\n");
            }
          });
          emit("\n");
          break;
        }
        default: walk(c, inPre);
      }
    }
  }
  walk(root, false);
  out = out.replace(/[\s]+$/, "") + "\n";   /* 끝만 다듬는다 — 앞을 건드리면 오프셋이 밀린다 */
  return {text:out, ranges:ranges};
}

/* ── 주석 목록 ───────────────────────────────────────────────── */
function annoById(id){
  var hit = null;
  state.note.annos.forEach(function(a){ if(a.id === id) hit = a; });
  return hit;
}
function rangesOf(note){
  var r = {};
  note.annos.forEach(function(a){
    if(!a.gone && typeof a.start === "number") r[a.id] = {start:a.start, end:a.end};
  });
  return r;
}
/* 원문(또는 위지윅) 상태를 읽어 오프셋·인용문·순서를 갱신한다 */
function syncFrom(surface){
  var got = (surface === doc) ? serializeDoc(doc) : readSource();
  state.text = got.text;
  state.note.src = got.text;
  state.note.annos.forEach(function(a){
    var r = got.ranges[a.id];
    if(r && r.end > r.start){
      a.start = r.start; a.end = r.end; a.gone = false;
      a.text = got.text.slice(r.start, r.end).replace(/\s+/g," ").trim();
    }else{
      a.gone = true;
    }
  });
  state.note.annos.sort(function(x,y){
    if(x.gone !== y.gone) return x.gone ? 1 : -1;
    return (x.start||0) - (y.start||0);
  });
}
function renderShelf(){
  var list = state.note.annos;
  shelfList.innerHTML = "";
  list.forEach(function(a, idx){
    var card = document.createElement("div");
    card.className = "acard" + (state.activeId === a.id ? " active" : "") + (a.gone ? " gone" : "");
    card.setAttribute("data-anno-card", a.id);
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");

    var num = document.createElement("div");
    num.className = "num";
    num.textContent = a.gone ? "–" : (idx + 1);

    var mid = document.createElement("div");
    var q = document.createElement("div"); q.className = "quote"; q.textContent = a.text || "";
    var c = document.createElement("div"); c.className = "cmt"; c.textContent = a.comment;
    var meta = document.createElement("div"); meta.className = "meta";
    var who = document.createElement("span"); who.textContent = "나";
    var when = document.createElement("span"); when.textContent = a.at;
    meta.appendChild(who); meta.appendChild(when);
    if(a.gone){
      var tagGone = document.createElement("span");
      tagGone.className = "tag-gone";
      tagGone.textContent = "본문에서 사라진 구간";
      meta.appendChild(tagGone);
    }
    mid.appendChild(q); mid.appendChild(c); mid.appendChild(meta);

    var del = document.createElement("button");
    del.type = "button"; del.className = "del"; del.title = "주석 삭제";
    del.setAttribute("aria-label","주석 삭제");
    del.setAttribute("data-del", a.id);
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"></path></svg>';

    card.appendChild(num); card.appendChild(mid); card.appendChild(del);
    shelfList.appendChild(card);
  });
  stampRefs();
  shelfEmpty.hidden = list.length > 0;
  shelfCount.textContent = list.length;
  $("annoCount").querySelector(".n").textContent = list.length;
  $("stAnno").textContent = "주석 " + list.length;
  renderTree();
}
/* ── 폴더 트리 ───────────────────────────────────────────────── */
var SVG_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>';
var SVG_DIR  = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z"></path></svg>';
var SVG_FILE = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>';
var SVG_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v10H9l-5 4z"></path></svg>';
var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l5 5L19 7"></path></svg>';

var DIRS = {};
function noteOf(id){
  var hit = null;
  NOTES.forEach(function(n){ if(n.id === id) hit = n; });
  return hit;
}
/* 각 노트에 폴더 경로를 매긴다 — 상태바에 보여줄 경로 */
function indexTree(){
  DIRS = {};
  var seq = 0;
  (function walk(nodes, rel, abs){
    nodes.forEach(function(node){
      if(node.type === "dir"){
        node.id = node.id || ("d" + (++seq));
        node.rel = rel.concat([node.name]).join("\\");
        node.path = node.path || (abs ? abs + "\\" + node.name : node.name);
        DIRS[node.id] = node;
        walk(node.children, rel.concat([node.name]), node.path);
      }else{
        var n = noteOf(node.note);
        if(n){
          n.dir = rel.join("\\");
          n.dirPath = abs;
        }
      }
    });
  })(TREE, [], curLoc);
}
/* 폴더를 아직 고르지 않았거나 노트가 없을 때의 화면 */
function refreshEmptyStates(){
  var noFolder = !curLoc;
  railEmpty.classList.toggle("on", noFolder || !NOTES.length);
  tree.style.display = (noFolder || !TREE.length) ? "none" : "";
  paneEmpty.classList.toggle("on", !state.note);
  $("pickBtn").textContent = noFolder ? "폴더 선택" : "다른 폴더 선택";
  railEmpty.querySelector("p").textContent = noFolder
    ? "메모를 둘 폴더를 고르면 그 안의 .md 파일이 여기 나옵니다."
    : "이 폴더에는 아직 .md 파일이 없습니다. 위의 새 노트 버튼으로 만드세요.";
}
function renderTree(){
  tree.innerHTML = "";
  (function walk(nodes, depth){
    nodes.forEach(function(node){
      if(node.type === "dir"){
        var b = document.createElement("button");
        b.type = "button";
        b.className = "row dir" + (node.open ? " open" : "");
        b.style.paddingLeft = (8 + depth * 13) + "px";
        b.setAttribute("data-dir", node.id);
        b.setAttribute("aria-expanded", String(!!node.open));
        b.innerHTML = SVG_CHEV + SVG_DIR;
        var nm = document.createElement("span");
        nm.className = "nm"; nm.textContent = node.name;
        var cnt = document.createElement("span");
        cnt.className = "cnt"; cnt.textContent = node.children.length;
        b.appendChild(nm); b.appendChild(cnt);
        tree.appendChild(b);
        if(node.open) walk(node.children, depth + 1);
      }else{
        var n = noteOf(node.note);
        if(!n) return;
        var f = document.createElement("button");
        f.type = "button";
        f.className = "row file";
        f.style.paddingLeft = (8 + depth * 13 + 17) + "px";
        f.setAttribute("data-note", n.id);
        f.setAttribute("aria-current", n === state.note ? "true" : "false");
        f.innerHTML = SVG_FILE;
        var nm2 = document.createElement("span");
        nm2.className = "nm";
        nm2.textContent = (n.file || n.title).replace(/\.md$/, "");
        var ext = document.createElement("span");
        ext.className = "ext"; ext.textContent = ".md";
        nm2.appendChild(ext);
        f.appendChild(nm2);
        if(n.annos.length){
          var an = document.createElement("span");
          an.className = "an";
          an.title = "주석 " + n.annos.length + "개";
          an.innerHTML = SVG_MARK;
          var num = document.createElement("span");
          num.textContent = n.annos.length;
          an.appendChild(num);
          f.appendChild(an);
        }
        tree.appendChild(f);
      }
    });
  })(TREE, 0);
}
/* 각주 번호를 매긴다. 하단 목록의 카드 번호와 같은 숫자다.
   한 주석이 여러 줄이나 여러 셀에 걸쳐 있으면 마지막 조각에만 붙인다. */
function stampRefs(){
  var order = {};
  state.note.annos.forEach(function(a, i){
    if(!a.gone) order[a.id] = i + 1;
  });
  [src, doc].forEach(function(root){
    [].forEach.call(root.querySelectorAll(".anno[data-n]"), function(el){
      el.removeAttribute("data-n");
    });
    Object.keys(order).forEach(function(id){
      var els = root.querySelectorAll('[data-anno="' + id + '"]');
      if(els.length) els[els.length - 1].setAttribute("data-n", order[id]);
    });
  });
}
function updatePath(){
  var n = state.note;
  if(!n){ $("stPath").textContent = ""; return; }
  var rel = (n.dir ? n.dir + "\\" : "") + (n.file || n.title + ".md");
  $("stPath").textContent = rel;
  $("stPath").title = n.path || (curLoc ? curLoc + "\\" + rel : rel);
}

/* ── 저장 위치 고르기 ────────────────────────────────────────── */
function renderLocMenu(){
  locMenu.innerHTML = "";
  LOCATIONS.forEach(function(p){
    var b = document.createElement("button");
    b.type = "button"; b.setAttribute("role","menuitem");
    b.setAttribute("data-loc", p);
    b.innerHTML = (p === curLoc) ? SVG_CHECK : '<span style="width:14px;flex:0 0 14px"></span>';
    var s = document.createElement("span");
    s.style.fontFamily = "var(--font-mono)";
    s.style.fontSize = "11px";
    s.textContent = p;
    b.appendChild(s);
    locMenu.appendChild(b);
  });
  locMenu.appendChild(document.createElement("hr"));
  var pick = document.createElement("button");
  pick.type = "button"; pick.className = "primary"; pick.setAttribute("role","menuitem");
  pick.setAttribute("data-loc","__pick__");
  pick.innerHTML = SVG_DIR;
  pick.appendChild(document.createTextNode("다른 폴더 선택…"));
  locMenu.appendChild(pick);
}
function openLocMenu(){
  renderLocMenu();
  locMenu.classList.add("open");
  var r = $("locBtn").getBoundingClientRect();
  var p = clampInto(locMenu, r.left, r.bottom + 4);
  locMenu.style.left = p.x + "px";
  locMenu.style.top = p.y + "px";
}
function closeLocMenu(){ locMenu.classList.remove("open"); }
function updateStatus(){
  var t = state.text || "";
  $("stChars").textContent = t.replace(/\s/g,"").length + "자";
  $("stWords").textContent = (t.trim() ? t.trim().split(/\s+/).length : 0) + "단어";
  $("stLines").textContent = t.split("\n").length + "줄";
  $("stMode").textContent = state.mode === "wysiwyg" ? "WYSIWYG" : "Markdown";
}
/* 상태바의 저장 표시. 실제로 파일에 쓸 수 있을 때만 시각을 찍는다. */
function setSaved(text, idle){
  $("stSaved").textContent = text;
  $("stSaved").parentNode.classList.toggle("idle", !!idle);
}
function stampSaved(){
  var n = state.note;
  if(!n) return;
  if(!n.path || !HOOKS.onChange){
    setSaved("저장되지 않음", true);
    return;
  }
  var d = new Date(), h = d.getHours(), mm = ("0"+d.getMinutes()).slice(-2);
  var ap = h < 12 ? "오전" : "오후", h12 = (h % 12 === 0) ? 12 : h % 12;
  setSaved("저장됨 " + ap + " " + h12 + ":" + mm, false);
}
function markSaved(force){
  if(HOOKS.onChange){ try{ HOOKS.onChange(!!force); }catch(e){} }
  stampSaved();
}

/* 원문 편집 후: 오프셋 갱신 → 미리보기 재렌더 */
var syncTimer = null;
function scheduleSync(){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function(){
    syncFrom(src);
    renderInto(doc, state.text, rangesOf(state.note));
    renderShelf();
    updateStatus();
  }, 80);
}

/* ── 노트 전환 ───────────────────────────────────────────────── */
function stash(){
  if(!state.note) return;
  if(state.mode === "wysiwyg") syncFrom(doc);
  else syncFrom(src);
}
function loadNote(note){
  if(state.note && state.note !== note) stash();
  state.note = note;
  state.activeId = null;
  state.wysiwygDirty = false;
  if(!note){
    /* 열어 둔 노트 없음 */
    state.text = "";
    src.textContent = "";
    doc.innerHTML = "";
    renderTree();
    shelfList.innerHTML = "";
    shelfEmpty.hidden = false;
    shelfCount.textContent = "0";
    $("annoCount").querySelector(".n").textContent = "0";
    $("stAnno").textContent = "주석 0";
    $("stPath").textContent = "";
    setSaved(curLoc ? "열어 둔 노트 없음" : "폴더를 고르지 않음", true);
    updateStatus();
    refreshEmptyStates();
    if(HOOKS.onNoteChange) HOOKS.onNoteChange(null);
    return;
  }
  state.text = note.src;
  writeSource(note.src, rangesOf(note));
  syncFrom(src);
  renderInto(doc, state.text, rangesOf(note));
  renderShelf();
  updateStatus();
  updatePath();
  refreshEmptyStates();
  stampSaved();
  if(HOOKS.onNoteChange) HOOKS.onNoteChange(note);
  srcScroll.scrollTop = 0;
  prevScroll.scrollTop = 0;
}

/* ── 편집 방식 ───────────────────────────────────────────────── */
var wysiwygNoted = false;
function setMode(mode){
  if(mode === state.mode) return;
  if(state.mode === "wysiwyg" && mode === "md"){
    /* 위지윅에서 고친 내용을 마크다운으로 되돌린다 (주석 오프셋 포함) */
    syncFrom(doc);
    writeSource(state.text, rangesOf(state.note));
    if(state.wysiwygDirty) showToast("위지윅에서 고친 내용을 마크다운으로 되돌렸습니다.");
    state.wysiwygDirty = false;
  }else if(state.mode === "md" && mode === "wysiwyg"){
    syncFrom(src);
  }
  state.mode = mode;
  [].forEach.call($("modeSeg").children, function(b){
    b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode));
  });
  paneSrc.classList.toggle("hide", mode === "wysiwyg");
  divider.classList.toggle("hide", mode === "wysiwyg");
  paneSrc.style.flex = ""; panePrev.style.flex = "";

  renderInto(doc, state.text, rangesOf(state.note));
  if(mode === "wysiwyg"){
    doc.setAttribute("contenteditable","true");
    prevLabel.textContent = "위지윅";
    prevHint.textContent = "본문을 그대로 편집 · 주석은 그대로 유지됩니다";
    if(!wysiwygNoted){
      wysiwygNoted = true;
      showToast("위지윅에서도 같은 구간에 주석이 잡힙니다. 여기서 새로 달아도 마크다운 원문에 그대로 남습니다.");
    }
  }else{
    doc.removeAttribute("contenteditable");
    prevLabel.textContent = "미리보기";
    prevHint.textContent = "";
  }
  renderShelf();
  updateStatus();
}

/* ── 테마 ────────────────────────────────────────────────────── */
function setTheme(t, remember){
  if(t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  [].forEach.call($("themeSeg").children, function(b){
    b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-set") === t));
  });
  state.theme = t;
  if(remember){ try{ localStorage.setItem("cn-theme", t); }catch(e){} }
}
function initTheme(){
  var saved = null;
  try{ saved = localStorage.getItem("cn-theme"); }catch(e){}
  if(!saved) saved = document.documentElement.getAttribute("data-theme") || "system";
  setTheme(saved, false);
}

/* ── 토스트 ──────────────────────────────────────────────────── */
var toastTimer = null;
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toast.classList.remove("open"); }, 4600);
}

/* ── 선택 영역 ───────────────────────────────────────────────── */
function surfaceOf(node){
  while(node && node !== document){
    if(node === src) return src;
    if(node === doc) return doc;
    node = node.parentNode;
  }
  return null;
}
/* 선택 구간을 마크다운 원문 오프셋으로 바꾼다 */
function offsetsFromSelection(range, surface){
  if(surface === src){
    var pre = document.createRange();
    pre.selectNodeContents(src);
    pre.setEnd(range.startContainer, range.startOffset);
    var start = measure(pre);
    pre.setEnd(range.endContainer, range.endOffset);
    var end = measure(pre);
    return {start:start, end:end};
  }
  /* 미리보기(읽기 전용)에서 고른 구간 — 렌더 텍스트를 원문에서 되짚는다 */
  var needle = range.toString().replace(/\s+/g," ").trim();
  if(!needle) return null;
  var before = document.createRange();
  before.selectNodeContents(doc);
  before.setEnd(range.startContainer, range.startOffset);
  var occ = countOcc(before.toString().replace(/\s+/g," "), needle);
  return looseFind(state.text, needle, occ);
}
function measure(range){
  /* BR 은 줄바꿈 한 글자로 센다 */
  var frag = range.cloneContents();
  var box = document.createElement("div");
  box.appendChild(frag);
  var t = "";
  (function walk(node){
    for(var c = node.firstChild; c; c = c.nextSibling){
      if(c.nodeType === 3) t += c.nodeValue;
      else if(c.nodeType === 1){
        if(c.nodeName === "BR"){ t += "\n"; }
        else{
          if(/^(DIV|P)$/.test(c.nodeName) && t && t.charAt(t.length-1) !== "\n") t += "\n";
          walk(c);
        }
      }
    }
  })(box);
  return t.length;
}
function countOcc(hay, needle){
  var n = 0, i = 0;
  while((i = hay.indexOf(needle, i)) > -1){ n++; i += needle.length; }
  return n;
}
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
/* 마크다운 기호와 줄바꿈을 건너뛰며 찾는다 */
function looseFind(text, needle, occ){
  var chars = needle.split("").filter(function(ch){ return !/\s/.test(ch); });
  if(!chars.length) return null;
  var pattern = chars.map(escRe).join("[\\s*`_~=\\[\\]()>#-]*");
  var re;
  try{ re = new RegExp(pattern, "g"); }catch(e){ return null; }
  var m, hit = null, seen = 0;
  while((m = re.exec(text))){
    if(seen === occ){ hit = m; break; }
    seen++;
    hit = m;
    re.lastIndex = m.index + 1;
  }
  if(!hit) return null;
  return {start:hit.index, end:hit.index + hit[0].length};
}
function currentSelection(){
  var sel = window.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  var range = sel.getRangeAt(0);
  var surface = surfaceOf(range.commonAncestorContainer);
  if(!surface) return null;
  var label = range.toString().replace(/\s+/g," ").trim();
  if(!label) return null;
  return {range:range.cloneRange(), label:label, rect:range.getBoundingClientRect(), surface:surface};
}

/* ── 컨텍스트 메뉴 ───────────────────────────────────────────── */
function clampInto(el, x, y){
  var w = el.offsetWidth, h = el.offsetHeight;
  return {
    x:Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y:Math.max(8, Math.min(y, window.innerHeight - h - 8))
  };
}
function openMenu(x, y, sel){
  state.menuSel = sel;
  [].forEach.call(menu.querySelectorAll("button"), function(b){
    var act = b.getAttribute("data-act");
    if(act === "paste") b.disabled = true;
    else if(act === "link") b.disabled = !sel || sel.surface !== src && state.mode !== "wysiwyg";
    else b.disabled = !sel;
  });
  menu.classList.add("open");
  var p = clampInto(menu, x, y);
  menu.style.left = p.x + "px";
  menu.style.top = p.y + "px";
}
function closeMenu(){ menu.classList.remove("open"); }

/* ── 주석 작성 ───────────────────────────────────────────────── */
function openComposer(sel){
  var quote = sel.label;
  if(state.mode === "wysiwyg"){
    /* 위지윅에서는 구간을 먼저 감싸고, 마크다운으로 되돌릴 때 정확한 오프셋을 얻는다 */
    state.pending = {defer:true, range:sel.range};
  }else{
    var off = offsetsFromSelection(sel.range, sel.surface);
    if(!off || off.end <= off.start){
      showToast("이 구간을 마크다운 원문에서 찾지 못했습니다. 원문 패널에서 다시 선택해 보세요.");
      return;
    }
    state.pending = {start:off.start, end:off.end};
    quote = state.text.slice(off.start, off.end).replace(/\s+/g," ").trim();
  }
  composerQuote.textContent = quote;
  composerText.value = "";
  composer.classList.add("open");
  var p = clampInto(composer, sel.rect.left, sel.rect.bottom + 8);
  composer.style.left = p.x + "px";
  composer.style.top = p.y + "px";
  composerText.focus();
}
function closeComposer(){
  composer.classList.remove("open");
  state.pending = null;
}
function saveAnnotation(){
  var body = composerText.value.trim();
  if(!body){ composerText.focus(); return; }
  var p = state.pending;
  if(!p){ closeComposer(); return; }
  var id = "u" + (state.seq++);
  var d = new Date(), h = d.getHours(), mm = ("0"+d.getMinutes()).slice(-2);
  var start, end;

  if(p.defer){
    var span = document.createElement("span");
    span.className = "anno";
    span.setAttribute("data-anno", id);
    try{
      span.appendChild(p.range.extractContents());
      p.range.insertNode(span);
    }catch(e){
      showToast("이 구간에는 주석을 달 수 없습니다. 선택 범위를 조금 줄여 보세요.");
      closeComposer();
      return;
    }
    var got = serializeDoc(doc);
    if(!got.ranges[id]){
      showToast("이 구간을 마크다운으로 되돌리지 못했습니다.");
      closeComposer();
      return;
    }
    state.text = got.text;
    state.note.src = got.text;
    start = got.ranges[id].start;
    end = got.ranges[id].end;
  }else{
    start = p.start;
    end = p.end;
  }

  state.note.annos.push({
    id:id, start:start, end:end, comment:body,
    text:state.text.slice(start, end).replace(/\s+/g," ").trim(),
    at:"오늘 " + ("0"+h).slice(-2) + ":" + mm
  });
  state.activeId = id;
  window.getSelection().removeAllRanges();
  closeComposer();

  /* 오프셋이 진짜니까 그 오프셋으로 양쪽 패널을 맞춘다 */
  var ranges = rangesOf(state.note);
  if(state.mode === "wysiwyg"){
    syncFrom(doc);            /* 스팬이 이미 DOM 에 있으니 다시 그리지 않는다 */
  }else{
    writeSource(state.text, ranges);
    renderInto(doc, state.text, ranges);
    syncFrom(src);
  }
  renderShelf();
  shelf.classList.remove("collapsed");
  $("shelfToggle").setAttribute("aria-expanded","true");
  $("shelfToggleLabel").textContent = "접기";
  markSaved();
  focusAnno(id, true);
}

/* ── 툴팁 ────────────────────────────────────────────────────── */
function showTip(el){
  var a = annoById(el.getAttribute("data-anno"));
  if(!a) return;
  tipText.textContent = a.comment;
  tipMeta.innerHTML = "";
  var who = document.createElement("span"); who.textContent = "나";
  var when = document.createElement("span"); when.textContent = a.at;
  tipMeta.appendChild(who); tipMeta.appendChild(when);
  tip.classList.add("open");
  var r = el.getBoundingClientRect();
  var top = r.top - tip.offsetHeight - 8;
  if(top < 8) top = r.bottom + 8;
  var p = clampInto(tip, r.left, top);
  tip.style.left = p.x + "px";
  tip.style.top = p.y + "px";
}
function hideTip(){ tip.classList.remove("open"); }

/* ── 주석으로 이동 ───────────────────────────────────────────── */
function scrollTo(scroller, el){
  if(!scroller || !el) return;
  var sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
  var delta = (er.top - sr.top) - (scroller.clientHeight / 2 - er.height / 2);
  state.suppressSync = true;
  scroller.scrollTop += delta;
  setTimeout(function(){ state.suppressSync = false; }, 220);
}
function focusAnno(id, quiet){
  var a = annoById(id);
  state.activeId = id;
  [].forEach.call(document.querySelectorAll(".anno"), function(el){
    el.classList.toggle("active", el.getAttribute("data-anno") === id);
  });
  var card = null;
  [].forEach.call(shelfList.children, function(c){
    var on = c.getAttribute("data-anno-card") === id;
    c.classList.toggle("active", on);
    if(on) card = c;
  });
  /* 각주 번호를 눌렀으면 아래 목록에서도 그 카드가 보여야 한다 */
  if(card){
    if(shelf.classList.contains("collapsed")){
      shelf.classList.remove("collapsed");
      $("shelfToggle").setAttribute("aria-expanded", "true");
      $("shelfToggleLabel").textContent = "접기";
    }
    var cr = card.getBoundingClientRect(), lr = shelfList.getBoundingClientRect();
    if(cr.top < lr.top || cr.bottom > lr.bottom){
      shelfList.scrollTop += (cr.top - lr.top) - 8;
    }
  }
  if(a && a.gone){
    if(!quiet) showToast("이 주석이 가리키던 구간이 본문에 없습니다. 지우거나 그대로 둘 수 있습니다.");
    return;
  }
  var inDoc = doc.querySelector('[data-anno="'+id+'"]');
  if(inDoc){
    scrollTo(prevScroll, inDoc);
    inDoc.classList.remove("flash"); void inDoc.offsetWidth; inDoc.classList.add("flash");
  }
  if(state.mode !== "wysiwyg"){
    var inSrc = src.querySelector('[data-anno="'+id+'"]');
    if(inSrc){
      scrollTo(srcScroll, inSrc);
      inSrc.classList.remove("flash"); void inSrc.offsetWidth; inSrc.classList.add("flash");
    }
  }
}
function deleteAnno(id){
  state.note.annos = state.note.annos.filter(function(a){ return a.id !== id; });
  if(state.activeId === id) state.activeId = null;
  var ranges = rangesOf(state.note);
  if(state.mode === "wysiwyg"){
    renderInto(doc, state.text, ranges);
    syncFrom(doc);
  }else{
    writeSource(state.text, ranges);
    renderInto(doc, state.text, ranges);
    syncFrom(src);
  }
  renderShelf();
  markSaved();
  showToast("주석을 지웠습니다.");
}

/* ── 서식 ────────────────────────────────────────────────────── */
function activeEditable(){ return state.mode === "wysiwyg" ? doc : src; }
function wrapSelection(mark){
  var el = activeEditable();
  el.focus();
  var sel = window.getSelection();
  var text = (sel && !sel.isCollapsed) ? sel.toString() : "";
  document.execCommand("insertText", false, mark + text + mark);
}
function applyFmt(kind){
  if(state.mode === "wysiwyg"){
    doc.focus();
    if(kind === "h1") document.execCommand("formatBlock", false, "h1");
    else if(kind === "h2") document.execCommand("formatBlock", false, "h2");
    else if(kind === "quote") document.execCommand("formatBlock", false, "blockquote");
    else if(kind === "code") document.execCommand("formatBlock", false, "pre");
    else if(kind === "ul") document.execCommand("insertUnorderedList", false, null);
    else if(kind === "bold") document.execCommand("bold", false, null);
    else if(kind === "italic") document.execCommand("italic", false, null);
    else if(kind === "link") document.execCommand("createLink", false, "https://");
    else if(kind === "image") insertImage("");
    state.wysiwygDirty = true;
    return;
  }
  switch(kind){
    case "bold": wrapSelection("**"); break;
    case "italic": wrapSelection("*"); break;
    case "code": wrapSelection("`"); break;
    case "h1": case "h2": case "ul": case "quote": {
      var mark = kind === "h1" ? "# " : kind === "h2" ? "## " : kind === "ul" ? "- " : "> ";
      src.focus();
      document.execCommand("insertText", false, mark);
      break;
    }
    case "link": {
      var sel = window.getSelection();
      var t = (sel && !sel.isCollapsed) ? sel.toString() : "링크";
      src.focus();
      document.execCommand("insertText", false, "[" + t + "](https://)");
      break;
    }
    case "image": insertImage(""); break;
  }
}
function insertImage(url){
  var el = activeEditable();
  el.focus();
  if(state.mode === "wysiwyg"){
    if(url){ document.execCommand("insertHTML", false, '<img src="'+url+'" alt="붙여넣은 이미지">'); state.wysiwygDirty = true; }
    else showToast("이미지는 붙여넣기(Ctrl+V)나 드래그로 넣어 보세요.");
    return;
  }
  document.execCommand("insertText", false, url ? "\n![붙여넣은 이미지](" + url + ")\n" : "![설명](이미지 경로)");
}

/* ── 이벤트 ──────────────────────────────────────────────────── */
src.addEventListener("input", function(){ scheduleSync(); markSaved(); });
src.addEventListener("keydown", function(e){
  if(e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey){
    e.preventDefault();
    document.execCommand("insertText", false, "\n");
  }
});
doc.addEventListener("input", function(){
  if(state.mode === "wysiwyg"){ state.wysiwygDirty = true; markSaved(); }
});

[src, doc].forEach(function(surface){
  surface.addEventListener("contextmenu", function(e){
    e.preventDefault();
    hideTip();
    closeComposer();
    openMenu(e.clientX + 2, e.clientY + 2, currentSelection());
  });
  surface.addEventListener("paste", function(e){
    var items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(var i = 0; i < items.length; i++){
      if(items[i].type && items[i].type.indexOf("image") === 0){
        var file = items[i].getAsFile();
        if(file){
          e.preventDefault();
          insertImage(URL.createObjectURL(file));
          showToast("이미지를 넣었습니다.");
          return;
        }
      }
    }
  });
});

menu.addEventListener("click", function(e){
  var b = e.target.closest("button");
  if(!b || b.disabled) return;
  var act = b.getAttribute("data-act");
  var sel = state.menuSel;
  closeMenu();
  if(act === "copy"){ document.execCommand("copy"); showToast("복사했습니다."); }
  else if(act === "cut"){ document.execCommand("cut"); scheduleSync(); }
  else if(act === "annotate" && sel){ openComposer(sel); }
  else if(act === "link"){ applyFmt("link"); }
});
document.addEventListener("mousedown", function(e){
  if(!menu.contains(e.target)) closeMenu();
  if(!locMenu.contains(e.target) && e.target.closest && !e.target.closest("#locBtn")) closeLocMenu();
  if(!treeMenu.contains(e.target)) closeTreeMenu();
  if(namer.classList.contains("open") && !namer.contains(e.target) && !treeMenu.contains(e.target)){
    closeNamer();
  }
  if(composer.classList.contains("open") && !composer.contains(e.target) && !menu.contains(e.target)){
    closeComposer();
  }
});
window.addEventListener("blur", closeMenu);

$("composerSave").addEventListener("click", saveAnnotation);
$("composerCancel").addEventListener("click", closeComposer);
composerText.addEventListener("keydown", function(e){
  if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); saveAnnotation(); }
  else if(e.key === "Escape"){ e.preventDefault(); closeComposer(); }
});

document.addEventListener("mouseover", function(e){
  var el = e.target.closest ? e.target.closest(".anno") : null;
  if(el) showTip(el);
});
document.addEventListener("mouseout", function(e){
  if(e.target.closest && e.target.closest(".anno")) hideTip();
});
document.addEventListener("click", function(e){
  var mark = e.target.closest ? e.target.closest(".anno") : null;
  if(mark){ focusAnno(mark.getAttribute("data-anno")); return; }
  var del = e.target.closest ? e.target.closest("[data-del]") : null;
  if(del){ e.stopPropagation(); deleteAnno(del.getAttribute("data-del")); return; }
  var card = e.target.closest ? e.target.closest("[data-anno-card]") : null;
  if(card){ focusAnno(card.getAttribute("data-anno-card")); return; }
  var dir = e.target.closest ? e.target.closest("[data-dir]") : null;
  if(dir){
    var d = DIRS[dir.getAttribute("data-dir")];
    if(d){ d.open = !d.open; renderTree(); }
    return;
  }
  var loc = e.target.closest ? e.target.closest("[data-loc]") : null;
  if(loc){
    var p = loc.getAttribute("data-loc");
    closeLocMenu();
    if(p === "__pick__") openPicker();
    else if(p !== curLoc){
      if(HOOKS.onOpenFolder) HOOKS.onOpenFolder(p);
      else needsApp();
    }
    return;
  }
  var note = e.target.closest ? e.target.closest("[data-note]") : null;
  if(note){
    var id = note.getAttribute("data-note");
    NOTES.forEach(function(n){ if(n.id === id) loadNote(n); });
  }
});
shelfList.addEventListener("keydown", function(e){
  var card = e.target.closest ? e.target.closest("[data-anno-card]") : null;
  if(card && (e.key === "Enter" || e.key === " ")){
    e.preventDefault();
    focusAnno(card.getAttribute("data-anno-card"));
  }
});

[].forEach.call(document.querySelectorAll("[data-fmt]"), function(b){
  b.addEventListener("click", function(){ applyFmt(b.getAttribute("data-fmt")); });
});
$("annoBtn").addEventListener("click", function(){
  var sel = currentSelection();
  if(!sel){ showToast("먼저 본문에서 주석을 달 구간을 선택하세요."); return; }
  openComposer(sel);
});
$("modeSeg").addEventListener("click", function(e){
  var b = e.target.closest("button");
  if(b) setMode(b.getAttribute("data-mode"));
});
$("themeSeg").addEventListener("click", function(e){
  var b = e.target.closest("button");
  if(b) setTheme(b.getAttribute("data-theme-set"), true);
});
$("railToggle").addEventListener("click", function(){ rail.classList.toggle("hidden"); });
function openPicker(){
  if(HOOKS.onPickFolder) HOOKS.onPickFolder();
  else showToast("폴더 선택은 앱에서만 됩니다. 브라우저에서는 화면만 볼 수 있습니다.");
}
$("locBtn").addEventListener("click", function(e){
  e.stopPropagation();
  if(locMenu.classList.contains("open")){ closeLocMenu(); return; }
  /* 최근 목록이 없으면 곧바로 폴더 선택 창으로 */
  if(!LOCATIONS.length){ openPicker(); return; }
  openLocMenu();
});

/* ── 파일/폴더 우클릭 메뉴 ───────────────────────────────────── */
var TM = [
  {act:"open",    label:"열기",            file:true,  dir:false},
  {act:"rename",  label:"이름 바꾸기",      file:true,  dir:true, key:"F2"},
  {act:"delete",  label:"삭제",            file:true,  dir:true, danger:true},
  {sep:true},
  {act:"newnote", label:"이 폴더에 새 노트", file:false, dir:true},
  {act:"newdir",  label:"이 폴더에 새 폴더", file:false, dir:true},
  {sep:true},
  {act:"reveal",  label:"탐색기에서 보기",   file:true,  dir:true},
  {act:"copypath",label:"경로 복사",        file:true,  dir:true}
];
function openTreeMenu(x, y, node, isDir){
  state.treeTarget = {node:node, isDir:isDir};
  treeMenu.innerHTML = "";
  TM.forEach(function(item){
    if(item.sep){ treeMenu.appendChild(document.createElement("hr")); return; }
    if(isDir ? !item.dir : !item.file) return;
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role","menuitem");
    b.setAttribute("data-tact", item.act);
    if(item.danger) b.style.color = "var(--danger)";
    b.appendChild(document.createTextNode(item.label));
    if(item.key){
      var k = document.createElement("span");
      k.className = "k"; k.textContent = item.key;
      b.appendChild(k);
    }
    treeMenu.appendChild(b);
  });
  treeMenu.classList.add("open");
  var p = clampInto(treeMenu, x, y);
  treeMenu.style.left = p.x + "px";
  treeMenu.style.top = p.y + "px";
}
function closeTreeMenu(){
  treeMenu.classList.remove("open");
  [].forEach.call(tree.querySelectorAll(".row.marked"), function(el){ el.classList.remove("marked"); });
}
function runTreeAction(act){
  var t = state.treeTarget;
  if(!t) return;
  var node = t.node, isDir = t.isDir;
  var path = isDir ? node.path : node.path;
  var name = isDir ? node.name : node.file;

  if(act === "open" && !isDir){ loadNote(node); return; }
  if(act === "rename"){
    askName("이름 바꾸기", name, isDir ? "폴더 이름" : "파일 이름", function(v){
      if(v === name) return;
      if(HOOKS.onRename) HOOKS.onRename(path, v, isDir);
      else needsApp();
    });
    return;
  }
  if(act === "delete"){
    confirmDelete(name, isDir, function(){
      if(HOOKS.onDelete) HOOKS.onDelete(path, isDir);
      else needsApp();
    });
    return;
  }
  if(act === "newnote"){ newNote(path); return; }
  if(act === "newdir"){ newFolder(path); return; }
  if(act === "reveal"){
    if(HOOKS.onReveal) HOOKS.onReveal(path);
    else needsApp();
    return;
  }
  if(act === "copypath"){
    copyText(path);
    return;
  }
}
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ showToast("경로를 복사했습니다."); },
      function(){ showToast("복사하지 못했습니다."); });
    return;
  }
  showToast("복사하지 못했습니다.");
}
treeMenu.addEventListener("click", function(e){
  var b = e.target.closest("button");
  if(!b) return;
  var act = b.getAttribute("data-tact");
  closeTreeMenu();
  runTreeAction(act);
});
tree.addEventListener("contextmenu", function(e){
  var row = e.target.closest ? e.target.closest(".row") : null;
  if(!row) return;
  e.preventDefault();
  closeMenu(); closeLocMenu(); hideTip();
  [].forEach.call(tree.querySelectorAll(".row.marked"), function(el){ el.classList.remove("marked"); });
  row.classList.add("marked");
  var dirId = row.getAttribute("data-dir");
  if(dirId){
    var d = DIRS[dirId];
    state.markedDir = d;
    openTreeMenu(e.clientX + 2, e.clientY + 2, d, true);
  }else{
    var n = noteOf(row.getAttribute("data-note"));
    if(!n) return;
    state.markedDir = null;
    openTreeMenu(e.clientX + 2, e.clientY + 2, n, false);
  }
});

/* ── 이름 입력 / 삭제 확인 ───────────────────────────────────── */
var namerOnOk = null;
function askName(title, initial, hint, onOk){
  namerTitle.textContent = title;
  namerInput.value = initial || "";
  namerHint.textContent = hint || "";
  namerOnOk = onOk;
  $("namerOk").textContent = "확인";
  namer.classList.add("open");
  var r = rail.getBoundingClientRect();
  var p = clampInto(namer, r.right + 8, 120);
  namer.style.left = p.x + "px";
  namer.style.top = p.y + "px";
  namerInput.focus();
  var dot = namerInput.value.lastIndexOf(".");
  namerInput.setSelectionRange(0, dot > 0 ? dot : namerInput.value.length);
}
function confirmDelete(name, isDir, onOk){
  namerTitle.textContent = (isDir ? "폴더" : "파일") + "을 휴지통으로 보냅니다";
  namerInput.value = name;
  namerInput.readOnly = true;
  namerHint.textContent = isDir ? "안에 든 파일도 함께 갑니다" : "";
  namerOnOk = function(){ onOk(); };
  $("namerOk").textContent = "삭제";
  namer.classList.add("open");
  var r = rail.getBoundingClientRect();
  var p = clampInto(namer, r.right + 8, 120);
  namer.style.left = p.x + "px";
  namer.style.top = p.y + "px";
  $("namerOk").focus();
}
function closeNamer(){
  namer.classList.remove("open");
  namerInput.readOnly = false;
  namerOnOk = null;
}
$("namerOk").addEventListener("click", function(){
  var v = namerInput.value.trim();
  var fn = namerOnOk;
  if(!namerInput.readOnly){
    if(!v){ namerInput.focus(); return; }
    if(/[\\/:*?"<>|]/.test(v)){
      showToast("이름에 \\ / : * ? \" < > | 는 쓸 수 없습니다.");
      namerInput.focus();
      return;
    }
  }
  closeNamer();
  if(fn) fn(v);
});
$("namerCancel").addEventListener("click", closeNamer);
namerInput.addEventListener("keydown", function(e){
  if(e.key === "Enter"){ e.preventDefault(); $("namerOk").click(); }
  else if(e.key === "Escape"){ e.preventDefault(); closeNamer(); }
});
/* 새 노트 / 새 폴더는 지금 고른 위치(폴더를 눌러 뒀으면 그 폴더, 아니면 최상위)에 만든다 */
function targetDir(){
  if(state.markedDir) return {path:state.markedDir.path, label:state.markedDir.rel};
  var n = state.note;
  if(n && n.dirPath) return {path:n.dirPath, label:n.dir};
  return {path:curLoc, label:""};
}
function newNote(dirPath, label){
  if(!curLoc){ showToast("먼저 메모를 둘 폴더를 고르세요."); openPicker(); return; }
  askName("새 노트", "제목 없음", "이름", function(name){
    var file = /\.(md|markdown)$/i.test(name) ? name : name + ".md";
    if(HOOKS.onCreateNote) HOOKS.onCreateNote(dirPath || curLoc, file);
    else needsApp();
  });
}
function newFolder(dirPath){
  if(!curLoc){ showToast("먼저 메모를 둘 폴더를 고르세요."); openPicker(); return; }
  askName("새 폴더", "새 폴더", "이름", function(name){
    if(HOOKS.onCreateFolder) HOOKS.onCreateFolder(dirPath || curLoc, name);
    else needsApp();
  });
}
$("newNote").addEventListener("click", function(){ var t = targetDir(); newNote(t.path, t.label); });
$("newFolder").addEventListener("click", function(){ newFolder(targetDir().path); });
$("pickBtn").addEventListener("click", function(){ openPicker(); });
$("shelfToggle").addEventListener("click", function(){
  var collapsed = shelf.classList.toggle("collapsed");
  this.setAttribute("aria-expanded", String(!collapsed));
  $("shelfToggleLabel").textContent = collapsed ? "펼치기" : "접기";
});

/* 패널 너비 */
(function(){
  var dragging = false;
  divider.addEventListener("mousedown", function(e){ dragging = true; e.preventDefault(); });
  window.addEventListener("mousemove", function(e){
    if(!dragging) return;
    var box = panes.getBoundingClientRect();
    var ratio = Math.max(0.22, Math.min(0.78, (e.clientX - box.left) / box.width));
    paneSrc.style.flex = ratio + " 1 0";
    panePrev.style.flex = (1 - ratio) + " 1 0";
  });
  window.addEventListener("mouseup", function(){ dragging = false; });
})();

/* 스크롤 동기 — 한쪽을 굴리면 다른 쪽도 같은 비율로 따라간다 */
(function(){
  var lock = null;
  function ratioOf(el){
    var span = el.scrollHeight - el.clientHeight;
    return span > 0 ? el.scrollTop / span : 0;
  }
  function follow(from, to){
    if(state.mode === "wysiwyg" || state.suppressSync) return;
    if(lock && lock !== from) return;
    lock = from;
    var span = to.scrollHeight - to.clientHeight;
    to.scrollTop = ratioOf(from) * span;
    clearTimeout(follow.t);
    follow.t = setTimeout(function(){ lock = null; }, 120);
  }
  srcScroll.addEventListener("scroll", function(){ follow(srcScroll, prevScroll); });
  prevScroll.addEventListener("scroll", function(){ follow(prevScroll, srcScroll); });
})();

/* 이미지 드래그 앤 드롭 */
var dragDepth = 0;
panes.addEventListener("dragenter", function(e){ e.preventDefault(); dragDepth++; drop.classList.add("open"); });
panes.addEventListener("dragover", function(e){ e.preventDefault(); });
panes.addEventListener("dragleave", function(){
  dragDepth--;
  if(dragDepth <= 0){ dragDepth = 0; drop.classList.remove("open"); }
});
panes.addEventListener("drop", function(e){
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove("open");
  var files = e.dataTransfer && e.dataTransfer.files;
  if(!files || !files.length) return;
  var added = 0;
  for(var i = 0; i < files.length; i++){
    if(files[i].type.indexOf("image") === 0){ insertImage(URL.createObjectURL(files[i])); added++; }
  }
  showToast(added ? "이미지 " + added + "개를 넣었습니다." : "이미지 파일만 넣을 수 있습니다.");
});
window.addEventListener("dragover", function(e){ e.preventDefault(); });
window.addEventListener("drop", function(e){ e.preventDefault(); });

/* 단축키 */
document.addEventListener("keydown", function(e){
  var ctrl = e.ctrlKey || e.metaKey;
  if(ctrl && e.altKey && e.code === "KeyM"){
    e.preventDefault();
    var sel = currentSelection();
    if(sel) openComposer(sel);
    else showToast("먼저 본문에서 주석을 달 구간을 선택하세요.");
    return;
  }
  if(ctrl && e.altKey && e.code === "KeyP"){
    e.preventDefault();
    setMode(state.mode === "md" ? "wysiwyg" : "md");
    return;
  }
  if(ctrl && e.altKey && e.code === "KeyT"){
    e.preventDefault();
    var ts = ["system","light","dark"];
    setTheme(ts[(ts.indexOf(state.theme) + 1) % 3], true);
    return;
  }
  if(ctrl && e.altKey && e.code === "KeyB"){
    e.preventDefault();
    rail.classList.toggle("hidden");
    return;
  }
  if(ctrl && e.shiftKey && e.code === "KeyO"){ e.preventDefault(); openLocMenu(); return; }
  if(ctrl && !e.altKey && !e.shiftKey && e.code === "KeyN"){ e.preventDefault(); $("newNote").click(); return; }
  if(ctrl && !e.altKey && e.code === "KeyS"){ e.preventDefault(); markSaved(true); showToast("저장했습니다."); return; }
  if(ctrl && !e.altKey && e.code === "KeyB"){ e.preventDefault(); applyFmt("bold"); return; }
  if(ctrl && !e.altKey && e.code === "KeyI"){ e.preventDefault(); applyFmt("italic"); return; }
  if(ctrl && !e.altKey && e.code === "KeyK"){ e.preventDefault(); applyFmt("link"); return; }
  if(e.code === "F2" && state.note){
    e.preventDefault();
    var n = state.note;
    askName("이름 바꾸기", n.file || n.title + ".md", "파일 이름", function(v){
      if(HOOKS.onRename) HOOKS.onRename(n.path, v, false);
      else needsApp();
    });
    return;
  }
  if(e.key === "Escape"){ closeMenu(); closeComposer(); closeTreeMenu(); closeLocMenu(); closeNamer(); hideTip(); }
});

/* ── 시작 ────────────────────────────────────────────────────── */
initTheme();
indexTree();
renderTree();
loadNote(null);      /* 폴더를 고르기 전까지는 빈 화면 */

/* ── 앱 셸과 붙는 지점 ───────────────────────────────────────
   bridge.js 가 이 객체만 보고 파일 시스템에 연결한다.
   NOTES / TREE 는 참조를 유지한 채 내용만 갈아 끼운다. */
window.CommentNote = {
  hooks:HOOKS,
  state:state,
  NOTES:NOTES,
  TREE:TREE,
  LOCATIONS:LOCATIONS,
  loadNote:loadNote,
  noteOf:noteOf,
  indexTree:indexTree,
  renderTree:renderTree,
  renderShelf:renderShelf,
  updatePath:updatePath,
  showToast:showToast,
  refreshEmptyStates:refreshEmptyStates,
  getLocation:function(){ return curLoc; },
  setLocation:function(p){
    curLoc = p || "";
    locPath.textContent = curLoc || "폴더 선택…";
    if(curLoc){
      if(LOCATIONS.indexOf(curLoc) < 0) LOCATIONS.unshift(curLoc);
      if(LOCATIONS.length > 5) LOCATIONS.length = 5;
    }
    updatePath();
    refreshEmptyStates();
  },
  setRecents:function(list){
    LOCATIONS.length = 0;
    (list || []).forEach(function(p){ if(LOCATIONS.indexOf(p) < 0) LOCATIONS.push(p); });
  },
  currentText:function(){ return state.text; },
  currentNote:function(){ return state.note; }
};

})();
