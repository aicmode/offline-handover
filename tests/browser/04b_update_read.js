/* 【アプリ更新テスト 2/2】
   新しいアプリ本体を、旧版データが入ったブラウザで開き直した状態を検証する。
   ＝「index.html を差し替えても、これまでのデータを失わない」ことの確認。 */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  ok("旧版の入居者3名がそのまま読める", DB.residents.length === 3, DB.residents.length);
  ok("既存データがあるので見本は追加されない", DB.residents.filter(isSample).length === 0);
  var l1 = residentById("L1");
  ok("氏名・部屋番号が保持される", !!l1 && l1.name === "旧版 一郎" && l1.room === "210");
  ok("常設メモが保持される", !!l1 && l1.permShort === "歩行見守り", l1 && l1.permShort);
  ok("印刷欄が空の常設メモは旧の下書きから引き継ぐ",
     residentById("L2").permShort === "食事はきざみ食です。", residentById("L2").permShort);
  ok("退居者も保持される", residentById("L3").status === "out");
  ok("旧BS設定が通常BSへ引き継がれる", l1.rec.day.normalBS.on === true);
  ok("旧の申し送りが読める", dailyGet("2026-06-01","L1").short === "発熱あり。経過観察。");
  ok("印刷欄が空の日は旧の下書きから引き継ぐ", dailyGet("2026-06-01","L2").short === "昼食10割",
     dailyGet("2026-06-01","L2").short);
  ok("過去2日分とも残っている", Object.keys(DB.daily).length === 2, Object.keys(DB.daily).length);
  ok("旧の予定が残っている", DB.schedules.length === 1 && DB.schedules[0].place === "旧版クリニック");
  ok("新機能の入れ物（定期予定・記録）が用意される",
     Array.isArray(DB.recurring) && typeof DB.vitals === "object");
  ok("データ版数が上がる", DB.v === 8, DB.v);
  ok("ユニットの所属が変わらない", residentById("L1").unit === 2 && residentById("L2").unit === 5);
  ok("静養室0人なので印刷は4枚", unitsForPrint().join(",") === "2,3,4,5", unitsForPrint().join(","));
  saveDB();
  ok("保存し直しても入居者が減らない",
     JSON.parse(localStorage.getItem(KEY)).residents.length === 3);
  ok("保存キーは変わっていない", KEY === "kaigo_handover_v2");
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
