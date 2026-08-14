(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };
  function fire(el,t){ el.dispatchEvent(new Event(t,{bubbles:true})); }

  // 実データの入居者を作ってユニット2へ入れる
  DB.residents.push({ id:"mv1", unit:2, room:"250", name:"移動 テスト", order:9, status:"in",
    permRaw:"", permShort:"転倒注意", permUpdated:"2026-08-14", autoCarry:true, demo:false, rec:defaultRec() });
  DB.schedules.push({ id:"mv-s", residentId:"mv1", unit:2, h:[2,"250","移動 テスト"], demo:false,
    date:"2026-08-20", kind:"受診", start:"", end:"", title:"受診", place:"", dept:"", family:"", note:"" });
  DB.recurring.push({ id:"mv-r", unit:2, residentId:"mv1", shift:"night", days:[1],
    title:"移動テストBS", time:"", note:"", on:true, demo:false });
  dailyOf("2026-08-14","mv1").short = "移動前の申し送り";
  saveDB();
  UI.unit = 2; switchTab("master");

  ok("静養室は0人なので印刷4枚", unitsForPrint().join(",") === "2,3,4,5", unitsForPrint().join(","));
  var row = document.querySelector('#masterBody tr[data-id="mv1"]');
  ok("「いる場所」の選択欄がある", !!row && !!row.querySelector('[data-f="unitMove"]'));
  var sel = row.querySelector('[data-f="unitMove"]');
  ok("現在のユニットが選ばれている", sel.value === "2", sel.value);
  sel.value = "1"; fire(sel, "change");
  ok("静養室へ移動できる", residentById("mv1").unit === 1, residentById("mv1").unit);
  ok("移動すると印刷が5枚構成になる", unitsForPrint().join(",") === "1,2,3,4,5", unitsForPrint().join(","));
  ok("過去の申し送りは残る", dailyGet("2026-08-14","mv1").short === "移動前の申し送り");
  ok("予定も一緒に移る", DB.schedules.filter(function(s){return s.id==="mv-s";})[0].unit === 1);
  ok("定期予定も一緒に移る", DB.recurring.filter(function(r){return r.id==="mv-r";})[0].unit === 1);
  ok("静養室の用紙に載る", printableOf(1).filter(function(r){return r.id==="mv1";}).length === 1);
  ok("元のユニットからは外れる", printableOf(2).filter(function(r){return r.id==="mv1";}).length === 0);

  // 元へ戻す
  UI.unit = 1; renderMaster();
  var row2 = document.querySelector('#masterBody tr[data-id="mv1"]');
  var sel2 = row2.querySelector('[data-f="unitMove"]');
  sel2.value = "2"; fire(sel2, "change");
  ok("元のユニットへ戻せる", residentById("mv1").unit === 2);
  ok("静養室が0人に戻ると印刷4枚へ戻る", unitsForPrint().join(",") === "2,3,4,5", unitsForPrint().join(","));

  // 上限（静養室4人）
  for(var i=0;i<4;i++){
    DB.residents.push({ id:"rf"+i, unit:1, room:"S"+i, name:"静養 "+i, order:i, status:"in",
      permRaw:"", permShort:"", permUpdated:"2026-08-14", autoCarry:true, demo:false, rec:defaultRec() });
  }
  UI.unit = 2; renderMaster();
  var row3 = document.querySelector('#masterBody tr[data-id="mv1"]');
  var sel3 = row3.querySelector('[data-f="unitMove"]');
  window.__ALERT = "";
  sel3.value = "1"; fire(sel3, "change");
  ok("静養室が満員なら移動できない", residentById("mv1").unit === 2, residentById("mv1").unit);
  ok("満員のとき職員向けに知らせる", String(window.__ALERT).indexOf("上限") >= 0, window.__ALERT);

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
