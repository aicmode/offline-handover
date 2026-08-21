/* 【初回デモデータ 2/2】開き直しても61名が重複せず、閲覧者の変更が残ること */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function click(el){ el.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  ok("開き直しても61名のまま（重複生成しない）", DB.residents.length === 61, DB.residents.length);
  ok("人数表示も A15 / B12 / C18 / D16",
     realResidentsOf(1).length === 15 && realResidentsOf(2).length === 12
     && realResidentsOf(3).length === 18 && realResidentsOf(4).length === 16,
     [1,2,3,4].map(function(u){ return realResidentsOf(u).length; }).join("/"));
  var changed = DB.residents.filter(function(r){ return r.name === "閲覧者が変えた名前"; });
  ok("閲覧者が変えた名前が残っている", changed.length === 1, changed.length);
  ok("閲覧者が書いた申し送りも残っている",
     changed.length === 1 && dailyGet(todayYmd(), changed[0].id).short === "閲覧者が書いた申し送り");
  ok("閲覧者が足した予定も残っている",
     DB.schedules.filter(function(s){ return s.id === "demo-visitor"; }).length === 1);
  ok("予定が二重に増えていない", (function(){
    var seen = {}, dup = 0;
    DB.schedules.forEach(function(s){ if(seen[s.id]) dup++; seen[s.id] = 1; });
    return dup === 0;
  })());
  ok("定期予定も二重に増えていない", (function(){
    var sig = {}, dup = 0;
    DB.recurring.forEach(function(r){
      var k = recurringSignature(r);
      if(sig[k]) dup++; sig[k] = 1;
    });
    return dup === 0;
  })());

  switchTab("print");
  ok("開き直しても印刷は基本4枚",
     document.querySelectorAll("#printArea .sheet").length === 4,
     document.querySelectorAll("#printArea .sheet").length);
  ok("固定記入例は保存データに入らない",
     (localStorage.getItem(KEY)||"").indexOf(FIXED_EXAMPLES[2].today) < 0);

  /* 初期デモ状態へ戻す導線 */
  switchTab("master");
  click(document.getElementById("btnResetDemo"));
  ok("「デモを初期状態に戻す」で架空61名へ作り直せる", DB.residents.length === 61, DB.residents.length);
  ok("戻すと閲覧者の変更は消える",
     DB.residents.filter(function(r){ return r.name === "閲覧者が変えた名前"; }).length === 0);
  ok("戻しても重複しない", new Set(DB.residents.map(function(r){ return r.room; })).size === 61);

  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: "+errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
