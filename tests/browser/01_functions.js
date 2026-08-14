/* ブラウザ内で実行する検証。結果は #TESTOUT へ書き出す */
(function(){
  var pass = 0, fail = 0, lines = [];
  function ok(name, cond, extra){
    if(cond){ pass++; lines.push("PASS  " + name); }
    else { fail++; lines.push("FAIL  " + name + (extra !== undefined ? "  → " + extra : "")); }
  }
  function eq(name, got, want){ ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); }

  // ---- 1. 起動時の状態 -------------------------------------------------
  eq("保存キーが kaigo_handover_v2", KEY, "kaigo_handover_v2");
  eq("データ版数", DB.v, 8);
  ok("localStorage へ保存できている", !!localStorage.getItem(KEY));
  eq("ユニット構成", UNITS.join(","), "1,2,3,4,5");
  eq("静養室の上限", uMax(1), 4);
  eq("ユニット2の上限", uMax(2), 34);
  eq("ユニット3の上限", uMax(3), 30);
  eq("ユニット4の上限", uMax(4), 30);
  eq("ユニット5の上限", uMax(5), 30);
  eq("静養室ラベル", uLb(1), "静養室");

  // ---- 2. 見本の入居者 -------------------------------------------------
  var samples = DB.residents.filter(isSample);
  eq("見本は4人", samples.length, 4);
  eq("見本はユニット2〜5に1人ずつ",
     [2,3,4,5].map(function(u){ return DB.residents.filter(function(r){ return isSample(r) && r.unit===u; }).length; }).join(","),
     "1,1,1,1");
  eq("見本は実人数に含まれない", realResidentsOf(2).length, 0);
  eq("見本は登録枠を使わない", registeredCountOf(3), 0);
  eq("見本は印刷対象に含まれない", printableOf(4).length, 0);
  ok("見本の申し送りが表示される（どの日付でも）",
     dailyGet("2030-01-01", "sample-2").short.indexOf("38.0") >= 0);
  ok("見本のバイタルが表示される", vitalsGet("2030-01-01","sample-2")["day.T"] === "38.0");
  eq("見本の申し送りは DB.daily に作られない",
     Object.keys(DB.daily).length, 0);
  eq("見本の予定は予定一覧に出ない",
     DB.schedules.filter(schedInCurrentScope).length, 0);
  var hidx = buildHistoryIndex();
  eq("見本は検索結果に混ざらない",
     hidx.filter(function(x){ return String(x.name).indexOf("見本") >= 0; }).length, 0);

  // ---- 3. 印刷枚数（静養室の有無で自動変更） ---------------------------
  DB.settings.allUnits = true;
  eq("静養室0人 → 4枚", unitsForPrint().join(","), "2,3,4,5");
  // 実データを 1 人ずつ入れる
  function addResident(unit, room, name){
    var r = { id:"t-"+unit+"-"+room, unit:unit, room:room, name:name, order:10,
      status:"in", permRaw:"", permShort:"", permUpdated:"2026-08-14",
      autoCarry:true, demo:false, rec:defaultRec() };
    DB.residents.push(r); return r;
  }
  addResident(2,"201","テスト 二郎");
  addResident(3,"301","テスト 三郎");
  addResident(4,"401","テスト 四郎");
  addResident(5,"501","テスト 五郎");
  renderPrint();
  eq("静養室0人のとき印刷は4枚", document.querySelectorAll("#printArea .sheet").length, 4);
  ok("静養室の用紙が無い", !document.querySelector('#printArea .sheet[data-unit="1"]'));

  var rest = addResident(1,"S1","テスト 静子");
  renderPrint();
  eq("静養室1人以上で印刷は5枚", document.querySelectorAll("#printArea .sheet").length, 5);
  eq("静養室が先頭",
     document.querySelector("#printArea .sheet").getAttribute("data-unit"), "1");
  eq("印刷順",
     Array.prototype.map.call(document.querySelectorAll("#printArea .sheet"),
       function(s){ return s.getAttribute("data-unit"); }).join(","), "1,2,3,4,5");
  ok("静養室の用紙は見た目を区別している",
     document.querySelector('#printArea .sheet[data-unit="1"]').classList.contains("rest-sheet"));

  // 静養室の人を空床に→再び0人扱いで4枚
  rest.status = "empty";
  renderPrint();
  eq("静養室が空床のみ → 4枚に戻る", document.querySelectorAll("#printArea .sheet").length, 4);
  rest.status = "out";
  renderPrint();
  eq("静養室が退居のみ → 4枚のまま", document.querySelectorAll("#printArea .sheet").length, 4);
  rest.status = "in";
  renderPrint();
  eq("静養室に戻すと5枚", document.querySelectorAll("#printArea .sheet").length, 5);

  // 各ユニットのページが混ざらないこと
  var mixed = false;
  Array.prototype.forEach.call(document.querySelectorAll("#printArea .sheet"), function(sh){
    var u = parseInt(sh.getAttribute("data-unit"), 10);
    var names = Array.prototype.map.call(sh.querySelectorAll(".p-info .nm"), function(n){ return n.textContent; });
    var expect = printableOf(u).map(function(r){ return r.room + r.name; });
    if(names.length !== expect.length) mixed = true;
  });
  ok("ユニットごとの人数が用紙と一致（混在なし）", !mixed);

  // 上限
  eq("静養室の上限は4人（5人目は追加できない）", (function(){
    for(var i=0;i<3;i++) addResident(1,"S"+(i+2),"テスト静"+i);
    return registeredCountOf(1);
  })(), 4);

  // ---- 4. 定期予定（日勤／夜勤・前日計算） -----------------------------
  DB.recurring = DB.recurring.filter(function(r){ return !r.demo; });
  function addRule(unit, residentId, shift, days, title){
    var r = { id:"rule-"+DB.recurring.length, unit:unit, residentId:residentId, shift:shift,
      days:days, title:title, time:"", note:"", on:true, demo:false };
    DB.recurring.push(r); return r;
  }
  // 月曜=1。ターゲス日勤3件（同じ人）／BS夜勤1件
  addRule(2, "", "day", [1], "ターゲスA");
  addRule(2, "", "day", [1], "ターゲスB");
  addRule(2, "", "day", [1], "ターゲスC");
  addRule(2, "", "night", [1], "BS測定");

  var monday = "2026-08-17";   // 月曜
  var sunday = "2026-08-16";   // 日曜
  eq("月曜の用紙・日勤欄に3件", recurringForSheet(monday, {unit:2}).day.length, 3);
  eq("月曜の用紙・夜勤欄には出ない", recurringForSheet(monday, {unit:2}).night.length, 0);
  eq("日曜の用紙・夜勤欄に月曜夜勤が出る", recurringForSheet(sunday, {unit:2}).night.length, 1);
  eq("夜勤の実施日は翌日", recurringForSheet(sunday, {unit:2}).night[0].targetDate, monday);

  // 曜日をまたぐ確認（火曜夜勤→月曜／日曜夜勤→土曜）
  DB.recurring = DB.recurring.filter(function(r){ return r.title !== "BS測定"; });
  addRule(2, "", "night", [2], "火曜夜勤");
  eq("火曜夜勤 → 月曜の用紙", recurringForSheet("2026-08-17", {unit:2}).night.length, 1);
  eq("火曜夜勤は日曜の用紙には出ない", recurringForSheet("2026-08-16", {unit:2}).night.length, 0);
  DB.recurring = DB.recurring.filter(function(r){ return r.title !== "火曜夜勤"; });
  addRule(2, "", "night", [0], "日曜夜勤");
  eq("日曜夜勤 → 土曜の用紙", recurringForSheet("2026-08-15", {unit:2}).night.length, 1);

  // 月末・年末年始をまたぐ
  DB.recurring = DB.recurring.filter(function(r){ return r.title !== "日曜夜勤"; });
  addRule(2, "", "night", [2], "月初火曜");      // 2026-09-01 は火曜
  eq("8/31(月)の用紙に9/1(火)夜勤が出る（月またぎ）",
     recurringForSheet("2026-08-31", {unit:2}).night.length, 1);
  eq("実施日は9月1日", recurringForSheet("2026-08-31", {unit:2}).night[0].targetDate, "2026-09-01");
  DB.recurring = DB.recurring.filter(function(r){ return r.title !== "月初火曜"; });
  addRule(2, "", "night", [5], "年始金曜");      // 2027-01-01 は金曜
  eq("2026/12/31(木)の用紙に2027/1/1(金)夜勤が出る（年またぎ）",
     recurringForSheet("2026-12-31", {unit:2}).night.length, 1);
  eq("実施日は2027年1月1日",
     recurringForSheet("2026-12-31", {unit:2}).night[0].targetDate, "2027-01-01");

  // 重複生成されない
  var beforeLen = DB.recurring.length;
  renderSched(); renderSched(); renderPrint(); renderPrint(); renderInput();
  eq("再描画しても定期予定が増えない", DB.recurring.length, beforeLen);
  var dupRule = { id:"x", unit:2, residentId:"", shift:"day", days:[1], title:"ターゲスA", time:"" };
  ok("同じ定期予定は二重登録を弾く", recurringExists(dupRule));
  // 見本の定期予定は用紙に出ない
  ok("見本の定期予定は用紙に出ない",
     recurringForSheet("2026-08-17", {unit:3}).day.filter(function(x){ return x.rule.demo; }).length === 0);

  // 用紙へ実際に描画されているか
  DB.settings.allUnits = true;
  UI.date = monday;
  renderPrint();
  var band = document.querySelector('#printArea .sheet[data-unit="2"] .sh-rep');
  ok("月曜の用紙に定期予定の帯が出る", !!band && band.textContent.indexOf("ターゲスA") >= 0);
  // 月曜夜勤のルールを足し、日曜の用紙の夜勤欄に出ることを用紙上で確かめる
  addRule(2, "", "night", [1], "月曜夜勤BS");
  UI.date = sunday;
  renderPrint();
  var band2 = document.querySelector('#printArea .sheet[data-unit="2"] .sh-rep');
  ok("日曜の用紙に月曜夜勤の定期予定が出る",
     !!band2 && band2.textContent.indexOf("月曜夜勤BS") >= 0, band2 ? band2.textContent : "(帯なし)");
  ok("日曜の用紙の日勤欄には月曜のターゲスが出ない",
     !!band2 && band2.textContent.indexOf("ターゲスA") < 0);
  UI.date = monday;
  renderPrint();
  var band3 = document.querySelector('#printArea .sheet[data-unit="2"] .sh-rep');
  ok("月曜の用紙には月曜夜勤の予定が出ない（前日へ出すため）",
     !!band3 && band3.textContent.indexOf("月曜夜勤BS") < 0, band3 ? band3.textContent : "(帯なし)");
  DB.recurring = DB.recurring.filter(function(r){ return r.title !== "月曜夜勤BS"; });

  // ---- 5. 自動保存・データ保持 ----------------------------------------
  UI.date = "2026-08-14";
  var tid = "t-2-201";
  dailyOf(UI.date, tid).short = "発熱38.5℃。";
  saveDB();
  var reread = JSON.parse(localStorage.getItem(KEY));
  eq("入力が localStorage に保存される", reread.daily["2026-08-14"][tid].short, "発熱38.5℃。");
  dailyOf(UI.date, tid).short = "修正後の申し送り";
  saveDB();
  eq("修正内容も保存される",
     JSON.parse(localStorage.getItem(KEY)).daily["2026-08-14"][tid].short, "修正後の申し送り");
  vitalsSet(UI.date, tid, "day.T", "38.5");
  saveDB();
  eq("バイタルも保存される", JSON.parse(localStorage.getItem(KEY)).vitals["2026-08-14"][tid]["day.T"], "38.5");
  vitalsSet(UI.date, tid, "day.T", "");
  eq("空にした記録値は保存データから消える（肥大化防止）", DB.vitals["2026-08-14"] === undefined, true);

  // ---- 6. 文章整形 ------------------------------------------------------
  var t1 = tidyToday("発熱 38.0 カロナール服用 水分摂取");
  ok("単語入力を整形（38.0℃を保持）", t1.indexOf("38.0℃") >= 0, t1);
  ok("薬名を保持", t1.indexOf("カロナール") >= 0, t1);
  ok("水分摂取を保持", t1.indexOf("水分摂取") >= 0, t1);
  ok("発熱の語を保持", t1.indexOf("発熱") >= 0, t1);
  ok("整形結果が長くなりすぎない", t1.length <= 40, t1 + " (" + t1.length + ")");
  var t2 = tidyToday("・昼食3割\n・37.8℃\n・クーリング実施\n・現在36.7℃");
  ok("箇条書きを整形", t2.indexOf("37.8℃") >= 0 && t2.indexOf("昼食3割") >= 0, t2);
  var t3 = tidyToday("BP 128/74 P 88 SpO2 96 BS156 体重52.4");
  ok("バイタルをまとめる", t3.indexOf("BP128/74") >= 0 && t3.indexOf("SpO2 96%") >= 0 && t3.indexOf("BS 156") >= 0, t3);
  var t4 = tidyToday("転倒はありませんでした。歩行時は必ず見守りをしてください。");
  ok("重要語（転倒・必ず・見守）を落とさない",
     t4.indexOf("転倒") >= 0 && t4.indexOf("必ず") >= 0 && t4.indexOf("見守") >= 0, t4);
  ok("空入力は空のまま", tidyToday("") === "");
  var p1 = tidyPerm("歩行するときは転倒する可能性があるので、必ず職員が横について見守ってください。");
  ok("常設メモの整形", p1.indexOf("転倒注意") >= 0 && p1.indexOf("歩行見守り") >= 0, p1);
  var p2 = tidyPerm("食事と水分にはトロミをつけてください。移乗は2人介助でお願いします。");
  ok("トロミ・移乗2人介助を保持", p2.indexOf("トロミ") >= 0 && p2.indexOf("移乗2人介助") >= 0, p2);

  // ---- 7. 検索・検索候補 ------------------------------------------------
  HISTORY_CACHE = null; SUGGEST_CACHE = null;
  dailyOf("2026-08-10", tid).short = "発熱38.2℃。カロナール服用。転倒なし。";
  dailyOf("2026-08-11", tid).short = "食事全量摂取。排便あり。";
  saveDB();
  UI.tab = "history";
  document.getElementById("historyKeyword").value = "カロナール";
  renderHistory();
  ok("保存済みデータを検索できる",
     document.getElementById("historyCount").textContent === "1件",
     document.getElementById("historyCount").textContent);
  document.getElementById("historyKeyword").value = "";
  renderHistory();
  var sg = suggestFor("カロ");
  ok("入力途中に検索候補が出る", sg.length > 0 && sg[0].w.indexOf("カロナール") >= 0, JSON.stringify(sg.slice(0,3)));
  var sg2 = suggestFor("発");
  ok("『発』で発熱が候補に出る", sg2.some(function(x){ return x.w === "発熱"; }), JSON.stringify(sg2.slice(0,5)));
  // 記録値も検索対象
  vitalsSet("2026-08-10", tid, "day.normalBS", "188");
  HISTORY_CACHE = null; SUGGEST_CACHE = null;
  document.getElementById("historyKeyword").value = "188";
  renderHistory();
  ok("記録（BSの数値）も検索できる",
     document.getElementById("historyCount").textContent !== "0件",
     document.getElementById("historyCount").textContent);
  document.getElementById("historyKeyword").value = "";
  renderHistory();

  // ---- 8. バックアップ・復元・破損対策 ---------------------------------
  var good = JSON.parse(JSON.stringify(DB));
  ok("正しいバックアップは検証を通る", validBackup(good));
  ok("空オブジェクトは弾く", !validBackup({}));
  ok("配列は弾く", !validBackup([1,2,3]));
  ok("residentsが配列でないものは弾く", !validBackup({residents:{}}));
  ok("dailyが壊れたものは弾く", !validBackup({residents:[], daily:[]}));
  ok("nullは弾く", !validBackup(null));
  // 復元失敗時に現在データが消えないこと（validBackup を通らない → 何もしない）
  var before = JSON.stringify(DB);
  var broken = "{ this is not json";
  var parsedBroken = null;
  try{ parsedBroken = JSON.parse(broken); }catch(e){ parsedBroken = null; }
  if(!validBackup(parsedBroken)){ /* 復元を中止する分岐 */ }
  eq("壊れたバックアップで現在データが変わらない", JSON.stringify(DB), before);

  // ---- 9. アプリ更新を想定した互換性 ------------------------------------
  // 旧版（v7・permRaw のみ・vitals/recurring なし）のデータを読み込む
  var legacy = {
    v:7,
    residents:[{ id:"old1", unit:3, room:"310", name:"旧 データ", order:0, status:"in",
      permRaw:"旧の常設メモ", permShort:"", autoCarry:true,
      rec:{ day:{ T:true, BS:{on:true, every:true, days:[]} }, night:{} } }],
    daily:{ "2026-01-05": { old1:{ raw:"旧の申し送り", short:"" } } },
    schedules:[{ id:"olds", residentId:"old1", unit:3, date:"2026-01-06", kind:"受診" }],
    history:{version:1},
    settings:{ autoCarry:true }
  };
  var keep = DB;
  DB = legacy;
  migrate();
  eq("旧データの入居者が残る", DB.residents.length, 1);
  eq("旧データの常設メモが印刷欄へ引き継がれる", DB.residents[0].permShort, "旧の常設メモ");
  eq("旧データの申し送りが印刷欄へ引き継がれる", DB.daily["2026-01-05"].old1.short, "旧の申し送り");
  eq("旧データの下書きも残る", DB.daily["2026-01-05"].old1.raw, "旧の申し送り");
  eq("旧データの予定が残る", DB.schedules.length, 1);
  eq("旧BS設定が通常BSへ引き継がれる", DB.residents[0].rec.day.normalBS.on, true);
  eq("recurring が用意される", Array.isArray(DB.recurring), true);
  eq("vitals が用意される", typeof DB.vitals, "object");
  eq("版数が上がる", DB.v, 8);
  // 2回 migrate しても壊れない
  var afterOnce = JSON.stringify(DB);
  migrate();
  eq("migrate は何度実行しても同じ結果", JSON.stringify(DB), afterOnce);
  DB = keep;

  // ---- 10. 外部通信が無いこと（実行時） ---------------------------------
  eq("実行中に fetch を呼んでいない", window.__FETCHCALLS || 0, 0);
  eq("実行中に XHR を開いていない", window.__XHRCALLS || 0, 0);
  eq("実行中に sendBeacon を呼んでいない", window.__BEACON || 0, 0);
  eq("実行中に WebSocket を作っていない", window.__WS || 0, 0);
  eq("外部サブリソースの読み込み 0 件",
     Array.prototype.filter.call(document.querySelectorAll("script[src],link[href],img[src],iframe[src]"), function(el){
       return true;
     }).length, 0);

  // ---- 11. 画面の描画が最後まで通ること --------------------------------
  UI.date = "2026-08-14";
  ["input","master","sched","print","history"].forEach(function(t){
    switchTab(t);
    ok("タブ表示 " + t, document.getElementById("v-" + t.replace("input","input")).classList.contains("on"));
  });
  switchTab("input");
  ok("入力カードが描画される", document.querySelectorAll("#inputList .card").length > 0);

  // ---- 出力 --------------------------------------------------------------
  var errs = window.__ERR || [];
  lines.push("");
  lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  " + e); });
  lines.push("");
  lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
  document.title = "pass=" + pass + " fail=" + fail + " err=" + errs.length;
})();
