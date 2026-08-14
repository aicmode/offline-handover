"use strict";

/* =========================================================
   ブラウザでの動作確認（ヘッドレス Chrome / Edge）
   ---------------------------------------------------------
   index.html を「ローカルファイル（file://）として開いた状態」で実際に描画し、
   tests/browser/*.js の検証を実行して結果を表示する。

     ・01_functions.js … 印刷枚数・定期予定・保存・移行・文章整形・検索など
     ・02_ui.js        … 実際のボタン操作（追加・整える・予定登録・検索・削除）
     ・03_print.js     … 満床に近い人数での印刷レイアウト（1ユニット＝1枚）
     ・04a/04b        … アプリ更新（旧版データの入ったPCで新しい本体を開く）
     ・05a/05b        … 再読込（閉じて開き直しても入力が残る）
     ・06_unit_move.js … 静養室への移動と、印刷構成の切り替え
     ・07_security.js  … タグ入力が実行されないこと・入力欄の保護属性・
                       壊れた保存データ・不正バックアップ・外部通信0件
     ・08a/08b        … 静養室の入力画面から直接追加・上限・閉じて開き直した後の復元
     ・11_master_width.js … 入居者一覧の部屋番号・お名前の幅（全ユニット共通）

   実行：
     node tests/browser_check.js
     node tests/browser_check.js 07                          # 一部だけ実行する場合
     CHROME="/path/to/chrome" node tests/browser_check.js   # 場所を指定する場合

   ※ 検証用の一時HTMLは OS の一時フォルダに作られ、index.html は変更しない。
   ※ ページを開く先は file:// のみ。ネットワークへは接続しない。
   ========================================================= */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "handover-check-"));

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

function findChrome(){
  for(const p of CHROME_CANDIDATES){
    try{ if(fs.existsSync(p)) return p; }catch(e){}
  }
  return null;
}

/* 実行中の通信とエラーを記録する。app 本体より前に読み込む。 */
const COLLECTOR = `<script>
window.__ERR = [];
window.addEventListener("error", function(e){ window.__ERR.push("error: " + (e.message || "?")); });
window.addEventListener("unhandledrejection", function(e){ window.__ERR.push("reject: " + e.reason); });
(function(){
  var ce = console.error, cw = console.warn;
  console.error = function(){ window.__ERR.push("console.error: " + Array.prototype.join.call(arguments, " ")); ce.apply(console, arguments); };
  console.warn  = function(){ window.__ERR.push("console.warn: "  + Array.prototype.join.call(arguments, " ")); cw.apply(console, arguments); };
})();
window.__FETCHCALLS = 0; window.__XHRCALLS = 0; window.__BEACON = 0; window.__WS = 0;
(function(){
  var of = window.fetch;
  window.fetch = function(){ window.__FETCHCALLS++; window.__ERR.push("外部通信(fetch)が呼ばれました: " + arguments[0]); return of ? of.apply(window, arguments) : Promise.reject(); };
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(){ window.__XHRCALLS++; window.__ERR.push("外部通信(XHR)が呼ばれました: " + arguments[1]); return oo.apply(this, arguments); };
  if(navigator.sendBeacon){
    var ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(){ window.__BEACON++; window.__ERR.push("外部送信(sendBeacon)が呼ばれました"); return ob.apply(navigator, arguments); };
  }
  var ows = window.WebSocket;
  window.WebSocket = function(){ window.__WS++; window.__ERR.push("外部通信(WebSocket)が作られました"); return new ows(arguments[0], arguments[1]); };
})();
</script>`;

function buildPage(checkFile, outFile){
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const checks = fs.readFileSync(checkFile, "utf8");
  html = html.replace("<body>", "<body>\n" + COLLECTOR);
  html = html.replace("</body>", '<pre id="TESTOUT"></pre>\n<script>\n' + checks + "\n</script>\n</body>");
  fs.writeFileSync(outFile, html);
  return outFile;
}

/* Chrome は --dump-dom で出力した後も終了しないことがあるため、
   一定時間で強制終了し、そこまでに受け取った出力を使う。 */
function runChrome(chrome, pageFile, profileDir, keepProfile){
  /* 続けて開く検証では、保存領域を引き継ぐためプロファイルを消さない */
  if(!keepProfile) fs.rmSync(profileDir, { recursive:true, force:true });
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking", "--disable-sync",
    "--user-data-dir=" + profileDir,
    "--allow-file-access-from-files",
    "--virtual-time-budget=6000",
    "--dump-dom", "file://" + pageFile
  ];
  const opts = {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 40000,
    killSignal: "SIGKILL"
  };
  try{
    return execFileSync(chrome, args, opts) || "";
  }catch(e){
    /* 強制終了した場合でも、DOM の出力はここに入っている */
    if(e && typeof e.stdout === "string" && e.stdout) return e.stdout;
    throw e;
  }
}

function extract(dom){
  const m = dom.match(/<pre id="TESTOUT"[^>]*>([\s\S]*?)<\/pre>/);
  if(!m) return null;
  return m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function main(){
  const chrome = findChrome();
  if(!chrome){
    console.log("Chrome / Edge が見つかりませんでした。");
    console.log("次のように場所を指定して実行してください：");
    console.log('  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/browser_check.js');
    console.log("\n※ ロジックだけのテストはブラウザなしで実行できます： node tests/app.test.js");
    process.exit(1);
  }
  console.log("使用ブラウザ: " + chrome);

  /* files が2つある組は「同じブラウザ（同じ保存領域）で続けて開く」検証。
     1つ目でデータを保存し、2つ目で開き直した状態を確認する。 */
  const suites = [
    { files:["01_functions.js"], title:"機能（印刷枚数・定期予定・保存・移行・整形・検索）" },
    { files:["02_ui.js"],        title:"画面操作（ボタン・入力・登録・削除）" },
    { files:["03_print.js"],     title:"印刷レイアウト（満床に近い人数）" },
    { files:["04a_update_write.js", "04b_update_read.js"],
      title:"アプリ更新（旧版データの入ったPCで新しい index.html を開く）" },
    { files:["05a_reload_write.js", "05b_reload_read.js"],
      title:"再読込（ブラウザを閉じて開き直しても入力が残る）" },
    { files:["06_unit_move.js"], title:"静養室への移動（印刷構成が4枚⇄5枚で切り替わる）" },
    { files:["07_security.js"],  title:"セキュリティ（タグ入力・入力欄の保護・不正データ・外部通信0件）" },
    { files:["08a_rest_input_write.js", "08b_rest_input_read.js"],
      title:"静養室の入力画面から直接追加（上限・自動保存・再起動後の復元）" },
    { files:["09_fixed_example.js"],
      title:"固定記入例（人数・上限・保存・印刷・検索・並び替え・操作不可）" },
    { files:["10a_legacy_sample_write.js", "10b_legacy_sample_read.js"],
      title:"旧見本入居者の整理（旧見本だけを消し、実データは残す）" },
    { files:["11_master_width.js"],
      title:"入居者一覧の幅（部屋番号は狭く・お名前は広く／全ユニット共通）" }
  ];

  /* 引数を渡すと、その名前を含む検証だけを実行する（例： node tests/browser_check.js 07） */
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = only.length
    ? suites.filter((s) => s.files.some((f) => only.some((o) => f.includes(o))))
    : suites;
  if(!targets.length){
    console.log("該当する検証がありません: " + only.join(", "));
    process.exit(1);
  }

  let totalFail = 0, totalErr = 0;
  for(const s of targets){
    console.log("\n■ " + s.title);
    /* 続けて開く組は、同じプロファイル＝同じ保存領域を使う */
    const profile = path.join(WORK, "profile-" + s.files[0]);
    let lastOut = null, brokeSuite = false;
    for(const file of s.files){
      const page = buildPage(path.join(__dirname, "browser", file), path.join(WORK, file + ".html"));
      let dom = "";
      try{
        /* 前回の異常終了で残ったロックを消してから開く */
        for(const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]){
          fs.rmSync(path.join(profile, lock), { force:true });
        }
        dom = runChrome(chrome, page, profile, s.files.length > 1);
      }catch(e){
        console.log("  ブラウザの起動に失敗しました: " + e.message);
        totalFail++; brokeSuite = true; break;
      }
      lastOut = extract(dom);
      if(!lastOut){
        console.log("  結果を取得できませんでした（描画が途中で止まった可能性があります）");
        totalFail++; brokeSuite = true; break;
      }
      const f = lastOut.match(/fail=(\d+)/);
      const e2 = lastOut.match(/errors=(\d+)/);
      totalFail += f  ? parseInt(f[1], 10)  : 0;
      totalErr  += e2 ? parseInt(e2[1], 10) : 0;
    }
    if(brokeSuite || !lastOut) continue;
    for(const line of lastOut.split("\n")){
      if(/^PASS/.test(line)) continue;      // 成功は件数だけ表示する
      if(line.trim()) console.log("  " + line);
    }
    const pass = (lastOut.match(/^PASS/gm) || []).length;
    if(pass) console.log("  成功 " + pass + " 件");
  }

  fs.rmSync(WORK, { recursive:true, force:true });
  console.log("");
  if(totalFail || totalErr){
    console.log("失敗 " + totalFail + " 件 / Consoleエラー " + totalErr + " 件");
    process.exit(1);
  }
  console.log("ブラウザでの動作確認：すべて成功（Consoleエラー 0 件）");
}

main();
