/* 【再読込テスト 2/2】ブラウザを開き直した状態で、入力が残っているか */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  var r = residentById("reload-1");
  ok("再読込後も入居者が残っている", !!r);
  ok("常設メモが残っている", !!r && r.permShort === "転倒注意", r && r.permShort);
  ok("申し送りが残っている",
     dailyGet("2026-08-14","reload-1").short === "再読込しても残るはずの申し送り",
     dailyGet("2026-08-14","reload-1").short);
  ok("記録・バイタルが残っている", vitalsGet("2026-08-14","reload-1")["day.T"] === "37.4");
  ok("定期予定が残っている", DB.recurring.filter(function(x){ return x.id === "reload-rep"; }).length === 1);
  ok("定期予定が二重に増えていない",
     DB.recurring.filter(function(x){ return x.title === "再読込テストBS"; }).length === 1,
     DB.recurring.filter(function(x){ return x.title === "再読込テストBS"; }).length);
  ok("見本印のデータが作り直されていない", DB.residents.filter(isSample).length === 0,
     DB.residents.filter(isSample).length);
  ok("再読込でデモの61名が重複していない", DB.residents.length === 62, DB.residents.length);
  ok("デモ生成は1回だけ（版が記録されている）", DB.demoSeed === DEMO_SEED_VERSION, DB.demoSeed);
  ok("固定記入例は再読込後も静的UIとして表示される",
     document.getElementById("fixedExampleHost").textContent.indexOf("記入例") >= 0);
  ok("選んだ並び順が再読込後も残る", DB.settings.residentSort === "updated",
     DB.settings.residentSort);
  ok("月曜夜勤は日曜の用紙に出る（再読込後も）",
     recurringForSheet("2026-08-16",{unit:3}).night.filter(function(x){ return x.rule.id === "reload-rep"; }).length === 1);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
