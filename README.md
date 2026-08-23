<div align="center">

<img src="src-tauri/icons/128x128.png" width="76" height="76" alt="Comment Note">

# Comment Note

**본문을 고치지 않고, 본문에 말을 붙여 두는 메모장**

[![License](https://img.shields.io/badge/license-MIT-C98A2B?style=flat-square)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-2E2C28?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-C98A2B?style=flat-square)
![Status](https://img.shields.io/badge/status-시안%20단계-8C877F?style=flat-square)

</div>

<br>

메모장에 뭔가를 쓰다 보면 이런 줄이 섞인다. `(← 이거 나중에 고치기)` `※ 근거 약함` `TODO`.
며칠 뒤에 열어 보면 본문인지 나에게 남긴 말인지 구분이 안 된다.

**Comment Note는 그 말을 본문에서 떼어 낸다.** 구간을 선택하고 우클릭해 주석을 달면,
본문은 그대로 있고 그 구간에 표시가 남는다. 마우스를 올리면 주석이 뜨고, 하단 목록에 문서 순서대로 쌓인다.

<br>

<img src="docs/screenshot-light.png" alt="라이트 모드 — 마크다운 원문과 미리보기, 하단 주석 패널">

<details>
<summary>다크 모드</summary>

<img src="docs/screenshot-dark.png" alt="다크 모드">

</details>

<br>

## 주석

이 앱의 전부다. 나머지 기능은 이걸 받쳐 주기 위해 있다.

- **문자 단위로 붙는다** — 줄 단위가 아니라 문장 중간의 다섯 글자에도 달린다.
- **어느 화면에서 봐도 같은 구간** — 주석은 마크다운 원문의 문자 오프셋 `[start, end)` 으로 저장된다.
  마크다운 원문·미리보기·위지윅 세 화면이 같은 오프셋을 그리므로, 어디서 달아도 어디서나 같은 자리에 보인다.
  `**굵게**` 표시를 가로지르는 구간, 여러 줄에 걸친 구간, 표의 여러 셀에 걸친 구간도 어긋나지 않는다.
- **본문을 건드리지 않는다** — 주석을 달고 지워도 본문 글자는 하나도 바뀌지 않는다.
- **사라진 구간은 숨기지 않는다** — 주석이 가리키던 문장을 지우면 조용히 버리지 않고
  "본문에서 사라진 구간"으로 남겨 둔다. 지울지 옮길지는 사람이 정한다.

## 그 밖에

| | |
|---|---|
| **편집 방식 두 개** | 마크다운 원문 + 실시간 미리보기 / 위지윅. 두 방식은 서로 되돌아온다 (위지윅에서 고친 내용과 새로 단 주석이 마크다운 원문에 그대로 남는다) |
| **저장 위치를 고른다** | 폴더 하나를 열고 그 안의 `.md` 파일을 그대로 다룬다. 앱 전용 데이터베이스는 없다 |
| **폴더 트리** | 고른 폴더의 구조를 그대로 보여준다. 파일마다 주석 개수가 붙는다 |
| **이미지** | 붙여넣기(`Ctrl+V`), 드래그 앤 드롭 |
| **테마** | 라이트 / 다크 / 시스템 |

### 단축키

| 동작 | 키 |
|---|---|
| 주석 달기 | `Ctrl+Alt+M` |
| 편집 방식 전환 | `Ctrl+Alt+P` |
| 테마 전환 | `Ctrl+Alt+T` |
| 폴더 트리 접기 | `Ctrl+Alt+B` |
| 새 노트 | `Ctrl+N` |
| 저장 위치 바꾸기 | `Ctrl+Shift+O` |
| 저장 | `Ctrl+S` |

<br>

## 지금 상태

UI와 주석 엔진은 동작한다. 파일 시스템 연결은 코드만 있고 아직 실행해 보지 않았다.

- [x] 주석 엔진 — 문자 오프셋 기반, 세 화면 동기화, 고아 주석 처리
- [x] 마크다운 렌더러 (제목·목록·표·인용·코드펜스·이미지·링크)
- [x] 마크다운 ↔ 위지윅 왕복
- [x] 폴더 트리 · 저장 위치 UI
- [x] 라이트 / 다크 / 시스템 테마
- [ ] **파일 읽기·쓰기 실제 확인** (Rust 명령은 작성됨, 빌드 미실행)
- [ ] 주석을 파일에 저장 — 아래 설계 확정 필요
- [ ] 파일 감시 (외부에서 파일이 바뀌면 갱신, 동기화 폴더 중복 이벤트 디바운스)
- [ ] 한 구간에 주석이 겹칠 때의 표시
- [ ] 편집기 코어를 ProseMirror로 교체 (지금은 `contenteditable` 직접 제어)
- [ ] 폰트 번들 (지금은 Google Fonts를 네트워크로 받는다 → 오프라인에서 대체 폰트)
- [ ] 코드 서명, 자동 업데이트
- [ ] 맥 지원

<br>

## 시작하기

### 필요한 것

| | |
|---|---|
| [Node.js](https://nodejs.org) 18+ | Tauri CLI 실행용 |
| [Rust](https://rustup.rs) 1.77+ | 앱 본체 빌드 |
| [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) | "C++를 사용한 데스크톱 개발" 워크로드 |
| WebView2 | Windows 10/11에 기본 탑재 |

```bash
npm install
npm run dev      # 개발 모드로 앱 실행
npm run build    # 설치 파일 만들기 (src-tauri/target/release/bundle/nsis)
```

### UI만 먼저 보고 싶다면

Rust 없이도 화면은 볼 수 있다. 프론트엔드가 정적 파일이라 브라우저로 바로 열린다.

```
src/index.html          # 앱 화면 (샘플 노트로 동작)
mockup/index.html       # 단일 파일 시안 (설명용, 히스토리 보존)
```

브라우저에서 열면 파일 저장은 되지 않고 샘플 노트로 모든 기능을 눌러볼 수 있다.

<br>

## 구조

```
comment-note/
├─ src/                    프론트엔드 (빌드 단계 없는 정적 파일)
│  ├─ index.html
│  ├─ styles.css           디자인 토큰 + 3중 테마 (라이트/다크/시스템)
│  ├─ app.js               주석 엔진, 마크다운 렌더러, 직렬화기, UI
│  └─ bridge.js            앱 셸 연결 — 브라우저에서는 아무것도 하지 않는다
├─ src-tauri/
│  ├─ src/lib.rs           list_notes, read_note, write_note, safe_file_name, config
│  ├─ src/main.rs
│  ├─ tauri.conf.json
│  ├─ capabilities/        창에 주는 권한
│  └─ icons/
├─ mockup/index.html       단일 파일 시안
└─ docs/                   스크린샷
```

프론트엔드에 번들러가 없다. 이 단계에서 필요하지 않아서다.
편집기 코어를 ProseMirror로 옮길 때 Vite를 넣는다.

### 앱 셸과 프론트엔드의 경계

`app.js`는 브라우저에서 완결적으로 동작하고, 파일 시스템은 `window.CommentNote` 한 곳으로만 노출한다.
`bridge.js`가 그 지점을 잡아 Rust 명령에 연결한다.
그래서 UI는 브라우저에서 빠르게 확인하고, 파일 IO는 앱에서만 검증하면 된다.

<br>

## 주석을 파일에 어떻게 남길까 (설계 중)

본문과 주석은 한 파일에 둔다. 사이드카 파일로 빼면 탐색기에서 파일을 복사·이동할 때 주석이 떨어져 나간다.
**파일 하나가 곧 메모 하나여야 한다.**

문제는 위치를 무엇으로 가리키느냐다. 파일 전체 문자 오프셋은 앞부분을 고칠 때마다 전부 밀린다.
문단 id에 오프셋을 붙이는 방식이 유력하다.

```markdown
글 본문은 그대로 있다. 여기에 주석이 달려 있어도 본문은 바뀌지 않는다.

<!-- comment-note
- id: c1
  anchor: p7:12-38
  body: 근거가 약함
  at: 2026-08-23T14:02
-->
```

편집기가 없어도 파일이 그냥 읽히는 게 조건이다. 확정 전이다.

<br>

## 기술 선택

주석은 본문 위에 겹치는 표시라서, 이걸 제대로 지원하는 편집기 생태계는 웹 쪽(ProseMirror, Lexical)뿐이다.
그래서 **웹 편집기 코어 + 네이티브 셸** 조합이 정해지고, 남는 질문은 셸이었다.

| | 설치 파일 | 메모리 | 결정 |
|---|---|---|---|
| **Tauri** | 3–10MB | 낮음 | **선택** |
| Electron | 90–150MB | 높음 | 메모장인데 100MB를 넘는 건 앞뒤가 안 맞는다 |
| .NET + WebView2 | ~60MB | 낮음 | C# 팀이면 이쪽이 낫다 |

<br>

## 라이선스

[MIT](LICENSE)
