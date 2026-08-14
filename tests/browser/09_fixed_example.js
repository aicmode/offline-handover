/* 【固定記入例】
   ・人数／上限に入らない　・DB／localStorage／バックアップに入らない
   ・印刷／検索／並び替えに出ない　・編集などの操作ができない
   ・入力タブと入居者タブの両方に、同じ FIXED_EXAMPLES から出る（静養室・ユニット2〜5） */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  function countOf(unit){
    var b = document.querySelector('#unitBar button[data-unit="'+unit+'"] .cnt');
    return b ? b.textContent.replace(/[^0-9／\/]/g,"") : "(なし)";
  }
  function exampleTextOf(hostId){
    var el = document.getElementById(hostId);
    return el ? el.textContent : "";
  }

  /* ---- 1. 実入居者0名のときの人数表示 ---- */
  ok("はじめは実入居者0名", DB.residents.length === 0, DB.residents.length);
  renderUnitBar();
  ok("静養室は 0／4",      countOf(1) === "0／4",  countOf(1));
  ok("ユニット2は 0／34",  countOf(2) === "0／34", countOf(2));
  ok("ユニット3は 0／30",  countOf(3) === "0／30", countOf(3));
  ok("ユニット4は 0／30",  countOf(4) === "0／30", countOf(4));
  ok("ユニット5は 0／30",  countOf(5) === "0／30", countOf(5));

  /* ---- 2. 固定記入例を表示しても人数は変わらない ---- */
  var beforeCounts = [1,2,3,4,5].map(countOf).join(" ");
  for(var u=1; u<=5; u++){
    UI.unit = u;
    switchTab("input");
    var inTxt = exampleTextOf("fixedExampleHost");
    switchTab("master");
    var mTxt = exampleTextOf("masterFixedExampleHost");
    var x = FIXED_EXAMPLES[u];
    ok(uLb(u)+"：入力タブに固定記入例が出る",
       inTxt.indexOf(x.room) >= 0 && inTxt.indexOf(x.perm) >= 0 && inTxt.indexOf(x.today) >= 0, inTxt.slice(0,60));
    ok(uLb(u)+"：入居者タブに固定記入例が出る",
       mTxt.indexOf(x.room) >= 0 && mTxt.indexOf(x.perm) >= 0 && mTxt.indexOf(x.today) >= 0, mTxt.slice(0,60));
    ok(uLb(u)+"：入力タブと入居者タブの内容が同じ", inTxt === mTxt);
    ok(uLb(u)+"：「記入例」と保存されない旨を表示している",
       inTxt.indexOf("記入例") >= 0 && inTxt.indexOf("保存") >= 0);
  }
  renderUnitBar();
  ok("固定記入例を表示しても人数は0のまま", [1,2,3,4,5].map(countOf).join(" ") === beforeCounts,
     [1,2,3,4,5].map(countOf).join(" "));

  /* ---- 3. 実データとの区別・操作不可 ---- */
  UI.unit = 2; switchTab("input");
  var host = document.getElementById("fixedExampleHost");
  ok("固定記入例は点線枠の専用ブロックで出る", !!host.querySelector(".fixed-example"));
  ok("固定記入例に入力欄がない", host.querySelectorAll("input,textarea,select").length === 0,
     host.querySelectorAll("input,textarea,select").length);
  ok("固定記入例に操作ボタンがない", host.querySelectorAll("[data-a],[data-f],button.btn").length === 0,
     host.querySelectorAll("[data-a],[data-f],button.btn").length);
  ok("固定記入例に data-id（実データの目印）が付かない", host.querySelectorAll("[data-id]").length === 0);
  switchTab("master");
  var mhost = document.getElementById("masterFixedExampleHost");
  ok("入居者タブの固定記入例にも入力欄がない", mhost.querySelectorAll("input,textarea,select").length === 0);
  ok("入居者タブの固定記入例にも操作ボタンがない", mhost.querySelectorAll("[data-a],[data-f]").length === 0);
  ok("固定記入例は入居者一覧（表）の外側にある", !mhost.closest("table") && !document.querySelector("#masterBody .fixed-example"));

  /* ---- 4. 保存されない ---- */
  saveDB();
  var storedTxt = localStorage.getItem("kaigo_handover_v2") || "";
  var dbTxt = JSON.stringify(DB);
  var exampleWords = [];
  for(var k in FIXED_EXAMPLES){
    exampleWords.push(FIXED_EXAMPLES[k].room, FIXED_EXAMPLES[k].name,
                      FIXED_EXAMPLES[k].perm, FIXED_EXAMPLES[k].today);
  }
  var inDb = exampleWords.filter(function(w){ return dbTxt.indexOf(w) >= 0; });
  var inLs = exampleWords.filter(function(w){ return storedTxt.indexOf(w) >= 0; });
  ok("固定記入例は DB.residents に入らない", DB.residents.length === 0, DB.residents.length);
  ok("固定記入例の文言が保存データに入らない", inDb.length === 0, inDb.join("/"));
  ok("固定記入例の文言が localStorage に入らない", inLs.length === 0, inLs.join("/"));
  /* バックアップは DB をそのまま書き出すので、DB に無い＝バックアップにも出ない */
  ok("固定記入例はバックアップ(JSON)に入らない", JSON.stringify(DB, null, 2).indexOf("記入例") < 0);
  ok("固定記入例は予定・定期予定・履歴に入らない",
     DB.schedules.length === 0 && DB.recurring.length === 0 && Object.keys(DB.daily).length === 0);

  /* ---- 5. 検索に出ない ---- */
  HISTORY_CACHE = null;
  var idx = buildHistoryIndex();
  var hitExample = idx.filter(function(x){
    return String(x.content).indexOf("水分摂取少量") >= 0 || String(x.name).indexOf("記入例") >= 0
        || String(x.content).indexOf("排便なし3日目") >= 0;
  });
  ok("固定記入例は過去記録の検索に出ない", hitExample.length === 0, hitExample.length);

  /* ---- 6. 印刷に出ない ---- */
  ok("固定記入例は印刷対象に入らない",
     [1,2,3,4,5].every(function(u){ return printableOf(u).length === 0; }));
  ok("静養室は固定記入例だけでは用紙が増えない", unitsForPrint().join(",") === "2,3,4,5", unitsForPrint().join(","));

  /* ---- 7. 実入居者を1名足すと、そのぶんだけ増える ---- */
  var r1 = addResident(2, { room:"210", name:"実データ 一郎", permShort:"歩行見守り" });
  renderUnitBar();
  ok("実入居者を追加すると ユニット2 が 1／34", countOf(2) === "1／34", countOf(2));
  ok("他のユニットは0のまま", countOf(3) === "0／30" && countOf(1) === "0／4");
  ok("追加した実入居者は保存される", !!residentById(r1.id) && (localStorage.getItem("kaigo_handover_v2")||"").indexOf("実データ 一郎") >= 0);

  /* ---- 8. 並び替えに参加しない ---- */
  var modes = ["manual","room","name","added","updated"];
  var sortOk = true, sortNote = "";
  for(var mi=0; mi<modes.length; mi++){
    DB.settings.residentSort = modes[mi];
    UI.unit = 2; renderMaster();
    var rows = document.querySelectorAll("#masterBody tr[data-id]");
    if(rows.length !== 1){ sortOk = false; sortNote = modes[mi]+"=行数"+rows.length; break; }
    if(document.querySelector("#masterBody .fixed-example")){ sortOk = false; sortNote = modes[mi]+"=表の中に例"; break; }
    var still = document.getElementById("masterFixedExampleHost").textContent;
    if(still.indexOf(FIXED_EXAMPLES[2].room) < 0){ sortOk = false; sortNote = modes[mi]+"=例が消えた"; break; }
    if(sortedResidentsForDisplay(2).some(isSample)){ sortOk = false; sortNote = modes[mi]+"=並びに見本"; break; }
  }
  DB.settings.residentSort = "manual";
  ok("どの並び順でも固定記入例は一覧の外側で一定位置に出る", sortOk, sortNote);

  /* ---- 9. 上限判定に入らない ---- */
  for(var i=0;i<4;i++) addResident(1, { room:"静養"+(i+1), name:"静養テスト"+(i+1), permShort:"" });
  renderUnitBar();
  ok("静養室は実入居者4名まで登録できる", countOf(1) === "4／4", countOf(1));
  window.__ALERT = "";
  var over = addResident(1, { room:"静養5", name:"静養テスト5", permShort:"" });
  ok("静養室は5人目を登録できない", over === null && realResidentsOf(1).length === 4, realResidentsOf(1).length);
  ok("上限のときは職員へ知らせる", String(window.__ALERT).indexOf("4名まで") >= 0, window.__ALERT);
  ok("固定記入例は上限判定に含まれない（静養室で4名入る）", registeredCountOf(1) === 4, registeredCountOf(1));
  var capOkAll = true;
  [[2,34],[3,30],[4,30],[5,30]].forEach(function(p){
    if(registeredCountOf(p[0]) + (uMax(p[0]) - registeredCountOf(p[0])) !== p[1]) capOkAll = false;
    if(!hasResidentCapacity(p[0], false)) capOkAll = false;   // 固定例があっても空きがある
  });
  ok("ユニット2〜5も固定記入例のぶん枠が減っていない", capOkAll);

  /* ---- 10. 固定記入例そのものは編集できない（DOM操作でも保存されない） ---- */
  var before = JSON.stringify(DB.residents);
  UI.unit = 3; switchTab("input");
  var field = document.querySelector("#fixedExampleHost .example-field");
  if(field){ field.textContent = "書き換え"; field.dispatchEvent(new Event("input", {bubbles:true})); }
  ok("固定記入例をいじっても保存データは変わらない", JSON.stringify(DB.residents) === before);

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
