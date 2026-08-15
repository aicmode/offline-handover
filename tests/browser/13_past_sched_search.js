(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  var confirmed = [], toasted = [];
  window.confirm = function(m){ confirmed.push(String(m)); return true; };
  window.alert   = function(){};

  var D22 = "2026-08-22", D23 = "2026-08-23", D21 = "2026-08-21";

  /* 実データだけの状態にする（見本は使わない） */
  DB.residents = [];
  DB.daily = {}; DB.vitals = {}; DB.schedules = []; DB.recurring = [];
  DB.settings.showPastSched = false;
  DB.settings.showAllUnitSched = false;
  UI.unit = 2;

  var r = addResident(2, { room:"201", name:"予定 花子" });
  var r2 = addResident(2, { room:"202", name:"記録 次郎" });
  DB.schedules.push({ id:"one1", residentId:r.id, date:D22, kind:"受診",
    title:"整形外科 定期受診", place:"市立総合病院", dept:"整形外科",
    start:"09:30", end:"12:00", family:"あり", note:"送迎は長男", demo:false });
  /* 定期予定（日勤＝当日／夜勤＝前日の用紙）も一緒に置いて、壊れないことを確かめる */
  DB.recurring.push({ id:"rep1", unit:2, residentId:r.id, shift:"day",
    days:[6], title:"入浴", time:"", note:"", on:true, demo:false });      // 土曜＝8/22
  DB.recurring.push({ id:"rep2", unit:2, residentId:r.id, shift:"night",
    days:[6], title:"BS測定", time:"", note:"", on:true, demo:false });    // 土曜の夜勤＝8/21の用紙
  /* 過去の申し送り・記録も置く（検索履歴の消去で消えないことを確かめる） */
  dailyOf(D22, r.id).short = "受診へ同行。血圧は安定。";
  dailyOf(D21, r2.id).short = "夜間に発熱。カロナール内服。";
  vitalsSet(D22, r2.id, "day.T", "37.8");
  r2.permShort = "移乗は2人介助";
  saveDB();

  function schedListText(){
    switchTab("sched");
    return document.getElementById("schedList").textContent;
  }
  function inDb(id){
    for(var i=0;i<DB.schedules.length;i++){ if(DB.schedules[i].id === id) return true; }
    return false;
  }
  function inStorage(id){
    var raw = localStorage.getItem("kaigo_handover_v2") || "";
    return raw.indexOf(id) >= 0;
  }

  /* ============================================================
     1. 過ぎた「1回だけの予定」は、表示中の日付を基準に自動で隠れる
     ============================================================ */
  setDate(D22);
  ok("8/22を表示中：その日の予定が一覧に出る", schedListText().indexOf("整形外科 定期受診") >= 0);
  ok("入居者カードにも8/22の予定が出る",
     (switchTab("input"), document.getElementById("inputList").textContent.indexOf("整形外科") >= 0));

  setDate(D23);
  ok("8/23を表示中：8/22の予定は通常一覧に出ない", schedListText().indexOf("整形外科 定期受診") < 0);
  ok("隠れているだけで、予定データは残っている", inDb("one1"));
  ok("保存データ（localStorage）にも残っている", inStorage("one1"));
  ok("隠れている件数と「消えていない」ことを画面で知らせる",
     document.getElementById("schedPastSummary").textContent.indexOf("残っています") >= 0,
     document.getElementById("schedPastSummary").textContent);

  setDate(D22);
  ok("8/22へ戻すと、また表示される", schedListText().indexOf("整形外科 定期受診") >= 0);

  /* 「過ぎた予定も表示する」ON → 過去日も確認できる */
  setDate(D23);
  var cb = document.getElementById("optPastSched");
  cb.checked = true;
  cb.dispatchEvent(new Event("change", { bubbles:true }));
  ok("「過ぎた予定も表示する」ONで、8/23でも過去予定が見える",
     schedListText().indexOf("整形外科 定期受診") >= 0);
  ok("設定はそのまま保存される", DB.settings.showPastSched === true);
  cb.checked = false;
  cb.dispatchEvent(new Event("change", { bubbles:true }));
  ok("OFFに戻すと、また通常一覧から隠れる", schedListText().indexOf("整形外科 定期受診") < 0);

  /* PC本体の日付では消さない・削除処理とは分離している */
  ok("表示を切り替えても予定の件数は変わらない（削除していない）", DB.schedules.length === 1, DB.schedules.length);

  /* ============================================================
     2. 定期予定・日勤／夜勤の特殊ルールを壊していない
     ============================================================ */
  var sheet22 = recurringForSheet(D22, { unit:2 });
  var sheet21 = recurringForSheet(D21, { unit:2 });
  ok("土曜の日勤の定期予定は、その日（8/22）の用紙に出る",
     sheet22.day.length === 1 && sheet22.day[0].rule.id === "rep1", sheet22.day.length);
  ok("土曜の夜勤の定期予定は、前日（8/21）の用紙に出る",
     sheet21.night.length === 1 && sheet21.night[0].rule.id === "rep2", sheet21.night.length);
  ok("8/22の用紙に、翌日ぶんの夜勤定期は出ない", sheet22.night.length === 0, sheet22.night.length);
  ok("定期予定は日付を変えても一覧に残る（過去の扱いにしない）",
     (setDate(D23), document.getElementById("repList").textContent.indexOf("入浴") >= 0));
  /* 翌朝BS（夜勤→翌日の曜日で判定）も従来どおり */
  var recNM = defaultRec();
  recNM.night.nextMorningBS = { on:true, every:false, days:[0] };          // 日曜の朝
  var defs = fieldDefsFor(recNM, "night", D22);                            // 8/22(土)の夜勤＝翌8/23(日)
  ok("翌朝BSは、翌日の曜日で判定される（8/22の夜勤に出る）",
     defs.length === 1 && defs[0].lb.indexOf("翌朝BS") === 0, defs.length ? defs[0].lb : "-");
  ok("翌朝BSは、対象でない日には出ない", fieldDefsFor(recNM, "night", D23).length === 0);

  /* ============================================================
     3. バックアップ・復元後も過去予定が残る
     ============================================================ */
  var backup = JSON.parse(JSON.stringify(DB));
  ok("バックアップの中身に過去予定が含まれる",
     backup.schedules.filter(function(s){ return s.id === "one1"; }).length === 1);
  ok("バックアップは正しい形式として受け付けられる", validBackup(backup) === true);
  DB = backup; migrate(); saveDB(); initUIFromDB(); renderAll();
  ok("復元後も過去予定が残っている", inDb("one1") && inStorage("one1"));
  setDate(D22);
  ok("復元後、8/22へ戻せばまた表示される", schedListText().indexOf("整形外科 定期受診") >= 0);
  setDate(D23);
  ok("復元後も、8/23では通常一覧から隠れる", schedListText().indexOf("整形外科 定期受診") < 0);

  /* ============================================================
     4. 検索履歴の消去（検索操作の状態だけを消す）
     ============================================================ */
  localStorage.setItem("__sentinel_other_key__", "keep-me");
  var beforeSaved = localStorage.getItem("kaigo_handover_v2");
  var residentsBefore = DB.residents.length;
  var schedBefore = DB.schedules.length;

  switchTab("history");
  var kw = document.getElementById("historyKeyword");
  kw.value = "発熱";
  kw.dispatchEvent(new Event("input", { bubbles:true }));
  renderHistory(); showSuggest();
  HISTORY_UI.residentId = r2.id;
  document.getElementById("historyUnit").value = "2";
  document.getElementById("historyFrom").value = D21;
  document.getElementById("historyKind").value = "申し送り";
  document.getElementById("historyOrder").value = "old";
  renderHistory();
  ok("検索してから：入力・条件・この人だけ が入っている",
     kw.value === "発熱" && HISTORY_UI.residentId === r2.id);
  ok("検索してから：入力候補（索引）が作られている", !!SUGGEST_CACHE);
  ok("消去前に「発熱」の記録が見つかる",
     document.getElementById("historyResults").textContent.indexOf("カロナール") >= 0);

  /* このアプリは検索語を保存していない：保存データの中に検索履歴の欄は無い */
  ok("保存データに検索履歴の欄は無い（ボタンのために新しく作らない）",
     !("searchHistory" in DB) && !("recentSearch" in DB) &&
     !("searchHistory" in DB.settings) && !("recentSearch" in DB.settings) &&
     !("lastSearch" in DB.settings) && !("searchWords" in DB.settings),
     Object.keys(DB.settings).join(","));

  confirmed = [];
  var toastEl = document.getElementById("toast");
  document.getElementById("historyForget").dispatchEvent(new MouseEvent("click", { bubbles:true }));

  ok("確認ダイアログが出る", confirmed.length === 1 && confirmed[0].indexOf("削除されません") >= 0, confirmed[0]);
  ok("完了の知らせが出る", toastEl.textContent.indexOf("検索履歴を消去しました") >= 0, toastEl.textContent);
  ok("入力した言葉が消える", kw.value === "");
  ok("しぼり込み条件（ユニット・期間・種類・並び順）が消える",
     document.getElementById("historyUnit").value === "" &&
     document.getElementById("historyFrom").value === "" &&
     document.getElementById("historyTo").value === "" &&
     document.getElementById("historyKind").value === "" &&
     document.getElementById("historyOrder").value === "new");
  ok("「この人だけ」が解除される", HISTORY_UI.residentId === "");
  ok("入力候補の索引が作り直しになる", SUGGEST_CACHE === null);
  ok("候補の一覧が閉じている", !document.getElementById("searchSuggest").classList.contains("on"));

  /* 実データが消えていないこと */
  ok("入居者は消えていない", DB.residents.length === residentsBefore, DB.residents.length);
  ok("お名前・部屋番号・所属が残っている",
     residentById(r2.id).name === "記録 次郎" && residentById(r2.id).room === "202" && residentById(r2.id).unit === 2);
  ok("毎日つづく大事なことが残っている", residentById(r2.id).permShort === "移乗は2人介助");
  ok("申し送りが残っている", dailyGet(D21, r2.id).short === "夜間に発熱。カロナール内服。");
  ok("バイタル・記録が残っている", vitalsGet(D22, r2.id)["day.T"] === "37.8");
  ok("予定が残っている", DB.schedules.length === schedBefore && inDb("one1"));
  ok("定期予定が残っている", DB.recurring.length === 2);
  ok("記録項目の設定・メモリーが残っている", !!recOf(residentById(r2.id)));
  ok("保存データそのものが書きかわっていない",
     localStorage.getItem("kaigo_handover_v2") === beforeSaved);
  ok("localStorage.clear() は使われていない（別のキーも残る）",
     localStorage.getItem("__sentinel_other_key__") === "keep-me");
  localStorage.removeItem("__sentinel_other_key__");

  /* 消したあとでも、同じ言葉でもう一度さがせる */
  kw.value = "発熱";
  renderHistory();
  ok("消去後も、同じ言葉で記録を再検索できる",
     document.getElementById("historyResults").textContent.indexOf("カロナール") >= 0);
  showSuggest();
  ok("消去後も、入力候補は保存済みデータから作り直される", !!SUGGEST_CACHE);
  document.getElementById("historyForget").dispatchEvent(new MouseEvent("click", { bubbles:true }));

  /* 「条件をすべて消す」は確認なしのまま（従来どおり） */
  confirmed = [];
  kw.value = "受診"; renderHistory();
  document.getElementById("historyClear").dispatchEvent(new MouseEvent("click", { bubbles:true }));
  ok("「条件をすべて消す」は今までどおり確認なしで条件だけ消す",
     confirmed.length === 0 && kw.value === "");

  var errs = (window.__ERR || []);
  lines.push("console/実行時エラー: " + errs.length);
  for(var e=0;e<errs.length && e<5;e++) lines.push("  " + errs[e]);
  lines.push("外部通信: fetch=" + window.__FETCHCALLS + " xhr=" + window.__XHRCALLS
    + " beacon=" + window.__BEACON + " ws=" + window.__WS);
  lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  var pre = document.getElementById("TESTOUT");
  pre.textContent = lines.join("\n");
  pre.className = "noprint";
})();
