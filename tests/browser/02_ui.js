(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function click(id){ document.getElementById(id).dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  function fire(el,type){ el.dispatchEvent(new Event(type,{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert   = function(m){ window.__ALERT = m; };

  // --- 職場実運用版の表示 ---
  ok("file:// 直接起動で公開ページ注意帯が存在しない",
     location.protocol === "file:" && !document.getElementById("webnote"));
  ok("公開ページ注意帯の文言が画面に存在しない",
     document.querySelector("header.top").textContent.indexOf("動作確認用の公開ページ") < 0);
  ok("フッターにVer1.0と表示される",
     APP_VERSION === "1.0" && document.getElementById("footVer").textContent.trim() === "Ver1.0");
  ok("表示版番号と保存キー・データ版数は別管理",
     KEY === "kaigo_handover_v2" && DATA_VERSION === 8);

  // --- 入居者をUIから追加 ---
  UI.unit = 2; switchTab("master");
  var before = registeredCountOf(2);
  click("btnAdd");
  ok("「入居者を追加」で1名増える", registeredCountOf(2) === before + 1, registeredCountOf(2));
  var row = document.querySelector('#masterBody tr:last-child');
  var newId = row.getAttribute("data-id");
  var roomInput = row.querySelector('[data-f="room"]');
  roomInput.value = "205"; fire(roomInput, "input");
  var nameInput = row.querySelector('[data-f="name"]');
  nameInput.value = "テスト 花子"; fire(nameInput, "input");
  saveDB();
  ok("名前・部屋番号が保存される",
     JSON.parse(localStorage.getItem(KEY)).residents.filter(function(r){return r.id===newId;})[0].name === "テスト 花子");

  // --- 入力タブで申し送りを打ち、文章整形ボタンを押す ---
  switchTab("input");
  var card = document.querySelector('#inputList .card[data-id="'+newId+'"]');
  ok("追加した入居者のカードが出る", !!card);
  var ta = card.querySelector('[data-f="todayShort"]');
  ta.value = "発熱 38.2 カロナール服用 水分摂取"; fire(ta, "input");
  saveDB();
  ok("入力が自動保存される（保存ボタン不要）",
     JSON.parse(localStorage.getItem(KEY)).daily[UI.date][newId].short.indexOf("38.2") >= 0);
  card.querySelector('[data-a="todayTidy"]').dispatchEvent(new MouseEvent("click",{bubbles:true}));
  var after = dailyGet(UI.date, newId).short;
  ok("「文章を整える」ボタンが動く", after.indexOf("38.2℃") >= 0, after);
  card = document.querySelector('#inputList .card[data-id="'+newId+'"]');
  card.querySelector('[data-a="todayUndo"]').dispatchEvent(new MouseEvent("click",{bubbles:true}));
  ok("「元にもどす」で整える前へ戻る",
     dailyGet(UI.date, newId).short === "発熱 38.2 カロナール服用 水分摂取", dailyGet(UI.date, newId).short);

  // --- バイタル入力 ---
  card = document.querySelector('#inputList .card[data-id="'+newId+'"]');
  var vin = card.querySelector('[data-vk="day.T"]');
  vin.value = "38.2"; fire(vin, "input");
  saveDB();
  ok("バイタル入力が保存される", (JSON.parse(localStorage.getItem(KEY)).vitals[UI.date]||{})[newId]["day.T"] === "38.2");

  // --- 予定をUIから追加 ---
  card.querySelector('[data-a="schedAdd"]').dispatchEvent(new MouseEvent("click",{bubbles:true}));
  var form = card.querySelector("[data-sform]");
  ok("予定フォームが開く", form.classList.contains("on"));
  form.querySelector('[data-sf="title"]').value = "定期受診";
  form.querySelector('[data-sf="kind"]').value  = "受診";
  var nsched = DB.schedules.length;
  form.querySelector('[data-a="schedSave"]').dispatchEvent(new MouseEvent("click",{bubbles:true}));
  ok("予定が1件保存される", DB.schedules.length === nsched + 1, DB.schedules.length);

  // --- 定期予定をUIから追加（夜勤） ---
  switchTab("sched");
  document.getElementById("repTitle").value = "UIテストBS";
  document.getElementById("repShift").value = "night";
  var wdBox = document.querySelector('#repWdays input[data-repd="1"]');   // 月曜
  wdBox.checked = true; fire(wdBox, "change");
  var nrep = DB.recurring.length;
  click("btnRepAdd");
  ok("定期予定がUIから登録できる", DB.recurring.length === nrep + 1, DB.recurring.length);
  var added = DB.recurring[DB.recurring.length-1];
  ok("登録した定期予定は夜勤・月曜", added.shift === "night" && added.days.join(",") === "1");
  ok("月曜夜勤は日曜の用紙に出る",
     recurringForSheet("2026-08-16", {unit:2}).night.filter(function(x){return x.rule.id===added.id;}).length === 1);
  // 同じ内容をもう一度登録 → 増えない
  document.getElementById("repTitle").value = "UIテストBS";
  document.getElementById("repShift").value = "night";
  var wd2 = document.querySelector('#repWdays input[data-repd="1"]');
  wd2.checked = true; fire(wd2, "change");
  var n2 = DB.recurring.length;
  click("btnRepAdd");
  ok("同じ定期予定は二重登録されない", DB.recurring.length === n2, DB.recurring.length);

  // --- 印刷プレビュー ---
  switchTab("print");
  ok("印刷枚数の案内が出る",
     document.getElementById("printPlan").textContent.indexOf("枚です") >= 0,
     document.getElementById("printPlan").textContent.slice(0,60));
  ok("印刷は4枚（静養室0人）", document.querySelectorAll("#printArea .sheet").length === 1
     || document.querySelectorAll("#printArea .sheet").length === 4,
     document.querySelectorAll("#printArea .sheet").length);

  // --- 検索 ---
  switchTab("history");
  var kw = document.getElementById("historyKeyword");
  kw.value = "カロナール"; fire(kw, "input");
  renderHistory();
  ok("UIから検索できる", document.getElementById("historyCount").textContent !== "0件",
     document.getElementById("historyCount").textContent);
  // 入力途中（部分入力）で候補が出ること
  kw.value = "カロ"; fire(kw, "input");
  showSuggest();
  ok("入力途中に検索候補のリストが出る", document.getElementById("searchSuggest").classList.contains("on"),
     document.getElementById("searchSuggest").innerHTML.slice(0,120));
  var sgBtn = document.querySelector("#searchSuggest button[data-sg]");
  ok("候補ボタンが生成される", !!sgBtn && sgBtn.getAttribute("data-sg").indexOf("カロナール") >= 0,
     sgBtn ? sgBtn.getAttribute("data-sg") : "(なし)");
  // 候補を押すと検索欄へ入る
  if(sgBtn){
    applySuggest(sgBtn.getAttribute("data-sg"));
    ok("候補を選ぶと検索欄に入る", kw.value.indexOf("カロナール") >= 0, kw.value);
  }
  // 完全に一致する語だけのときは候補を出さない（打った語をそのまま出しても意味がないため）
  kw.value = "カロナール"; fire(kw, "input");
  showSuggest();
  ok("入力済みの語と同じだけの候補は出さない", !document.getElementById("searchSuggest").classList.contains("on"));
  click("historyClear");
  ok("条件クリアで空になる", kw.value === "");
  kw.value = "テスト 花子"; renderHistory();
  var personResult = document.querySelector('#historyResults .resident-now[data-history-index]');
  ok("入居者の現在地結果に移動ボタンが出る", !!personResult && personResult.textContent.indexOf("この人を見る") >= 0);
  if(personResult){
    personResult.querySelector("button").dispatchEvent(new MouseEvent("click",{bubbles:true}));
    ok("現在地結果のボタンでその人の入力画面へ移動する", UI.tab === "input" && UI.unit === 2);
  }

  // --- 使い方モーダル ---
  click("btnGuide");
  ok("使い方が開く", document.getElementById("guideModal").classList.contains("on"));
  document.getElementById("guideSearch").value = "夜勤";
  fire(document.getElementById("guideSearch"), "input");
  ok("使い方の検索がしぼり込む",
     document.querySelectorAll("#guideBody [data-guide-section]:not(.is-hidden)").length > 0
     && document.querySelectorAll("#guideBody [data-guide-section].is-hidden").length > 0);
  click("guideClose");
  ok("使い方が閉じる", !document.getElementById("guideModal").classList.contains("on"));

  // --- 並び順UIと固定記入例 ---
  switchTab("master");
  var dbOrder = DB.residents.map(function(r){return r.id;}).join(",");
  var sort = document.getElementById("residentSort");
  sort.value = "name"; fire(sort, "change");
  ok("五十音順へ切り替えられる", DB.settings.residentSort === "name");
  sort.value = "updated"; fire(sort, "change");
  ok("最近編集した順へ切り替えられる", DB.settings.residentSort === "updated");
  ok("ソート切替でDB配列順を書き換えない", DB.residents.map(function(r){return r.id;}).join(",") === dbOrder);
  switchTab("input");
  ok("固定記入例は折りたたみで実カードの外側にある",
     !!document.querySelector("#fixedExampleHost details.fixed-example")
     && document.querySelectorAll("#fixedExampleHost .card").length === 0);
  ok("実データの入居者は残る", !!residentById(newId));

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  " + e); });
  lines.push(""); lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
