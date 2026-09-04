/* =============================================================
   i18n.js — 한국어 / 영어 문자열

   app.js 보다 먼저 읽힌다. 화면에 박힌 글자는 index.html 의
   data-i18n* 속성이, 코드가 만드는 글자는 t() 가 담당한다.
   언어를 바꾸면 apply() 로 정적 부분을 다시 칠하고, 등록된
   리스너가 동적으로 그린 부분을 다시 그린다.
   ============================================================= */
(function(){
"use strict";

var IS_MAC = /Mac|iPhone|iPad|iPod/.test(
  (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent
);

/* 파일 관리자 이름 — 메뉴 문구에 끼워 넣는다 */
function fileManager(lang){
  if(IS_MAC) return "Finder";
  return lang === "en" ? "Explorer" : "탐색기";
}

/* 단축키 표기. 맥은 기호로 붙여 쓰고 나머지는 Ctrl+Alt+M 형태로 쓴다. */
var MAC_KEY = { Ctrl:"⌘", Cmd:"⌘", Alt:"⌥", Shift:"⇧" };
function accel(spec){
  var parts = String(spec).split("+");
  if(!IS_MAC) return parts.join("+");
  return parts.map(function(p){ return MAC_KEY[p] || p; }).join("");
}

var DICT = {
ko: {
  /* 툴바 */
  "tb.rail.title":"노트 목록 ({{Ctrl+Alt+B}})",
  "tb.rail.aria":"노트 목록 접기",
  "tb.bold":"굵게 ({{Ctrl+B}})",
  "tb.italic":"기울임 ({{Ctrl+I}})",
  "tb.h1":"제목 1",
  "tb.h2":"제목 2",
  "tb.ul":"목록",
  "tb.quote":"인용",
  "tb.code":"코드",
  "tb.link":"링크 ({{Ctrl+K}})",
  "tb.image":"이미지 넣기",
  "tb.annotate":"선택 구간에 주석 달기 ({{Ctrl+Alt+M}})",
  "tb.annoCount.title":"이 노트의 주석 수",
  "tb.annoCount.label":"주석",
  "tb.edit":"편집",
  "tb.mode.aria":"편집 방식",
  "tb.mode.md":"마크다운",
  "tb.mode.md.title":"마크다운 원문 + 미리보기 ({{Ctrl+Alt+P}})",
  "tb.mode.wysiwyg":"위지윅",
  "tb.mode.wysiwyg.title":"본문을 그대로 편집 ({{Ctrl+Alt+P}})",
  "tb.theme":"테마",
  "tb.theme.aria":"테마",
  "tb.theme.system":"시스템",
  "tb.theme.system.title":"시스템 설정 따라가기 ({{Ctrl+Alt+T}})",
  "tb.theme.light":"라이트",
  "tb.theme.light.title":"라이트 모드 ({{Ctrl+Alt+T}})",
  "tb.theme.dark":"다크",
  "tb.theme.dark.title":"다크 모드 ({{Ctrl+Alt+T}})",
  "tb.lang":"언어",
  "tb.lang.aria":"언어",
  "tb.lang.ko.title":"한국어로 보기",
  "tb.lang.en.title":"Switch to English",

  /* 왼쪽 패널 */
  "rail.title":"노트",
  "rail.newNote.title":"새 노트 ({{Ctrl+N}})",
  "rail.newNote.aria":"새 노트",
  "rail.newFolder":"새 폴더",
  "rail.loc.title":"열어 둔 폴더 ({{Ctrl+Shift+O}})",
  "rail.loc.none":"폴더 선택…",
  "rail.loc.count":"폴더 {n}개",
  "rail.tree.aria":"폴더와 노트",
  "rail.empty.noFolder":"메모를 둘 폴더를 고르면 그 안의 .md 파일이 여기 나옵니다.",
  "rail.empty.noNotes":"열어 둔 폴더에 .md 파일이 없습니다. 위의 새 노트 버튼으로 만드세요.",
  "rail.pick":"폴더 선택",
  "rail.pickMore":"폴더 추가",

  /* 편집 영역 */
  "pane.md":"마크다운",
  "pane.preview":"미리보기",
  "pane.wysiwyg":"위지윅",
  "pane.wysiwyg.hint":"본문을 그대로 편집 · 주석은 그대로 유지됩니다",
  "pane.src.aria":"마크다운 편집",
  "pane.divider.aria":"패널 너비 조절",
  "pane.empty.big":"열어 둔 노트가 없습니다",
  "pane.empty.sub":"왼쪽 위 <strong>새 노트</strong>로 만들거나, 목록에서 하나를 고르세요.",
  "drop":"여기에 놓으면 이미지가 들어갑니다",

  /* 주석 목록 */
  "shelf.title":"주석",
  "shelf.collapse":"접기",
  "shelf.expand":"펼치기",
  "shelf.empty":"본문에서 구간을 선택하고 우클릭하거나 <kbd>{{Ctrl+Alt+M}}</kbd> 을 누르면 주석이 달립니다.",
  "anno.delete":"주석 삭제",
  "anno.me":"나",
  "anno.gone":"본문에서 사라진 구간",
  "anno.count":"주석 {n}개",
  "time.today":"오늘",
  "text.link":"링크",
  "text.image.alt":"붙여넣은 이미지",
  "text.image.desc":"설명",
  "text.image.path":"이미지 경로",

  /* 상태바 */
  "status.chars":"{n}자",
  "status.words":"{n}단어",
  "status.lines":"{n}줄",
  "status.anno":"주석 {n}",
  "status.saved":"저장됨 {time}",
  "status.unsaved":"저장되지 않음",
  "status.notSaved":"저장 안 함",
  "status.noNote":"열어 둔 노트 없음",
  "status.noFolder":"폴더를 고르지 않음",

  /* 본문 우클릭 메뉴 */
  "menu.aria":"편집 메뉴",
  "menu.cut":"잘라내기",
  "menu.copy":"복사",
  "menu.annotate":"주석 달기",
  "menu.link":"링크로 만들기",

  /* 파일 우클릭 메뉴 */
  "tm.aria":"파일 메뉴",
  "tm.open":"열기",
  "tm.rename":"이름 바꾸기",
  "tm.delete":"삭제",
  "tm.newnote":"이 폴더에 새 노트",
  "tm.newdir":"이 폴더에 새 폴더",
  "tm.reveal":"{app}에서 보기",
  "tm.copypath":"경로 복사",
  "tm.close":"이 폴더 닫기",

  /* 폴더 목록 메뉴 */
  "loc.aria":"열어 둔 폴더",
  "loc.add":"폴더 추가…",
  "loc.close":"이 폴더 닫기",

  /* 주석 작성 */
  "composer.aria":"주석 작성",
  "composer.ph":"이 구간에 남길 메모",
  "composer.hint":"{{Ctrl+Enter}} 저장",
  "composer.cancel":"취소",
  "composer.save":"주석 달기",

  /* 이름 입력 */
  "namer.aria":"이름 입력",
  "namer.title":"이름",
  "namer.ok":"확인",
  "namer.cancel":"취소",
  "namer.rename":"이름 바꾸기",
  "namer.fileName":"파일 이름",
  "namer.folderName":"폴더 이름",
  "namer.name":"이름",
  "namer.newNote":"새 노트",
  "namer.newFolder":"새 폴더",
  "namer.untitled":"제목 없음",
  "namer.delete.file":"파일을 휴지통으로 보냅니다",
  "namer.delete.dir":"폴더를 휴지통으로 보냅니다",
  "namer.delete.dirHint":"안에 든 파일도 함께 갑니다",
  "namer.delete.ok":"삭제",

  /* 알림 */
  "msg.needsApp":"이 동작은 앱에서만 됩니다. 브라우저에서는 파일을 만들거나 지울 수 없습니다.",
  "msg.pickInApp":"폴더 선택은 앱에서만 됩니다. 브라우저에서는 화면만 볼 수 있습니다.",
  "msg.selectFirst":"먼저 본문에서 주석을 달 구간을 선택하세요.",
  "msg.notFoundInSource":"이 구간을 마크다운 원문에서 찾지 못했습니다. 원문 패널에서 다시 선택해 보세요.",
  "msg.cannotAnnotate":"이 구간에는 주석을 달 수 없습니다. 선택 범위를 조금 줄여 보세요.",
  "msg.cannotSerialize":"이 구간을 마크다운으로 되돌리지 못했습니다.",
  "msg.annoDeleted":"주석을 지웠습니다.",
  "msg.annoGone":"이 주석이 가리키던 구간이 본문에 없습니다. 지우거나 그대로 둘 수 있습니다.",
  "msg.wysiwygBack":"위지윅에서 고친 내용을 마크다운으로 되돌렸습니다.",
  "msg.wysiwygNote":"위지윅에서도 같은 구간에 주석이 잡힙니다. 여기서 새로 달아도 마크다운 원문에 그대로 남습니다.",
  "msg.copied":"경로를 복사했습니다.",
  "msg.copyFailed":"복사하지 못했습니다.",
  "msg.copiedText":"복사했습니다.",
  "msg.saved":"저장했습니다.",
  "msg.imageInserted":"이미지를 넣었습니다.",
  "msg.imagesInserted":"이미지 {n}개를 넣었습니다.",
  "msg.onlyImages":"이미지 파일만 넣을 수 있습니다.",
  "msg.imagePasteHint":"이미지는 붙여넣기({{Ctrl+V}})나 드래그로 넣어 보세요.",
  "msg.badName":"이름에 \\ / : * ? \" < > | 는 쓸 수 없습니다.",
  "msg.pickFolderFirst":"먼저 메모를 둘 폴더를 고르세요.",
  "msg.pickFolderStart":"메모를 둘 폴더를 먼저 고르세요. 왼쪽 위의 폴더 선택.",
  "msg.opened":"노트 {n}개를 열었습니다.",
  "msg.opened.one":"노트 1개를 열었습니다.",
  "msg.openedEmpty":"이 폴더에는 아직 .md 파일이 없습니다.",
  "msg.folderAdded":"폴더를 열었습니다: {name}",
  "msg.folderAlready":"이미 열려 있는 폴더입니다.",
  "msg.folderClosed":"폴더를 닫았습니다: {name}",
  "msg.created":"만들었습니다.",
  "msg.folderCreated":"폴더를 만들었습니다.",
  "msg.renamed":"이름을 바꿨습니다.",
  "msg.trashed":"휴지통으로 보냈습니다.",
  "msg.noDialog":"폴더 선택 창을 열 수 없습니다.",
  "dlg.pickFolder":"메모를 저장할 폴더",

  /* 오류 — 앞부분은 무엇을 하다 실패했는지, {detail} 은 아래 e.* 가 채운다 */
  "err.readFolder":"폴더를 읽지 못했습니다: {detail}",
  "err.save":"저장하지 못했습니다: {detail}",
  "err.createNote":"노트를 만들지 못했습니다: {detail}",
  "err.createFolder":"폴더를 만들지 못했습니다: {detail}",
  "err.rename":"이름을 바꾸지 못했습니다: {detail}",
  "err.delete":"삭제하지 못했습니다: {detail}",
  "err.reveal":"{app}에서 열지 못했습니다: {detail}",
  "err.pickFolder":"폴더를 고르지 못했습니다: {detail}",

  "e.not-a-dir":"폴더가 아닙니다: {0}",
  "e.not-found":"찾을 수 없습니다: {0}",
  "e.name-taken":"이미 있는 이름입니다: {0}",
  "e.too-many-files":"같은 이름의 파일이 너무 많습니다",
  "e.too-many-dirs":"같은 이름의 폴더가 너무 많습니다",
  "e.no-parent":"상위 폴더를 찾을 수 없습니다",
  "e.trash":"휴지통으로 보내지 못했습니다: {0}",
  "e.reveal":"파일 관리자를 열지 못했습니다: {0}",
  "e.no-config-dir":"설정을 둘 폴더를 찾지 못했습니다",
  "e.io":"{0}"
},
en: {
  "tb.rail.title":"Note list ({{Ctrl+Alt+B}})",
  "tb.rail.aria":"Toggle note list",
  "tb.bold":"Bold ({{Ctrl+B}})",
  "tb.italic":"Italic ({{Ctrl+I}})",
  "tb.h1":"Heading 1",
  "tb.h2":"Heading 2",
  "tb.ul":"List",
  "tb.quote":"Quote",
  "tb.code":"Code",
  "tb.link":"Link ({{Ctrl+K}})",
  "tb.image":"Insert image",
  "tb.annotate":"Annotate the selection ({{Ctrl+Alt+M}})",
  "tb.annoCount.title":"Annotations in this note",
  "tb.annoCount.label":"Annotations",
  "tb.edit":"Edit",
  "tb.mode.aria":"Editing mode",
  "tb.mode.md":"Markdown",
  "tb.mode.md.title":"Markdown source + preview ({{Ctrl+Alt+P}})",
  "tb.mode.wysiwyg":"WYSIWYG",
  "tb.mode.wysiwyg.title":"Edit the text as it reads ({{Ctrl+Alt+P}})",
  "tb.theme":"Theme",
  "tb.theme.aria":"Theme",
  "tb.theme.system":"System",
  "tb.theme.system.title":"Follow the system setting ({{Ctrl+Alt+T}})",
  "tb.theme.light":"Light",
  "tb.theme.light.title":"Light mode ({{Ctrl+Alt+T}})",
  "tb.theme.dark":"Dark",
  "tb.theme.dark.title":"Dark mode ({{Ctrl+Alt+T}})",
  "tb.lang":"Language",
  "tb.lang.aria":"Language",
  "tb.lang.ko.title":"한국어로 보기",
  "tb.lang.en.title":"Switch to English",

  "rail.title":"Notes",
  "rail.newNote.title":"New note ({{Ctrl+N}})",
  "rail.newNote.aria":"New note",
  "rail.newFolder":"New folder",
  "rail.loc.title":"Open folders ({{Ctrl+Shift+O}})",
  "rail.loc.none":"Choose a folder…",
  "rail.loc.count":"{n} folders",
  "rail.loc.count.one":"1 folder",
  "rail.tree.aria":"Folders and notes",
  "rail.empty.noFolder":"Choose a folder and the .md files inside it show up here.",
  "rail.empty.noNotes":"No .md files in the open folders. Make one with the new-note button above.",
  "rail.pick":"Choose folder",
  "rail.pickMore":"Add folder",

  "pane.md":"Markdown",
  "pane.preview":"Preview",
  "pane.wysiwyg":"WYSIWYG",
  "pane.wysiwyg.hint":"Edit the text as it reads · annotations stay where they are",
  "pane.src.aria":"Edit markdown",
  "pane.divider.aria":"Resize the panes",
  "pane.empty.big":"No note is open",
  "pane.empty.sub":"Make one with <strong>New note</strong> at the top left, or pick one from the list.",
  "drop":"Drop here to insert the image",

  "shelf.title":"Annotations",
  "shelf.collapse":"Collapse",
  "shelf.expand":"Expand",
  "shelf.empty":"Select a range in the text and right-click it, or press <kbd>{{Ctrl+Alt+M}}</kbd>, to annotate.",
  "anno.delete":"Delete annotation",
  "anno.me":"Me",
  "anno.gone":"Range is gone from the text",
  "anno.count":"{n} annotations",
  "anno.count.one":"1 annotation",
  "time.today":"Today",
  "text.link":"link",
  "text.image.alt":"pasted image",
  "text.image.desc":"description",
  "text.image.path":"image path",

  "status.chars":"{n} chars",
  "status.chars.one":"1 char",
  "status.words":"{n} words",
  "status.words.one":"1 word",
  "status.lines":"{n} lines",
  "status.lines.one":"1 line",
  "status.anno":"Annotations {n}",
  "status.saved":"Saved {time}",
  "status.unsaved":"Not saved",
  "status.notSaved":"Not saved",
  "status.noNote":"No note open",
  "status.noFolder":"No folder chosen",

  "menu.aria":"Edit menu",
  "menu.cut":"Cut",
  "menu.copy":"Copy",
  "menu.annotate":"Annotate",
  "menu.link":"Make a link",

  "tm.aria":"File menu",
  "tm.open":"Open",
  "tm.rename":"Rename",
  "tm.delete":"Delete",
  "tm.newnote":"New note in this folder",
  "tm.newdir":"New folder in this folder",
  "tm.reveal":"Show in {app}",
  "tm.copypath":"Copy path",
  "tm.close":"Close this folder",

  "loc.aria":"Open folders",
  "loc.add":"Add a folder…",
  "loc.close":"Close this folder",

  "composer.aria":"Write an annotation",
  "composer.ph":"What you want to say about this range",
  "composer.hint":"{{Ctrl+Enter}} to save",
  "composer.cancel":"Cancel",
  "composer.save":"Annotate",

  "namer.aria":"Enter a name",
  "namer.title":"Name",
  "namer.ok":"OK",
  "namer.cancel":"Cancel",
  "namer.rename":"Rename",
  "namer.fileName":"File name",
  "namer.folderName":"Folder name",
  "namer.name":"Name",
  "namer.newNote":"New note",
  "namer.newFolder":"New folder",
  "namer.untitled":"Untitled",
  "namer.delete.file":"Move this file to the Trash",
  "namer.delete.dir":"Move this folder to the Trash",
  "namer.delete.dirHint":"Everything inside goes with it",
  "namer.delete.ok":"Delete",

  "msg.needsApp":"Only the app can do this. A browser can't create or delete files.",
  "msg.pickInApp":"Choosing a folder only works in the app. A browser can only show the screen.",
  "msg.selectFirst":"Select the range you want to annotate first.",
  "msg.notFoundInSource":"Couldn't find this range in the markdown source. Try selecting it in the source pane.",
  "msg.cannotAnnotate":"This range can't be annotated. Try making the selection a little smaller.",
  "msg.cannotSerialize":"Couldn't turn this range back into markdown.",
  "msg.annoDeleted":"Annotation deleted.",
  "msg.annoGone":"The range this annotation pointed at is gone. You can delete it or leave it.",
  "msg.wysiwygBack":"Your WYSIWYG edits are back in the markdown source.",
  "msg.wysiwygNote":"WYSIWYG catches the same ranges. Anything you annotate here stays in the markdown source.",
  "msg.copied":"Path copied.",
  "msg.copyFailed":"Couldn't copy.",
  "msg.copiedText":"Copied.",
  "msg.saved":"Saved.",
  "msg.imageInserted":"Image inserted.",
  "msg.imagesInserted":"Inserted {n} images.",
  "msg.imagesInserted.one":"Inserted 1 image.",
  "msg.onlyImages":"Only image files can go in.",
  "msg.imagePasteHint":"Paste ({{Ctrl+V}}) or drag an image in.",
  "msg.badName":"A name can't contain \\ / : * ? \" < > |",
  "msg.pickFolderFirst":"Choose a folder for your notes first.",
  "msg.pickFolderStart":"Choose a folder to keep your notes in — the folder button at the top left.",
  "msg.opened":"Opened {n} notes.",
  "msg.opened.one":"Opened 1 note.",
  "msg.openedEmpty":"No .md files in this folder yet.",
  "msg.folderAdded":"Opened folder: {name}",
  "msg.folderAlready":"That folder is already open.",
  "msg.folderClosed":"Closed folder: {name}",
  "msg.created":"Created.",
  "msg.folderCreated":"Folder created.",
  "msg.renamed":"Renamed.",
  "msg.trashed":"Moved to the Trash.",
  "msg.noDialog":"Can't open the folder picker.",
  "dlg.pickFolder":"Folder to keep your notes in",

  "err.readFolder":"Couldn't read the folder: {detail}",
  "err.save":"Couldn't save: {detail}",
  "err.createNote":"Couldn't make the note: {detail}",
  "err.createFolder":"Couldn't make the folder: {detail}",
  "err.rename":"Couldn't rename: {detail}",
  "err.delete":"Couldn't delete: {detail}",
  "err.reveal":"Couldn't open {app}: {detail}",
  "err.pickFolder":"Couldn't choose a folder: {detail}",

  "e.not-a-dir":"Not a folder: {0}",
  "e.not-found":"Not found: {0}",
  "e.name-taken":"That name is already taken: {0}",
  "e.too-many-files":"Too many files with that name",
  "e.too-many-dirs":"Too many folders with that name",
  "e.no-parent":"Couldn't find the parent folder",
  "e.trash":"Couldn't move it to the Trash: {0}",
  "e.reveal":"Couldn't open the file manager: {0}",
  "e.no-config-dir":"Couldn't find a folder to keep settings in",
  "e.io":"{0}"
}
};

var lang = "ko";
var listeners = [];

function raw(key){
  var table = DICT[lang] || DICT.ko;
  if(Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  if(Object.prototype.hasOwnProperty.call(DICT.ko, key)) return DICT.ko[key];
  return key;
}

/* {{Ctrl+Alt+M}} → 단축키 표기, {name} → vars.name */
function fill(s, vars){
  s = String(s).replace(/\{\{([^}]+)\}\}/g, function(m, spec){ return accel(spec); });
  if(vars){
    s = s.replace(/\{(\w+)\}/g, function(m, name){
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
    });
  }
  return s;
}

function t(key, vars){
  if(vars && vars.app === undefined) vars.app = fileManager(lang);
  return fill(raw(key), vars || {app:fileManager(lang)});
}
/* 개수에 따라 단수형이 따로 있으면 그것을 쓴다 (영어용) */
function tn(key, n, vars){
  var v = vars || {};
  v.n = n;
  var table = DICT[lang] || DICT.ko;
  if(n === 1 && Object.prototype.hasOwnProperty.call(table, key + ".one")) return t(key + ".one", v);
  return t(key, v);
}

/* 백엔드가 준 "코드|자세한 내용" 을 사람 말로 바꾼다 */
function errText(e){
  var s = (e && e.message) ? e.message : String(e == null ? "" : e);
  var cut = s.indexOf("|");
  if(cut < 0) return s;
  var code = s.slice(0, cut), detail = s.slice(cut + 1);
  var key = "e." + code;
  var table = DICT[lang] || DICT.ko;
  if(!Object.prototype.hasOwnProperty.call(table, key) &&
     !Object.prototype.hasOwnProperty.call(DICT.ko, key)) return s;
  return fill(raw(key)).replace("{0}", detail);
}

function fmtTime(ms){
  var d = new Date(ms);
  try{
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR",
      {hour:"numeric", minute:"2-digit"}).format(d);
  }catch(err){
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
}
/* 주석 카드에 찍히는 시각 — 오늘이면 "오늘 3:04" */
function fmtStamp(ms){
  var d = new Date(ms), now = new Date();
  var sameDay = d.getFullYear() === now.getFullYear() &&
                d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if(sameDay) return t("time.today") + " " + fmtTime(ms);
  try{
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR",
      {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}).format(d);
  }catch(err){ return fmtTime(ms); }
}

/* index.html 에 박힌 글자를 칠한다 */
function apply(root){
  root = root || document;
  function each(sel, fn){ [].forEach.call(root.querySelectorAll(sel), fn); }
  each("[data-i18n]", function(el){ el.textContent = t(el.getAttribute("data-i18n")); });
  each("[data-i18n-html]", function(el){ el.innerHTML = t(el.getAttribute("data-i18n-html")); });
  each("[data-i18n-title]", function(el){ el.title = t(el.getAttribute("data-i18n-title")); });
  each("[data-i18n-aria]", function(el){
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  each("[data-i18n-ph]", function(el){ el.placeholder = t(el.getAttribute("data-i18n-ph")); });
  document.documentElement.setAttribute("lang", lang);
}

function setLang(next, remember){
  if(next !== "ko" && next !== "en") next = "ko";
  lang = next;
  if(remember){ try{ localStorage.setItem("cn-lang", lang); }catch(e){} }
  apply();
  listeners.forEach(function(fn){ try{ fn(lang); }catch(e){} });
}

/* 저장된 선택이 없으면 시스템 언어를 따른다 */
function detect(){
  var saved = null;
  try{ saved = localStorage.getItem("cn-lang"); }catch(e){}
  if(saved === "ko" || saved === "en") return saved;
  var nav = (navigator.languages && navigator.languages[0]) || navigator.language || "ko";
  return /^ko/i.test(nav) ? "ko" : "en";
}

window.CNI18n = {
  t:t,
  tn:tn,
  accel:accel,
  errText:errText,
  fmtTime:fmtTime,
  fmtStamp:fmtStamp,
  apply:apply,
  setLang:setLang,
  isMac:IS_MAC,
  fileManager:function(){ return fileManager(lang); },
  get:function(){ return lang; },
  onChange:function(fn){ listeners.push(fn); },
  init:function(){ lang = detect(); apply(); return lang; }
};

})();
