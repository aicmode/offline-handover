/* 【ブロック移動】A〜D のあいだで入居者を移し替えても、
   過去の申し送り・記録・予定が残り、上限（20名）も守られること */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };
  function fire(el,t){ el.dispatchEvent(new Event(t,{bubbles:true})); }

  /* デモデータは外し、移動だけを確かめられる状態にする */
  DB = defaultDB(); migrate();

  // 実データの入居者を作って Bブロックへ入れる
  DB.residents.push({ id:"mv1", unit:2, room:"B105", name:"移動 テスト", order:9, status:"in",
    permRaw:"", permShort:"転倒注意", permUpdated:"2026-08-14", autoCarry:true, demo:false, rec:defaultRec() });
  DB.schedules.push({ id:"mv-s", residentId:"mv1", unit:2, h:[2,"B105","移動 テスト"], demo:false,
    date:"2026-08-20", kind:"受診", start:"", end:"", title:"外部受診", place:"", dept:"", family:"", note:"" });
  DB.recurring.push({ id:"mv-r", unit:2, residentId:"mv1", shift:"night", days:[1],
    title:"移動テストBS", time:"", note:"", on:true, demo:false });
  dailyOf("2026-08-14","mv1").short = "移動前の申し送り";
  vitalsSet("2026-08-14","mv1","day.T","37.2");
  saveDB();
  UI.unit = 2; switchTab("master");

  ok("印刷の並びは常に A→B→C→D", unitsForPrint().join(",") === "1,2,3,4", unitsForPrint().join(","));
  var row = document.querySelector('#masterBody tr[data-id="mv1"]');
  ok("「いる場所」の選択欄がある", !!row && !!row.querySelector('[data-f="unitMove"]'));
  var sel = row.querySelector('[data-f="unitMove"]');
  ok("現在のブロックが選ばれている", sel.value === "2", sel.value);
  ok("選択肢は A〜D の4つだけ", sel.querySelectorAll("option").length === 4,
     sel.querySelectorAll("option").length);
  sel.value = "1"; fire(sel, "change");
  ok("Aブロックへ移動できる", residentById("mv1").unit === 1, residentById("mv1").unit);
  ok("過去の申し送りは残る", dailyGet("2026-08-14","mv1").short === "移動前の申し送り");
  ok("過去のバイタルも残る", vitalsGet("2026-08-14","mv1")["day.T"] === "37.2");
  ok("予定も一緒に移る", DB.schedules.filter(function(s){return s.id==="mv-s";})[0].unit === 1);
  ok("定期予定も一緒に移る", DB.recurring.filter(function(r){return r.id==="mv-r";})[0].unit === 1);
  HISTORY_CACHE = null;
  ok("移動後も過去記録を検索できる", buildHistoryIndex().some(function(x){
    return x.residentId === "mv1" && x.content.indexOf("移動前の申し送り") >= 0;
  }));
  ok("Aブロックの用紙に載る", printableOf(1).filter(function(r){return r.id==="mv1";}).length === 1);
  ok("元のBブロックからは外れる", printableOf(2).filter(function(r){return r.id==="mv1";}).length === 0);

  // 元へ戻す
  UI.unit = 1; renderMaster();
  var row2 = document.querySelector('#masterBody tr[data-id="mv1"]');
  var sel2 = row2.querySelector('[data-f="unitMove"]');
  sel2.value = "2"; fire(sel2, "change");
  ok("元のBブロックへ戻せる", residentById("mv1").unit === 2);

  // 上限（Aブロック20名）
  for(var i=0;i<20;i++){
    DB.residents.push({ id:"af"+i, unit:1, room:"A"+(101+i), name:"満床 "+i, order:i, status:"in",
      permRaw:"", permShort:"", permUpdated:"2026-08-14", autoCarry:true, demo:false, rec:defaultRec() });
  }
  UI.unit = 2; renderMaster();
  var row3 = document.querySelector('#masterBody tr[data-id="mv1"]');
  var sel3 = row3.querySelector('[data-f="unitMove"]');
  var full = sel3.querySelector('option[value="1"]');
  ok("満員のブロックは選べない（満員と表示される）",
     !!full && full.disabled && full.textContent.indexOf("満員") >= 0, full ? full.textContent : "(なし)");
  window.__ALERT = "";
  sel3.value = "1"; fire(sel3, "change");
  ok("満員なら移動できない", residentById("mv1").unit === 2, residentById("mv1").unit);
  ok("満員のとき利用者へ知らせる", String(window.__ALERT).indexOf("上限") >= 0, window.__ALERT);
  ok("満床でも印刷は基本4枚のまま", unitsForPrint().join(",") === "1,2,3,4");

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
