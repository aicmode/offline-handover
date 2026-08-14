/* 【旧見本の整理テスト 2/2】
   10a が書いた旧版データを、新しいアプリで開き直した状態を検証する。
   ・旧見本だけが消える　・実入居者と実データは1つも消えない
   ・人数は実入居者だけで数える　・保存キーとデータ版は変わらない */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function has(id){ return !!residentById(id); }
  function countOf(unit){
    var b = document.querySelector('#unitBar button[data-unit="'+unit+'"] .cnt');
    return b ? b.textContent.replace(/[^0-9／\/]/g,"") : "(なし)";
  }
  var stored = localStorage.getItem("kaigo_handover_v2") || "";

  /* ---- 旧見本が消えている ---- */
  ok("旧見本 sample-2（demo印あり）が消えた", !has("sample-2"));
  ok("旧見本 sample-3（demo印なし・見本データあり）が消えた", !has("sample-3"));
  ok("旧見本 sample-4（demo印あり・名前変更あり）が消えた", !has("sample-4"));
  ok("旧見本 sample-5（demo印なし・4項目一致）が消えた", !has("sample-5"));
  ok("旧見本が保存データからも消えた", stored.indexOf("sample-2") < 0 && stored.indexOf("見本 太郎") < 0, stored.slice(0,120));
  ok("旧見本の申し送りが消えた", !(DB.daily["2026-06-01"] && DB.daily["2026-06-01"]["sample-2"]));
  ok("旧見本の記録値が消えた", !(DB.vitals["2026-06-01"] && DB.vitals["2026-06-01"]["sample-2"]));
  ok("旧見本の予定が消えた", DB.schedules.filter(function(s){ return s.id === "sample-sch-5"; }).length === 0);
  ok("旧見本の定期予定が消えた", DB.recurring.filter(function(r){ return r.id === "sample-rep-3-0"; }).length === 0);

  /* ---- 実データは1つも消えていない ---- */
  ok("お名前が紛らわしい実入居者は消えない", has("rreal1"), "rreal1");
  ok("ふつうの実入居者は消えない", has("rreal2"), "rreal2");
  ok("実入居者の毎日つづく大事なことが残る",
     residentById("rreal1").permShort.indexOf("実在の入居者") >= 0, residentById("rreal1").permShort);
  ok("実入居者の申し送りが残る", dailyGet("2026-06-01","rreal1").short.indexOf("残る") >= 0);
  ok("もう一人の実入居者の申し送りも残る", dailyGet("2026-06-01","rreal2").short.indexOf("残る") >= 0);
  ok("実入居者の記録値が残る", vitalsGet("2026-06-01","rreal1")["day.T"] === "36.6");
  ok("実入居者の予定が残る", DB.schedules.filter(function(s){ return s.id === "real-sch-1"; }).length === 1);
  ok("実入居者の定期予定が残る", DB.recurring.filter(function(r){ return r.id === "real-rep-1"; }).length === 1);

  /* ---- 判断できないデータは消さずに残し、報告できる状態にする ---- */
  ok("断定できないデータは消さずに残す", has("rmaybe1"), "rmaybe1");
  ok("断定できないデータは確認用に記録される",
     LEGACY_SAMPLE_KEPT.filter(function(x){ return x.id === "rmaybe1"; }).length === 1,
     JSON.stringify(LEGACY_SAMPLE_KEPT));
  ok("断定できないデータは人数に入れない（見本として扱う）", isSample(residentById("rmaybe1")));

  /* ---- 人数は実入居者だけ ---- */
  renderUnitBar();
  ok("静養室は 0／4",     countOf(1) === "0／4",  countOf(1));
  ok("ユニット2は 1／34（実入居者1名だけ）", countOf(2) === "1／34", countOf(2));
  ok("ユニット3は 1／30（実入居者1名だけ）", countOf(3) === "1／30", countOf(3));
  ok("ユニット4は 0／30", countOf(4) === "0／30", countOf(4));
  ok("ユニット5は 0／30", countOf(5) === "0／30", countOf(5));
  ok("上限判定にも見本が入らない", registeredCountOf(5) === 0, registeredCountOf(5));

  /* ---- 見本は印刷・検索・予定に出ない ---- */
  ok("見本は印刷に出ない", printableOf(5).length === 0 && printableOf(3).length === 1, printableOf(3).length);
  HISTORY_CACHE = null;
  var idx = buildHistoryIndex();
  ok("見本の申し送りは検索に出ない",
     idx.filter(function(x){ return String(x.content).indexOf("見本の申し送り") >= 0; }).length === 0);
  ok("消した見本の記録は検索に残らない",
     idx.filter(function(x){ return isLegacySampleId(x.residentId); }).length === 0);
  ok("残した判断できないデータも検索に出ない",
     idx.filter(function(x){ return x.residentId === "rmaybe1"; }).length === 0);
  ok("実入居者の申し送りは検索に出る", idx.filter(function(x){ return x.residentId === "rreal1"; }).length > 0);

  /* ---- 保存キー・データ版・固定記入例 ---- */
  ok("保存キーは kaigo_handover_v2 のまま", !!localStorage.getItem("kaigo_handover_v2"));
  ok("データ版は 8 のまま", DB.v === 8, DB.v);
  UI.unit = 2; switchTab("input");
  ok("固定記入例は入力タブに出る",
     document.getElementById("fixedExampleHost").textContent.indexOf(FIXED_EXAMPLES[2].today) >= 0);
  switchTab("master");
  ok("固定記入例は入居者タブに出る",
     document.getElementById("masterFixedExampleHost").textContent.indexOf(FIXED_EXAMPLES[2].today) >= 0);
  ok("固定記入例は保存データに入らない", (localStorage.getItem("kaigo_handover_v2")||"").indexOf(FIXED_EXAMPLES[2].today) < 0);

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
