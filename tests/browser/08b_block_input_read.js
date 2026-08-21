/* 【入力画面からの追加 2/2】ブラウザを閉じて file:// で開き直した状態を検証する */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function click(el){ el.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  var added = DB.residents.filter(function(r){ return r.unit === 1 && r.name === "追加 テスト"; })[0];
  ok("ブラウザを閉じてfile://で開き直しても追加した人が残る", !!added);
  ok("デモデータが作り直されて上書きされていない", DB.residents.length === 1, DB.residents.length);
  ok("開き直しても部屋番号・名前・大事なことが残る",
     added && added.room === "A101" && added.permShort === "歩行見守り・転倒注意");
  ok("開き直しても申し送り・日勤・夜勤バイタルが残る",
     added && dailyGet(UI.date,added.id).short.indexOf("38.1") >= 0
     && vitalsGet(UI.date,added.id)["day.T"] === "38.1"
     && vitalsGet(UI.date,added.id)["night.T"] === "37.4");

  UI.unit = 1; switchTab("input");
  for(var i=2;i<=20;i++){
    click(document.getElementById("btnInputAdd"));
    var box = document.getElementById("inputAddBox");
    box.querySelector('[data-add-field="room"]').value = "A" + (100 + i);
    box.querySelector('[data-add-field="name"]').value = "上限テスト" + i;
    click(box.querySelector('[data-add-action="submit"]'));
  }
  ok("Aブロックへ20名まで入力画面から追加できる", registeredCountOf(1) === 20, registeredCountOf(1));
  window.__ALERT = "";
  click(document.getElementById("btnInputAdd"));
  ok("Aブロック20/20では21人目の追加フォームを開かない", registeredCountOf(1) === 20 && INPUT_ADD_UNIT === 0);
  ok("満員時はわかりやすい日本語で案内", window.__ALERT.indexOf("Aブロックは20名までです") >= 0, window.__ALERT);

  switchTab("master");
  ok("入居者タブから追加する従来ボタンも残る", !!document.getElementById("btnAdd"));

  switchTab("print");
  ok("Aブロック満床（20名）でも用紙は作られる",
     document.querySelectorAll('#printArea .sheet[data-unit="1"]').length >= 1);
  ok("満床の用紙にも20行が並ぶ",
     document.querySelectorAll('#printArea .sheet[data-unit="1"] .prow').length === 20,
     document.querySelectorAll('#printArea .sheet[data-unit="1"] .prow').length);

  /* デモの初期化ボタンで、いつでも架空の61名へ戻せる */
  switchTab("master");
  click(document.getElementById("btnResetDemo"));
  ok("「デモを初期状態に戻す」で架空61名へ戻る", DB.residents.length === 61, DB.residents.length);
  ok("戻した直後の人数も A15 / B12 / C18 / D16",
     realResidentsOf(1).length === 15 && realResidentsOf(2).length === 12
     && realResidentsOf(3).length === 18 && realResidentsOf(4).length === 16);
  ok("戻した内容も保存される",
     JSON.parse(localStorage.getItem(KEY)).residents.length === 61);

  ok("保存キーは公開デモ専用のまま", KEY === "handover_portfolio_demo_v2" && !!localStorage.getItem(KEY));
  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: "+errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
