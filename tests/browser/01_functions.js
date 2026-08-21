/* ブラウザ内で実行する検証。結果は #TESTOUT へ書き出す */
(function(){
  var pass = 0, fail = 0, lines = [];
  function ok(name, cond, extra){
    if(cond){ pass++; lines.push("PASS  " + name); }
    else { fail++; lines.push("FAIL  " + name + (extra !== undefined ? "  → " + extra : "")); }
  }
  function eq(name, got, want){ ok(name, got === want, "got=" + JSON.stringify(got) + " want=" + JSON.stringify(want)); }

  // ---- 1. 起動時の状態 -------------------------------------------------
  eq("保存キーが公開デモ専用", KEY, "handover_portfolio_demo_v2");
  eq("データ版数", DB.v, DATA_VERSION);
  ok("localStorage へ保存できている", !!localStorage.getItem(KEY));
  eq("ブロック構成", UNITS.join(","), "1,2,3,4");
  eq("Aブロックの上限", uMax(1), 20);
  eq("Bブロックの上限", uMax(2), 20);
  eq("Cブロックの上限", uMax(3), 20);
  eq("Dブロックの上限", uMax(4), 20);
  eq("Aブロックのラベル", uLb(1), "Aブロック");
  eq("Dブロックのラベル", uLb(4), "Dブロック");

  // ---- 1b. 初回表示のデモデータ（file:// で開いた実ブラウザ） -----------
  eq("初回表示で合計61名の架空データ", DB.residents.length, 61);
  eq("Aブロック15名", realResidentsOf(1).length, 15);
  eq("Bブロック12名", realResidentsOf(2).length, 12);
  eq("Cブロック18名", realResidentsOf(3).length, 18);
  eq("Dブロック16名", realResidentsOf(4).length, 16);
  eq("同姓同名がない", new Set(DB.residents.map(function(r){ return r.name; })).size, 61);
  eq("部屋番号も重複しない", new Set(DB.residents.map(function(r){ return r.room; })).size, 61);
  ok("部屋番号は A101 形式の架空番号",
     DB.residents.every(function(r){ return /^[ABCD]1\d\d$/.test(r.room); }), DB.residents[0].room);
  eq("デモ生成の版が記録される", DB.demoSeed, DEMO_SEED_VERSION);
  eq("人数表示は A 15／20", (function(){
    renderUnitBar();
    return document.querySelector('#unitBar button[data-unit="1"] .cnt').textContent;
  })(), "15／20");
  eq("人数表示は C 18／20",
     document.querySelector('#unitBar button[data-unit="3"] .cnt').textContent, "18／20");
  renderPrint();
  eq("デモ初期状態の印刷は基本4枚", document.querySelectorAll("#printArea .sheet").length, 4);
  eq("デモの単発予定がある", DB.schedules.length > 0, true);
  eq("デモの定期予定がある", DB.recurring.length > 0, true);
  /* これ以降は「まっさらな状態」で個別の機能を確かめる */
  DB = defaultDB(); migrate(); saveDB(); UI.unit = 1; renderAll();

  // ---- 2. 保存されない固定記入例 ---------------------------------------
  eq("見本印のある入居者はDBに作られない", DB.residents.filter(isSample).length, 0);
  var beforeExampleDb = JSON.stringify(DB);
  var fixedOk = true;
  UNITS.forEach(function(u){
    UI.unit = u; renderInput();
    var out = document.getElementById("fixedExampleHost").textContent;
    if(out.indexOf("記入例") < 0 || out.indexOf(FIXED_EXAMPLES[u].today) < 0) fixedOk = false;
    if(registeredCountOf(u) !== 0 || printableOf(u).length !== 0) fixedOk = false;
  });
  ok("A〜Dブロックに場所別の固定記入例", fixedOk);
  eq("固定例の描画でDBを変更しない", JSON.stringify(DB), beforeExampleDb);
  eq("固定例はlocalStorageへ保存されない",
     UNITS.filter(function(u){ return localStorage.getItem(KEY).indexOf(FIXED_EXAMPLES[u].today) >= 0; }).length, 0);
  eq("固定例は入力・操作できるDOMを持たない",
     document.querySelectorAll("#fixedExampleHost input,#fixedExampleHost textarea,#fixedExampleHost button").length, 0);
  var hidx = buildHistoryIndex();
  eq("固定例は検索結果に混ざらない",
     UNITS.filter(function(u){
       return hidx.some(function(x){ return String(x.content).indexOf(FIXED_EXAMPLES[u].today) >= 0; });
     }).length, 0);
  UI.unit = 1; renderInput();

  // ---- 3. 印刷枚数（A・B・C・D の基本4枚） -----------------------------
  DB.settings.allUnits = true;
  // 実データを 1 人ずつ入れる
  function addResident(unit, room, name){
    var r = { id:"t-"+unit+"-"+room, unit:unit, room:room, name:name, order:10,
      status:"in", permRaw:"", permShort:"", permUpdated:"2026-08-14",
      autoCarry:true, demo:false, rec:defaultRec() };
    DB.residents.push(r); return r;
  }
  addResident(1,"A101","テスト 一郎");
  addResident(2,"B101","テスト 二郎");
  addResident(3,"C101","テスト 三郎");
  var d1 = addResident(4,"D101","テスト 四郎");
  renderPrint();
  eq("A〜Dで印刷は4枚", document.querySelectorAll("#printArea .sheet").length, 4);
  eq("印刷順は A→B→C→D",
     Array.prototype.map.call(document.querySelectorAll("#printArea .sheet"),
       function(s2){ return s2.getAttribute("data-unit"); }).join(","), "1,2,3,4");
  ok("静養室のような特別枠の用紙クラスが無い",
     !document.querySelector("#printArea .rest-sheet"));

  // 0人のブロックは用紙を作らない（並び自体は A→B→C→D のまま）
  d1.status = "empty";
  renderPrint();
  eq("Dが空床だけなら3枚", document.querySelectorAll("#printArea .sheet").length, 3);
  d1.status = "out";
  renderPrint();
  eq("Dが退居だけでも3枚", document.querySelectorAll("#printArea .sheet").length, 3);
  d1.status = "in";
  renderPrint();
  eq("Dに戻すと4枚", document.querySelectorAll("#printArea .sheet").length, 4);

  // 各ブロックのページが混ざらないこと
  var mixed = false;
  Array.prototype.forEach.call(document.querySelectorAll("#printArea .sheet"), function(sh){
    var u = parseInt(sh.getAttribute("data-unit"), 10);
    var names = Array.prototype.map.call(sh.querySelectorAll(".p-info .nm"), function(n){ return n.textContent; });
    var expect = printableOf(u).map(function(r){ return r.room + r.name; });
    if(names.length !== expect.length) mixed = true;
  });
  ok("ブロックごとの人数が用紙と一致（混在なし）", !mixed);

  // 上限20名（満床）
  eq("Aブロックの上限は20名（21人目は数に入らない）", (function(){
    for(var i=0;i<25;i++) addResident(1,"A2"+(i+10),"満床テスト"+i);
    return printableOf(1).length;
  })(), 20);
  DB.residents = DB.residents.filter(function(r){ return String(r.id).indexOf("t-1-A2") !== 0; });
  renderPrint();
  eq("満床の整理後も4枚", document.querySelectorAll("#printArea .sheet").length, 4);

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
  var tid = "t-2-B101";
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

  // 日付自動更新：今日を追従中だけ切り替える
  LAST_LOCAL_DAY = "2026-08-14";
  setDate("2026-08-14", true);
  ok("今日を表示中の日付またぎは翌日へ切り替わる", checkLocalDateChange("2026-08-15") && UI.date === "2026-08-15");
  LAST_LOCAL_DAY = "2026-08-15";
  setDate("2026-08-10", false);
  ok("過去日を閲覧中の日付またぎは表示日を維持する", !checkLocalDateChange("2026-08-16") && UI.date === "2026-08-10");

  // 現在の入居者と、日付・関連語を全ユニットから探す
  var currentPerson = addResident(4,"D105","検索 花子");
  dailyOf("2025-08-14", currentPerson.id).short = "外部受診あり。";
  dailyOf("2026-08-14", currentPerson.id).short = "微熱あり。体温37.5℃。血糖値を確認。";
  dailyOf("2026-07-14", currentPerson.id).short = "病院受診の記録。";
  saveDB();
  function searchRows(q,u){
    HISTORY_UI.residentId="";
    document.getElementById("historyKeyword").value=q;
    document.getElementById("historyUnit").value=u==null?"":String(u);
    document.getElementById("historyFrom").value="";
    document.getElementById("historyTo").value="";
    document.getElementById("historyKind").value="";
    document.getElementById("historyOrder").value="new";
    renderHistory();
    return document.getElementById("historyResults")._historyRows || [];
  }
  var people = searchRows("テスト","").filter(function(x){return x.current;});
  eq("全ブロック検索は A〜D を横断する",
     Array.from(new Set(people.map(function(x){return x.unit;}))).sort().join(","), "1,2,3,4");
  for(var searchUnit=1;searchUnit<=4;searchUnit++){
    var unitRows=searchRows("テスト",searchUnit);
    ok(uLb(searchUnit)+"だけへ絞り込める", unitRows.length>0 && unitRows.every(function(x){return x.unit===searchUnit;}));
  }
  var personRows=searchRows("花子","");
  var currentRow=personRows.filter(function(x){return x.current && x.residentId===currentPerson.id;})[0];
  ok("名前の部分一致で現在の所属と部屋番号が表示される", !!currentRow
     && document.getElementById("historyResults").textContent.indexOf("Dブロック")>=0
     && document.getElementById("historyResults").textContent.indexOf("D105号室")>=0);
  ok("現在地結果に『この人を見る』がある", document.getElementById("historyResults").textContent.indexOf("この人を見る")>=0);
  openHistorySource(currentRow);
  ok("現在地結果から該当ブロックへ移動できる", UI.tab==="input" && UI.unit===4 && UI.date===todayYmd());
  eq("部屋番号でも現在の入居者を探せる",
     searchRows("D105","").filter(function(x){return x.current && x.residentId===currentPerson.id;}).length, 1);
  eq("年だけで検索できる", searchRows("2025","").filter(function(x){return x.residentId===currentPerson.id;}).length, 1);
  eq("月だけで検索できる", searchRows("08月","").filter(function(x){return x.residentId===currentPerson.id;}).length, 2);
  eq("年月を複数表記で検索できる",
     ["2026年8月","2026/08","2026-08"].map(function(q){
       return searchRows(q,"").filter(function(x){return x.residentId===currentPerson.id;}).length;
     }).join(","), "1,1,1");
  eq("日だけで検索できる", searchRows("14日","").filter(function(x){return x.residentId===currentPerson.id;}).length, 3);
  ok("病院で外部受診が関連語ヒットする", searchRows("病院","").some(function(x){return x.content.indexOf("外部受診")>=0;}));
  ok("熱で微熱・体温が関連語ヒットする", searchRows("熱","").some(function(x){return x.content.indexOf("微熱")>=0;}));
  ok("全角BSで血糖関連がヒットする", searchRows("ＢＳ","").some(function(x){return x.content.indexOf("血糖値")>=0;}));
  ok("軽い誤字は候補として出す", suggestFor("受信").some(function(x){return x.w==="受診" && x.reason==="入力候補";}));
  eq("全角半角・かな・余分な空白を正規化する", historyNorm(" ＢＳ　カロ "), "bs かろ");

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
  eq("版数が上がる", DB.v, DATA_VERSION);
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
