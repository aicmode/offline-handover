(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function click(el){ el.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  var added = DB.residents.filter(function(r){ return r.unit === 1 && r.name === "静養テスト"; })[0];
  ok("ブラウザを閉じてfile://で開き直しても追加した人が残る", !!added);
  ok("開き直しても部屋番号・名前・大事なことが残る",
     added && added.room === "静養1" && added.permShort === "転倒注意・水分トロミ");
  ok("開き直しても申し送り・日勤・夜勤バイタルが残る",
     added && dailyGet(UI.date,added.id).short.indexOf("38.1") >= 0
     && vitalsGet(UI.date,added.id)["day.T"] === "38.1"
     && vitalsGet(UI.date,added.id)["night.T"] === "37.4");

  UI.unit = 1; switchTab("input");
  for(var i=2;i<=4;i++){
    click(document.getElementById("btnInputAdd"));
    var box = document.getElementById("inputAddBox");
    box.querySelector('[data-add-field="room"]').value = "静養"+i;
    box.querySelector('[data-add-field="name"]').value = "上限テスト"+i;
    click(box.querySelector('[data-add-action="submit"]'));
  }
  ok("静養室へ4名まで入力画面から追加できる", registeredCountOf(1) === 4, registeredCountOf(1));
  window.__ALERT = "";
  click(document.getElementById("btnInputAdd"));
  ok("静養室4/4では5人目の追加フォームを開かない", registeredCountOf(1) === 4 && INPUT_ADD_UNIT === 0);
  ok("満員時は職員向けの日本語で案内", window.__ALERT.indexOf("静養室は4名までです") >= 0, window.__ALERT);

  switchTab("master");
  ok("入居者タブから追加する従来ボタンも残る", !!document.getElementById("btnAdd"));

  switchTab("print");
  ok("静養室4人でも先頭を含む5枚構成", unitsForPrint().join(",") === "1,2,3,4,5");
  DB.residents.forEach(function(r){ if(r.unit === 1 && !isSample(r)) r.status = "out"; });
  saveDB(); renderPrint();
  ok("静養室が再び0人なら自動で4枚構成", unitsForPrint().join(",") === "2,3,4,5");

  ok("保存キーは従来のまま", KEY === "kaigo_handover_v2" && !!localStorage.getItem(KEY));
  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: "+errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
