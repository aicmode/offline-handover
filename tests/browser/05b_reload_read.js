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
  ok("見本が作り直されていない", DB.residents.filter(isSample).length === 4,
     DB.residents.filter(isSample).length);
  ok("月曜夜勤は日曜の用紙に出る（再読込後も）",
     recurringForSheet("2026-08-16",{unit:3}).night.filter(function(x){ return x.rule.id === "reload-rep"; }).length === 1);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
