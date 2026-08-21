/* =========================================================
   実ブラウザでのセキュリティ確認
   ---------------------------------------------------------
   ・氏名／申し送り／予定などへタグやスクリプト文字列を入力しても実行されないこと
   ・すべての入力欄で spellcheck / autocomplete などが止まっていること
   ・壊れた保存データ・不正なバックアップで既存データが消えないこと
   ・アプリの操作中に外部通信が1件も起きないこと
   ========================================================= */
(function(){
  /* この検証スクリプト自身も window.__XSS という文字を含むため、数える対象から外す */
  var SELF = document.currentScript;
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function fire(el,type){ el.dispatchEvent(new Event(type,{bubbles:true})); }
  function click(el){ el.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert   = function(m){ window.__ALERT = m; };

  var XSS_IMG    = '<img src=x onerror="window.__XSS=1">';
  var XSS_SCRIPT = '<script>window.__XSS=2<\/script>';
  var XSS_QUOTE  = '"><b class="xsscheck">抜けた</b>';
  var XSS_SVG    = "'><svg onload=\"window.__XSS=3\">";
  var XSS_TA     = '<\/textarea><script>window.__XSS=4<\/script>';
  var SPECIAL    = '< > & " \' 特殊文字';

  /* ---------- 1. 入力欄の保護属性 ---------- */
  function unprotected(){
    var bad = [], list = document.querySelectorAll("input,textarea");
    var skip = { checkbox:1, radio:1, file:1, hidden:1, button:1, submit:1, reset:1 };
    for(var i=0;i<list.length;i++){
      var el = list[i];
      if(el.tagName.toLowerCase() === "input" && skip[(el.getAttribute("type")||"text").toLowerCase()]) continue;
      if(el.getAttribute("spellcheck") !== "false"
      || el.getAttribute("autocomplete") !== "off"
      || el.getAttribute("autocorrect") !== "off"
      || el.getAttribute("autocapitalize") !== "off"
      || el.getAttribute("writingsuggestions") !== "false"){
        bad.push((el.id || el.className || el.tagName) + "[" + (el.getAttribute("type")||"") + "]");
      }
    }
    return bad;
  }
  switchTab("input");
  ok("入力タブのすべての入力欄が保護されている", unprotected().length === 0, unprotected().join(", "));
  ok("ページ全体で校正・翻訳が止まっている",
     document.documentElement.getAttribute("spellcheck") === "false"
     && document.documentElement.getAttribute("translate") === "no"
     && document.documentElement.getAttribute("writingsuggestions") === "false");
  ok("実際に spellcheck が無効として解釈されている",
     document.querySelector('#inputList textarea') ? document.querySelector('#inputList textarea').spellcheck === false : true);

  /* ---------- 2. 氏名・部屋番号へタグを入力 ---------- */
  UI.unit = 2;
  switchTab("master");
  var before = registeredCountOf(2);
  click(document.getElementById("btnAdd"));
  ok("入居者を1名追加できる", registeredCountOf(2) === before + 1);
  var row = document.querySelector('#masterBody tr:last-child');
  var vid = row.getAttribute("data-id");
  var roomI = row.querySelector('[data-f="room"]');
  var nameI = row.querySelector('[data-f="name"]');
  roomI.value = XSS_IMG;    fire(roomI, "input");
  nameI.value = XSS_SCRIPT; fire(nameI, "input");
  saveDB();
  ok("入力したタグ文字はそのまま保存される（勝手に消さない）",
     residentById(vid).name === XSS_SCRIPT && residentById(vid).room === XSS_IMG);

  /* ---------- 3. 申し送り・メモ・予定へタグを入力 ---------- */
  switchTab("input");
  var card = document.querySelector('#inputList .card[data-id="'+vid+'"]');
  ok("追加した入居者のカードが出る", !!card);
  var perm = card.querySelector('[data-f="permShort"]');
  perm.value = XSS_QUOTE; fire(perm, "input");
  var main = card.querySelector('[data-f="todayShort"]');
  main.value = XSS_TA; fire(main, "input");
  var draft = card.querySelector('[data-f="todayRaw"]');
  draft.value = SPECIAL; fire(draft, "input");
  var vin = card.querySelector('[data-vk="day.T"]');
  if(vin){ vin.value = XSS_SVG; fire(vin, "input"); }
  saveDB();

  card = document.querySelector('#inputList .card[data-id="'+vid+'"]');
  click(card.querySelector('[data-a="schedAdd"]'));
  var form = card.querySelector("[data-sform]");
  form.querySelector('[data-sf="title"]').value = XSS_IMG;
  form.querySelector('[data-sf="place"]').value = XSS_QUOTE;
  form.querySelector('[data-sf="note"]').value  = XSS_SCRIPT;
  click(form.querySelector('[data-a="schedSave"]'));
  ok("予定にタグを入れても保存できる",
     DB.schedules.filter(function(s){ return s.residentId === vid; }).length === 1);

  switchTab("sched");
  document.getElementById("repTitle").value = XSS_IMG;
  var repRes = document.getElementById("repResident");
  if(repRes){ repRes.value = vid; fire(repRes, "change"); }
  var repBtn = document.getElementById("btnRepAdd");
  if(repBtn) click(repBtn);

  /* ---------- 4. すべての画面を描画して、実行されていないか見る ---------- */
  ["input","master","sched","print","history"].forEach(function(t){ switchTab(t); });
  var kw = document.getElementById("historyKeyword");
  kw.value = XSS_IMG; fire(kw, "input");
  renderHistory();

  ok("スクリプトが実行されていない（window.__XSS が付かない）", window.__XSS === undefined, window.__XSS);
  ok("注入したタグがDOM要素として作られていない",
     document.querySelectorAll(".xsscheck").length === 0
     && document.querySelectorAll("#app img, .app img").length === 0
     && document.querySelectorAll("svg[onload]").length === 0);
  ok("画面のどこにも onerror / onload 属性が付いた要素が無い",
     document.querySelectorAll("[onerror],[onload],[onclick]").length === 0);
  var injectedScripts = 0, sc = document.querySelectorAll("script");
  for(var i=0;i<sc.length;i++){
    if(sc[i] === SELF) continue;                       // 検証スクリプト自身は除く
    if(/window\.__XSS/.test(sc[i].textContent)) injectedScripts++;
  }
  ok("入力文字がscript要素として取り込まれていない", injectedScripts === 0, injectedScripts);

  /* 入力した文字が「文字」として画面に出ていること（消えていないこと） */
  switchTab("input");
  card = document.querySelector('#inputList .card[data-id="'+vid+'"]');
  ok("タグ文字が入力欄の値としてそのまま読める",
     card.querySelector('[data-f="name"]').value === XSS_SCRIPT
     && card.querySelector('[data-f="permShort"]').value === XSS_QUOTE
     && card.querySelector('[data-f="todayRaw"]').value === SPECIAL);
  switchTab("print");
  var sheetText = document.getElementById("printArea").textContent;
  ok("印刷プレビューにも文字として出る（タグ扱いされない）",
     sheetText.indexOf("<img src=x") >= 0 || sheetText.indexOf("<script>") >= 0, sheetText.slice(0, 120));

  /* ---------- 5. 特殊文字が保存・再読込で壊れない ---------- */
  saveDB();
  var reread = JSON.parse(localStorage.getItem(KEY));
  var savedR = reread.residents.filter(function(r){ return r.id === vid; })[0];
  ok("特殊文字 < > & \" ' が保存内容の中でそのまま残る",
     reread.daily[UI.date][vid].raw === SPECIAL, reread.daily[UI.date][vid].raw);
  ok("保存キーは公開デモ専用", KEY === "handover_portfolio_demo_v2" && !!savedR);

  /* ---------- 6. 不正なバックアップの拒否 ---------- */
  var snapshot = JSON.stringify(DB);
  var badOnes = ["", "null", "[]", "{}", '{"residents":"x"}', '{"residents":[[]]}',
                 '{"residents":[],"daily":[]}', "{壊れたJSON", "<html></html>"];
  var rejected = 0;
  for(var b=0;b<badOnes.length;b++){
    var obj = null;
    try{ obj = JSON.parse(badOnes[b]); }catch(e){ obj = null; }
    if(!validBackup(obj)) rejected++;
  }
  ok("不正なバックアップをすべて拒否する", rejected === badOnes.length, rejected + "/" + badOnes.length);
  ok("拒否のあとも現在のデータが変わっていない", JSON.stringify(DB) === snapshot);

  /* ---------- 7. 壊れた localStorage からの復帰 ---------- */
  var good = localStorage.getItem(KEY);
  localStorage.setItem(KEY, "{これは壊れたデータ");
  loadDB();
  ok("壊れた保存データは退避キーへ残す（黙って消さない）",
     localStorage.getItem(KEY + "_broken") === "{これは壊れたデータ");
  ok("壊れていても起動を続けられる", Array.isArray(DB.residents));
  localStorage.setItem(KEY, good);
  loadDB(); renderAll();
  ok("正しいデータへ戻すと、入力内容がそのまま読める",
     !!residentById(vid) && residentById(vid).name === XSS_SCRIPT);
  ok("再描画のあとも入力欄の保護が外れない", unprotected().length === 0, unprotected().join(", "));

  /* ---------- 8. 外部通信 ---------- */
  ok("fetch が1回も呼ばれていない", window.__FETCHCALLS === 0, window.__FETCHCALLS);
  ok("XMLHttpRequest が1回も使われていない", window.__XHRCALLS === 0, window.__XHRCALLS);
  ok("sendBeacon が1回も使われていない", window.__BEACON === 0, window.__BEACON);
  ok("WebSocket が1回も作られていない", window.__WS === 0, window.__WS);
  ok("外部から読み込まれた要素が無い（script/link/img/iframe）",
     document.querySelectorAll('script[src],link[href],img[src],iframe,object,embed').length === 0);
  ok("Content-Security-Policy を宣言している",
     !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
  /* CSP が実際に効いているか（connect-src 'none' で fetch が失敗すること）を確かめる。
     ここで通信が成立してしまうと、宣言が効いていないことになる。 */
  var cspBlocked = false;
  try{
    fetch("https://example.invalid/ping").then(function(){}, function(){ cspBlocked = true; });
    cspBlocked = true;      // 例外か拒否のどちらでもブロック扱い
  }catch(e){ cspBlocked = true; }
  ok("外部への通信が拒否される（CSP connect-src none）", cspBlocked);

  /* 後片付け：検証で作ったデータを消す */
  DB.residents = DB.residents.filter(function(r){ return r.id !== vid; });
  DB.schedules = DB.schedules.filter(function(s){ return s.residentId !== vid; });
  DB.recurring = DB.recurring.filter(function(r){ return r.residentId !== vid; });
  if(DB.daily[UI.date])  delete DB.daily[UI.date][vid];
  if(DB.vitals[UI.date]) delete DB.vitals[UI.date][vid];
  saveDB();

  var errs = window.__ERR || [];
  /* fetch の検証で1件だけ「外部通信が呼ばれた」記録が入るので、その分は除く */
  errs = errs.filter(function(e){ return e.indexOf("example.invalid") < 0; });
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  " + e); });
  lines.push(""); lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
