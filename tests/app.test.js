"use strict";

/* =========================================================
   申し送りメーカー（ポートフォリオ公開デモ版）の自動テスト
   ---------------------------------------------------------
   index.html のインラインスクリプトをそのまま読み込んで実行し、
   ブラウザなしで次を確認する（依存パッケージなし）。

     0. 初回表示の架空デモデータ（A15 / B12 / C18 / D16 ＝ 61名）
     1. ブロック構成（A〜D・各20名）・登録上限
     2. 印刷対象が A・B・C・D の基本4枚になること
     3. 保存されない固定記入例が実データに混ざらないこと
     4. 定期予定（日勤＝当日 / 夜勤＝前日の用紙）と、月末・年末年始をまたぐ計算
     5. 定期予定が重複生成されないこと
     6. 自動保存と、アプリ更新を想定した旧データの移行（データを失わない）
     7. バックアップの形式検証（壊れたファイルで既存データを消さない）
     8. オフライン文章整形
     9. 外部通信のコードが 1 件も無いこと（CSP 宣言・Blob の用途を含む）
    10. すべての入力欄で spellcheck / autocomplete などを止めていること
    11. 入力文字がコードとして実行されないこと（XSS / HTMLインジェクション）
    12. 不正なバックアップ・壊れた保存データで既存データを失わないこと

     実行： node tests/app.test.js
   ========================================================= */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/* ---------- 最小限の DOM 代替（描画結果ではなく状態を検証する） ---------- */
class ClassList {
  constructor(){ this.values = new Set(); }
  add(...n){ n.forEach((v) => this.values.add(v)); }
  remove(...n){ n.forEach((v) => this.values.delete(v)); }
  contains(n){ return this.values.has(n); }
  toggle(n, force){
    if(force === undefined) force = !this.values.has(n);
    if(force) this.values.add(n); else this.values.delete(n);
    return force;
  }
}
class FakeElement {
  constructor(id){
    this.id = id || "";
    this.classList = new ClassList();
    this.listeners = {};
    this.style = { setProperty(){} };
    this.innerHTML = "";
    this.textContent = "";
    this.value = id === "schedCleanupAge" ? "180" : "";
    this.checked = false;
    this.disabled = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.scrollHeight = 0;
    this.attrs = {};
  }
  addEventListener(type, fn){ (this.listeners[type] ||= []).push(fn); }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  appendChild(){}
  removeChild(){}
  click(){}
  focus(){}
  closest(){ return null; }
  setAttribute(name, value){ this.attrs[name] = String(value); }
  getAttribute(name){ return this.attrs[name] == null ? null : this.attrs[name]; }
  hasAttribute(name){ return this.attrs[name] != null; }
  removeAttribute(name){ delete this.attrs[name]; }
}

function boot(){
  const elements = new Map();
  const element = (id) => {
    if(!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const document = {
    body: element("body"),
    documentElement: element("html"),
    getElementById: element,
    querySelector(sel){ return element("selector:" + sel); },
    querySelectorAll(){ return []; },
    addEventListener(){},
    createElement(tag){ return new FakeElement(tag); }
  };
  const storage = new Map();
  const localStorage = {
    getItem(k){ return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v){ storage.set(k, String(v)); },
    removeItem(k){ storage.delete(k); }
  };
  const window = { addEventListener(){}, print(){} };
  const sandbox = {
    console, document, localStorage, window,
    navigator: { sendBeacon: undefined },
    Blob: global.Blob,
    URL: { createObjectURL(){ return "blob:test"; }, revokeObjectURL(){} },
    FileReader: function(){},
    setTimeout(){ return 1; }, clearTimeout(){},
    confirm(){ return true; }, alert(){},
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN
  };
  window.document = document;
  window.localStorage = localStorage;

  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "index.html にインラインスクリプトが必要です");
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "index.html" });
  return { app: sandbox, elements, storage, html };
}

let passed = 0;
function check(name, fn){
  fn();
  passed++;
  console.log("  ok  " + name);
}

/* ---------- 実データの入居者を作る補助 ---------- */
function makeResident(app, unit, room, name, extra){
  const r = Object.assign({
    id: "t-" + unit + "-" + room, unit, room, name, order: 10, status: "in",
    permRaw: "", permShort: "", permUpdated: "2026-08-14",
    autoCarry: true, demo: false, rec: app.defaultRec()
  }, extra || {});
  app.DB.residents.push(r);
  return r;
}
function addRule(app, unit, residentId, shift, days, title){
  const rule = {
    id: "rule-" + app.DB.recurring.length, unit, residentId, shift, days,
    title, time: "", note: "", on: true, demo: false
  };
  app.DB.recurring.push(rule);
  return rule;
}

function run(){
  const { app, elements, storage, html } = boot();
  const startedDate = app.UI.date;
  const startedToday = app.todayYmd();

  console.log("\n■ 0. 初回表示の架空デモデータ");
  check("初回表示で A15 / B12 / C18 / D16 ＝ 61名が生成される", () => {
    assert.equal(app.DB.residents.length, 61);
    assert.equal(app.realResidentsOf(1).length, 15);
    assert.equal(app.realResidentsOf(2).length, 12);
    assert.equal(app.realResidentsOf(3).length, 18);
    assert.equal(app.realResidentsOf(4).length, 16);
  });
  check("生成された61名は同姓同名がなく、全員が架空の氏名", () => {
    const names = app.DB.residents.map((r) => r.name);
    assert.equal(new Set(names).size, 61, "同姓同名がない");
    assert.ok(names.every((n) => /^[^\s]+\s[^\s]+$/.test(n)), "姓と名がそろっている");
  });
  check("部屋番号は A101〜 の汎用番号で重複しない", () => {
    const rooms = app.DB.residents.map((r) => r.room);
    assert.equal(new Set(rooms).size, 61);
    assert.ok(rooms.every((x) => /^[ABCD]1\d\d$/.test(x)), rooms.slice(0, 3).join(","));
    assert.equal(app.realResidentsOf(1)[0].room, "A101");
    assert.equal(app.realResidentsOf(3)[17].room, "C118");
  });
  check("デモ入居者は通常データ（見本印を持たない＝編集も印刷もできる）", () => {
    assert.equal(app.DB.residents.filter(app.isSample).length, 0);
    assert.ok(app.DB.residents.every((r) => r.demo === false));
  });
  check("デモの申し送り・記録・予定は開いた日を基準に作られる", () => {
    const today = app.todayYmd();
    assert.ok(Object.keys(app.DB.daily[today] || {}).length > 0, "当日の申し送りがある");
    assert.ok(Object.keys(app.DB.daily[app.prevDate(today)] || {}).length > 0, "前日ぶんもある");
    assert.ok(Object.keys(app.DB.vitals[today] || {}).length > 0, "当日の記録値がある");
    assert.ok(app.DB.schedules.some((x) => x.date > today), "これからの予定がある");
    assert.ok(app.DB.schedules.some((x) => x.date < today), "過ぎた予定もある");
    assert.ok(app.DB.recurring.some((x) => x.shift === "day"), "日勤の定期予定がある");
    assert.ok(app.DB.recurring.some((x) => x.shift === "night"), "夜勤の定期予定がある");
    assert.ok(app.DB.recurring.some((x) => !x.residentId), "ブロック全体の定期予定がある");
  });
  check("記録項目は人によって違う（Adaptive印刷の差が出る）", () => {
    const counts = app.DB.residents.map((r) => app.fieldDefsFor(r.rec, "day", app.todayYmd()).length);
    assert.ok(new Set(counts).size >= 3, "記録欄の数が数種類に分かれる：" + Array.from(new Set(counts)).join(","));
  });
  check("再読み込みしても61名が重複しない（demoSeed で1回だけ生成）", () => {
    assert.equal(app.DB.demoSeed, app.DEMO_SEED_VERSION);
    const before = JSON.parse(storage.get(app.KEY)).residents.length;
    app.loadDB();                                  // 保存済みデータを読み直す＝再読み込み相当
    assert.equal(app.DB.residents.length, before);
    assert.equal(app.DB.residents.length, 61);
  });
  check("デモを初期状態へ戻すと、また61名の架空データになる", () => {
    app.DB.residents = app.DB.residents.slice(0, 3);
    assert.equal(app.seedDemoData(), 61);
    assert.equal(app.realResidentsOf(2).length, 12);
  });

  /* ここから先は「まっさらな状態」を前提に検査するため、デモデータを外す */
  app.DB = app.defaultDB();
  app.migrate();
  app.saveDB();

  console.log("\n■ 1. ブロック構成と上限");
  check("保存キーは公開デモ専用（実運用版の領域と分離する）", () => {
    assert.equal(app.KEY, "handover_portfolio_demo_v2");
    assert.equal(html.includes("kaigo_handover_v2"), false, "旧実運用キーは1件も残さない");
  });
  check("A〜D の4ブロック構成", () => {
    assert.equal(app.UNITS.join(","), "1,2,3,4");
    assert.equal(app.uLb(1), "Aブロック");
    assert.equal(app.uLb(2), "Bブロック");
    assert.equal(app.uLb(3), "Cブロック");
    assert.equal(app.uLb(4), "Dブロック");
  });
  check("上限は A〜D すべて20名（合計80名）", () => {
    let total = 0;
    for(const u of app.UNITS){ assert.equal(app.uMax(u), 20, app.uLb(u)); total += app.uMax(u); }
    assert.equal(total, 80);
  });
  check("上限はブロック定義1か所で変更できる", () => {
    const def = app.UNIT_DEFS.find((d) => d.id === 3);
    def.max = 21;
    assert.equal(app.uMax(3), 21);
    def.max = 20;
  });
  check("旧「静養室」「ユニット2〜5」の仕様がコードに残っていない", () => {
    assert.equal(html.includes("静養"), false);
    assert.equal(/ユニット/.test(html), false);
    assert.equal(typeof app.isRestUnit, "undefined");
    assert.equal(typeof app.restRoomOccupied, "undefined");
    assert.equal(html.includes("rest-sheet"), false);
    assert.ok(app.UNIT_DEFS.every((d) => d.rest === undefined));
  });
  check("入力画面の追加フォームは A〜D 各ブロックで共通", () => {
    for(const unit of app.UNITS){
      app.UI.unit = unit;
      app.INPUT_ADD_UNIT = unit;
      app.renderInput();
      const form = elements.get("inputAddBox").innerHTML;
      assert.ok(form.includes('data-add-field="room"'), app.uLb(unit));
      assert.ok(form.includes('data-add-field="name"'), app.uLb(unit));
      assert.ok(form.includes('data-add-field="permShort"'), app.uLb(unit));
      assert.ok(form.includes("追加して入力を始める"), app.uLb(unit));
    }
    app.INPUT_ADD_UNIT = 0;
  });
  check("0人のブロックでも入力画面から同じ保存形式で直接追加できる", () => {
    app.UI.unit = 1;
    const added = app.addResident(1, { room:"A120", name:"追加 テスト", permShort:"転倒注意" });
    assert.ok(added);
    assert.equal(app.registeredCountOf(1), 1);
    assert.equal(added.rec.day.T.on, false);   // 新規は全項目OFFから始める
    const saved = JSON.parse(storage.get(app.KEY));
    assert.equal(saved.residents.find((r) => r.id === added.id).permShort, "転倒注意");
    app.DB.residents = app.DB.residents.filter((r) => r.id !== added.id);
    app.saveDB();
  });
  check("満員時の案内は場所名と上限を明記する", () => {
    assert.equal(app.residentLimitMessage(1).includes("Aブロックは20名までです"), true);
    assert.equal(app.residentLimitMessage(4).includes("Dブロックは20名までです"), true);
  });

  console.log("\n■ 2. 保存されない固定記入例");
  check("A〜D の各ブロックに場所別の固定記入例がある", () => {
    assert.equal(Object.keys(app.FIXED_EXAMPLES).sort().join(","), "1,2,3,4");
    for(const u of app.UNITS){
      app.UI.unit = u;
      app.renderInput();
      const out = elements.get("fixedExampleHost").innerHTML;
      assert.ok(out.includes("記入例を見る"), app.uLb(u));
      assert.ok(out.includes(app.FIXED_EXAMPLES[u].room), app.uLb(u));
      assert.ok(out.includes(app.FIXED_EXAMPLES[u].today), app.uLb(u));
      assert.ok(!out.includes("<input") && !out.includes("<textarea") && !out.includes("data-id="));
    }
  });
  check("入力タブと入居者タブが同じ固定記入例を使う（二重管理をしない）", () => {
    for(const u of app.UNITS){
      app.UI.unit = u;
      app.renderInput();
      app.renderMaster();
      const inHtml = elements.get("fixedExampleHost").innerHTML;
      const mHtml  = elements.get("masterFixedExampleHost").innerHTML;
      assert.equal(mHtml, inHtml, app.uLb(u));
      assert.ok(mHtml.includes(app.FIXED_EXAMPLES[u].perm), app.uLb(u));
      assert.ok(!mHtml.includes("<input") && !mHtml.includes("data-a=") && !mHtml.includes("data-f="));
      /* 一覧（表）の中には入れない＝並び替え・検索・人数に関われない */
      assert.equal(elements.get("masterBody").innerHTML.includes("fixed-example"), false);
    }
  });
  check("固定記入例はDB・localStorage・バックアップ対象に存在しない", () => {
    const dbJson = JSON.stringify(app.DB);
    const saved = storage.get(app.KEY);
    for(const u of app.UNITS){
      assert.equal(dbJson.includes(app.FIXED_EXAMPLES[u].today), false);
      assert.equal(saved.includes(app.FIXED_EXAMPLES[u].today), false);
    }
    assert.equal(app.DB.residents.filter(app.isSample).length, 0);
  });
  check("固定記入例は実人数・登録枠・印刷に含まれない", () => {
    for(const u of app.UNITS){
      assert.equal(app.realResidentsOf(u).length, 0);
      assert.equal(app.registeredCountOf(u), 0);
      assert.equal(app.printableOf(u).length, 0);
    }
  });
  check("固定記入例を描画しても日次・バイタルデータを作らない", () => {
    assert.equal(Object.keys(app.DB.daily).length, 0);
    assert.equal(Object.keys(app.DB.vitals).length, 0);
  });
  check("固定記入例は検索結果・予定一覧に出ない", () => {
    app.HISTORY_CACHE = null;
    const idx = app.buildHistoryIndex();
    for(const u of app.UNITS) assert.equal(idx.some((x) => String(x.content).includes(app.FIXED_EXAMPLES[u].today)), false);
    assert.equal(app.DB.schedules.filter(app.schedInCurrentScope).length, 0);
  });

  console.log("\n■ 2a. 見本印（demo）の扱い");
  check("demo印のある入居者だけを実データから外す", () => {
    assert.equal(app.isSample({ id:"r1", demo:true }), true, "demo印");
    assert.equal(app.isSample({ id:"r1", demo:false }), false, "実データ");
    assert.equal(app.isSample({ id:"r1" }), false, "印なしは実データ");
    assert.equal(app.isSample(null), false);
  });
  check("旧「静養室版」の見本整理コードは残っていない", () => {
    assert.equal(typeof app.removeLegacySeedSamples, "undefined");
    assert.equal(typeof app.legacySampleReasons, "undefined");
    assert.equal(typeof app.isLegacySampleId, "undefined");
    assert.equal(html.includes("LEGACY_SAMPLE"), false);
  });
  check("addResident が作る入居者には見本印が付かない", () => {
    const r = app.addResident(1, { room:"A199", name:"印なし テスト" });
    assert.equal(r.demo, false);
    assert.equal(app.isSample(r), false);
    app.DB.residents = app.DB.residents.filter((x) => x.id !== r.id);
    app.saveDB();
  });

  console.log("\n■ 2b. 入居者一覧の表示ソート");
  const sortRows = [
    makeResident(app, 1, "A110", "さとう", {id:"sort-a", order:3, updatedAt:100}),
    makeResident(app, 1, "A102", "あべ",   {id:"sort-b", order:1, updatedAt:300}),
    makeResident(app, 1, "A101", "いとう", {id:"sort-c", order:2, updatedAt:200})
  ];
  check("部屋番号順・五十音順・追加順・最近編集順が表示だけを変える", () => {
    const dbOrder = app.DB.residents.map((r) => r.id).join(",");
    app.DB.settings.residentSort = "room";
    assert.equal(app.sortedResidentsForDisplay(1).map((r) => r.id).join(","), "sort-c,sort-b,sort-a");
    app.DB.settings.residentSort = "name";
    assert.equal(app.sortedResidentsForDisplay(1).map((r) => r.id).join(","), "sort-b,sort-c,sort-a");
    app.DB.settings.residentSort = "added";
    assert.equal(app.sortedResidentsForDisplay(1).map((r) => r.id).join(","), "sort-a,sort-b,sort-c");
    app.DB.settings.residentSort = "updated";
    assert.equal(app.sortedResidentsForDisplay(1).map((r) => r.id).join(","), "sort-b,sort-c,sort-a");
    assert.equal(app.DB.residents.map((r) => r.id).join(","), dbOrder, "DB配列順は不変");
  });
  check("既存日時なしは追加順の逆順へ自然にフォールバックする", () => {
    delete sortRows[0].updatedAt; delete sortRows[1].updatedAt; delete sortRows[2].updatedAt;
    app.DB.settings.residentSort = "updated";
    assert.equal(app.sortedResidentsForDisplay(1).map((r) => r.id).join(","), "sort-c,sort-b,sort-a");
  });
  check("主要データの編集時刻で最近編集順が更新される", () => {
    app.touchResident(sortRows[0]);
    assert.equal(app.sortedResidentsForDisplay(1)[0].id, "sort-a");
  });
  check("ソート設定は軽量なsettings値として保存される", () => {
    app.DB.settings.residentSort = "name";
    app.saveDB();
    assert.equal(JSON.parse(storage.get(app.KEY)).settings.residentSort, "name");
  });
  check("同じソート処理が A〜D すべてのブロックで動く", () => {
    app.DB.settings.residentSort = "room";
    for(const u of app.UNITS){
      const a = makeResident(app, u, "部屋10", "後", {id:"all-sort-"+u+"-a"});
      const b = makeResident(app, u, "部屋02", "先", {id:"all-sort-"+u+"-b"});
      const ids = app.sortedResidentsForDisplay(u).filter((r) => r.id.startsWith("all-sort-")).map((r) => r.id);
      assert.equal(ids.join(","), b.id+","+a.id, app.uLb(u));
    }
    app.DB.residents = app.DB.residents.filter((r) => !r.id.startsWith("all-sort-"));
  });
  app.DB.residents = app.DB.residents.filter((r) => !r.id.startsWith("sort-"));
  app.DB.settings.residentSort = "manual";

  console.log("\n■ 3. 印刷対象（A・B・C・D の基本4枚）");
  makeResident(app, 1, "A101", "テスト 一郎");
  makeResident(app, 2, "B101", "テスト 二郎");
  makeResident(app, 3, "C101", "テスト 三郎");
  makeResident(app, 4, "D101", "テスト 四郎");
  check("印刷は A→B→C→D の4枚構成", () => {
    assert.equal(app.unitsForPrint().join(","), "1,2,3,4");
  });
  check("0名のブロックがあっても並びは変わらず、用紙だけ作らない", () => {
    const removed = app.DB.residents.filter((r) => r.unit === 2);
    app.DB.residents = app.DB.residents.filter((r) => r.unit !== 2);
    assert.equal(app.unitsForPrint().join(","), "1,2,3,4", "並びは定義どおり");
    assert.equal(app.printableOf(2).length, 0, "0名のブロックは印刷対象0名");
    app.DB.residents = app.DB.residents.concat(removed);
  });
  check("空床・退居・見本は印刷人数に含めない", () => {
    const r = makeResident(app, 1, "A102", "テスト 空床", {id:"t-empty", status:"empty"});
    const o = makeResident(app, 1, "A103", "テスト 退居", {id:"t-out", status:"out", leftAt:"2026-08-01"});
    const d = makeResident(app, 1, "A104", "テスト 見本", {id:"t-demo", demo:true});
    assert.equal(app.printableOf(1).some((x) => x.id === r.id || x.id === o.id || x.id === d.id), false);
    app.DB.residents = app.DB.residents.filter((x) => !["t-empty","t-out","t-demo"].includes(x.id));
  });
  check("印刷対象は上限20名を超えない（満床でも確認）", () => {
    for(let i = 0; i < 30; i++) makeResident(app, 2, "B2-" + i, "多数 " + i);
    assert.ok(app.realResidentsOf(2).length > 20);
    assert.equal(app.printableOf(2).length, 20);
    app.DB.residents = app.DB.residents.filter((r) => !r.id.startsWith("t-2-B2-"));
  });

  console.log("\n■ 4. 定期予定（日勤＝当日 / 夜勤＝前日の用紙）");
  app.DB.recurring = app.DB.recurring.filter((r) => !r.demo);
  addRule(app, 2, "", "day", [1], "ターゲスA");
  addRule(app, 2, "", "day", [1], "ターゲスB");
  addRule(app, 2, "", "day", [1], "ターゲスC");
  addRule(app, 2, "", "night", [1], "BS測定");
  const MON = "2026-08-17", SUN = "2026-08-16";
  check("月曜・日勤3件は月曜の用紙の日勤欄", () => {
    assert.equal(app.recurringForSheet(MON, { unit: 2 }).day.length, 3);
  });
  check("月曜・夜勤は月曜の用紙には出ない", () => {
    assert.equal(app.recurringForSheet(MON, { unit: 2 }).night.length, 0);
  });
  check("月曜・夜勤は日曜の用紙の夜勤欄に出る", () => {
    const got = app.recurringForSheet(SUN, { unit: 2 });
    assert.equal(got.night.length, 1);
    assert.equal(got.night[0].targetDate, MON);
    assert.equal(got.day.length, 0);
  });
  check("火曜夜勤→月曜／日曜夜勤→土曜", () => {
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "BS測定");
    addRule(app, 2, "", "night", [2], "火曜夜勤");
    assert.equal(app.recurringForSheet("2026-08-17", { unit: 2 }).night.length, 1);
    assert.equal(app.recurringForSheet("2026-08-16", { unit: 2 }).night.length, 0);
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "火曜夜勤");
    addRule(app, 2, "", "night", [0], "日曜夜勤");
    assert.equal(app.recurringForSheet("2026-08-15", { unit: 2 }).night.length, 1);
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "日曜夜勤");
  });
  check("月をまたぐ夜勤（8/31月 → 9/1火）", () => {
    addRule(app, 2, "", "night", [2], "月初火曜");
    const got = app.recurringForSheet("2026-08-31", { unit: 2 });
    assert.equal(got.night.length, 1);
    assert.equal(got.night[0].targetDate, "2026-09-01");
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "月初火曜");
  });
  check("年をまたぐ夜勤（2026/12/31木 → 2027/1/1金）", () => {
    addRule(app, 2, "", "night", [5], "年始金曜");
    const got = app.recurringForSheet("2026-12-31", { unit: 2 });
    assert.equal(got.night.length, 1);
    assert.equal(got.night[0].targetDate, "2027-01-01");
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "年始金曜");
  });
  check("うるう年をまたぐ夜勤（2028/2/28月 → 2/29火）", () => {
    addRule(app, 2, "", "night", [2], "うるう火曜");
    const got = app.recurringForSheet("2028-02-28", { unit: 2 });
    assert.equal(got.night.length, 1);
    assert.equal(got.night[0].targetDate, "2028-02-29");
    app.DB.recurring = app.DB.recurring.filter((r) => r.title !== "うるう火曜");
  });
  check("退居した人の定期予定は用紙に出ない", () => {
    const r = makeResident(app, 3, "399", "退居 予定者");
    addRule(app, 3, r.id, "day", [1], "退居者の定期");
    assert.equal(app.recurringForSheet(MON, { unit: 3 }).day.length, 1);
    r.status = "out";
    assert.equal(app.recurringForSheet(MON, { unit: 3 }).day.length, 0);
    app.DB.recurring = app.DB.recurring.filter((x) => x.title !== "退居者の定期");
    app.DB.residents = app.DB.residents.filter((x) => x.id !== r.id);
  });
  check("再計算しても定期予定が増えない（実データを作らない方式）", () => {
    const before = app.DB.recurring.length;
    for(let i = 0; i < 30; i++) app.recurringForSheet(MON, { unit: 2 });
    app.migrate();
    assert.equal(app.DB.recurring.length, before);
  });
  check("同じ内容の定期予定は二重登録できない", () => {
    assert.equal(app.recurringExists({
      id: "x", unit: 2, residentId: "", shift: "day", days: [1], title: "ターゲスA", time: ""
    }), true);
    const before = app.DB.recurring.length;
    app.DB.recurring.push({
      id: "dup", unit: 2, residentId: "", shift: "day", days: [1],
      title: "ターゲスA", time: "", note: "", on: true, demo: false
    });
    app.migrate();
    assert.equal(app.DB.recurring.length, before, "重複はmigrateで1件に統合される");
  });
  check("単発予定と定期予定は別データとして保持される", () => {
    assert.ok(Array.isArray(app.DB.schedules));
    assert.ok(Array.isArray(app.DB.recurring));
    assert.equal(app.DB.schedules.some((s) => s.title === "ターゲスA"), false);
  });

  console.log("\n■ 5. 自動保存と過去データの保持");
  check("入力が localStorage へ保存される", () => {
    app.UI.date = "2026-08-14";
    app.dailyOf("2026-08-14", "t-2-201").short = "発熱38.5℃。";
    app.saveDB();
    assert.equal(JSON.parse(storage.get(app.KEY)).daily["2026-08-14"]["t-2-201"].short, "発熱38.5℃。");
  });
  check("修正した内容も保存される", () => {
    app.dailyOf("2026-08-14", "t-2-201").short = "修正しました。";
    app.saveDB();
    assert.equal(JSON.parse(storage.get(app.KEY)).daily["2026-08-14"]["t-2-201"].short, "修正しました。");
  });
  check("日付ごとに別々に残る（過去も見返せる）", () => {
    app.dailyOf("2026-08-13", "t-2-201").short = "前日の内容";
    app.saveDB();
    const saved = JSON.parse(storage.get(app.KEY));
    assert.equal(saved.daily["2026-08-13"]["t-2-201"].short, "前日の内容");
    assert.equal(saved.daily["2026-08-14"]["t-2-201"].short, "修正しました。");
  });
  check("空にした記録値は保存データから消える（肥大化防止）", () => {
    app.vitalsSet("2026-08-14", "t-2-201", "day.T", "38.5");
    assert.equal(app.DB.vitals["2026-08-14"]["t-2-201"]["day.T"], "38.5");
    app.vitalsSet("2026-08-14", "t-2-201", "day.T", "");
    assert.equal(app.DB.vitals["2026-08-14"], undefined);
  });
  check("前日の引継ぎは入力済みの人を書き換えない", () => {
    const r = makeResident(app, 4, "402", "引継ぎ 対象");
    app.dailyOf("2026-08-13", r.id).short = "前日の申し送り";
    app.DB.settings.autoCarry = true;
    const n = app.autoCarryForDate("2026-08-14", true);
    assert.ok(n >= 1);
    assert.equal(app.DB.daily["2026-08-14"][r.id].short, "前日の申し送り");
    assert.equal(app.DB.daily["2026-08-14"]["t-2-201"].short, "修正しました。");
  });
  check("固定記入例は引継ぎの対象にならない", () => {
    assert.equal(app.DB.residents.some((r) => String(r.id).startsWith("fixed-example")), false);
  });

  console.log("\n■ 6. アプリ更新を想定した移行（データを失わない）");
  check("旧版データ（v7）を読み込んでも消えない", () => {
    const keep = app.DB;
    app.DB = {
      v: 7,
      residents: [{
        id: "old1", unit: 3, room: "310", name: "旧 データ", order: 0, status: "in",
        permRaw: "旧の常設メモ", permShort: "", autoCarry: true,
        rec: { day: { T: true, BS: { on: true, every: true, days: [] } }, night: {} }
      }],
      daily: { "2026-01-05": { old1: { raw: "旧の申し送り", short: "" } } },
      schedules: [{ id: "olds", residentId: "old1", unit: 3, date: "2026-01-06", kind: "受診" }],
      history: { version: 1 },
      settings: { autoCarry: true }
    };
    app.migrate();
    assert.equal(app.DB.residents.length, 1);
    assert.equal(app.DB.residents[0].permShort, "旧の常設メモ", "常設メモが印刷欄へ引き継がれる");
    assert.equal(app.DB.daily["2026-01-05"].old1.short, "旧の申し送り", "申し送りが印刷欄へ引き継がれる");
    assert.equal(app.DB.daily["2026-01-05"].old1.raw, "旧の申し送り", "下書きも残る");
    assert.equal(app.DB.schedules.length, 1);
    assert.equal(app.DB.residents[0].rec.day.normalBS.on, true, "旧BS設定を引き継ぐ");
    assert.ok(Array.isArray(app.DB.recurring));
    assert.equal(app.DB.v, app.DATA_VERSION);
    const once = JSON.stringify(app.DB);
    app.migrate();
    assert.equal(JSON.stringify(app.DB), once, "何度migrateしても同じ結果");
    app.DB = keep;
  });
  check("知らないブロック番号（旧ユニット5など）はAブロックへ退避", () => {
    const keep = app.DB;
    app.DB = { v: 7, residents: [{ id: "x", unit: 9, room: "9", name: "不明ブロック" },
                                 { id: "y", unit: 5, room: "512", name: "旧構成の人" }],
      daily: {}, schedules: [], history: { version: 1 }, settings: {} };
    app.migrate();
    assert.equal(app.DB.residents[0].unit, app.DEFAULT_UNIT);
    assert.equal(app.DB.residents[1].unit, app.DEFAULT_UNIT);
    assert.equal(app.DEFAULT_UNIT, 1);
    app.DB = keep;
  });
  check("復元したデータに demo 印が残っていても実データとして数えない", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const real = makeResident(app, 1, "A109", "実 入居者", {id:"keep-real"});
    makeResident(app, 1, "A102", "見本 の人", {id:"legacy-demo", demo:true});
    app.dailyOf("2026-08-14", real.id).short = "残す記録";
    app.migrate();
    assert.ok(app.residentById("keep-real"));
    assert.equal(app.dailyGet("2026-08-14", "keep-real").short, "残す記録");
    assert.equal(app.realResidentsOf(1).length, 1, "demo印の人は人数に入らない");
    assert.ok(app.residentById("legacy-demo"), "勝手に削除もしない");
    app.DB = keep;
  });

  console.log("\n■ 6a. 記録する項目（新規は全OFF・OFFにしても曜日設定を覚える）");
  check("新規入居者の記録項目は日勤・夜勤とも全部OFFで始まる", () => {
    const rec = app.defaultRec();
    for(const sh of app.REC_SHIFTS){
      for(const it of sh.items){
        assert.equal(rec[sh.k][it.k].on, false, sh.lb + it.lb);
      }
    }
    assert.equal(rec.custom.length, 0);
  });
  check("入居者ごとに別々の設定を持てる（日勤・夜勤も別）", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const a = makeResident(app, 2, "201", "設定 太郎", { id:"rec-a" });
    const b = makeResident(app, 2, "202", "設定 花子", { id:"rec-b" });
    a.rec.day.T.on = true;
    a.rec.day.BP.on = true; a.rec.day.BP.every = false; a.rec.day.BP.days = [1, 4];
    a.rec.night.BP.on = false;
    b.rec.day.SpO2.on = true;
    app.saveDB();
    app.loadDB();
    const a2 = app.residentById("rec-a"), b2 = app.residentById("rec-b");
    assert.equal(a2.rec.day.T.on, true);
    assert.equal(a2.rec.day.BP.days.join(","), "1,4", "曜日指定が残る");
    assert.equal(a2.rec.day.BP.every, false);
    assert.equal(a2.rec.night.BP.on, false, "夜勤は日勤と別に持つ");
    assert.equal(b2.rec.day.T.on, false, "他の入居者の設定は変わらない");
    assert.equal(b2.rec.day.SpO2.on, true);
    app.DB = keep;
    app.saveDB();
  });
  check("OFFにしても曜日設定を覚え、再ONで元へ戻す", () => {
    const rec = app.defaultRec();
    const bp = rec.day.BP;
    bp.on = true; bp.every = false; bp.days = [1, 4];
    app.rememberRecDays(rec, "day", "BP", bp, false);
    // OFF にする（表示・印刷からは消える）
    app.rememberRecDays(rec, "day", "BP", bp, false);
    bp.on = false;
    bp.days = [];  bp.every = true;                 // 画面上で消えた状態でも
    assert.equal(app.itemActive(bp, 1), false, "OFFの間は対象曜日でも出ない");
    // 再び ON にする
    assert.equal(app.restoreRecDays(rec, "day", "BP", bp, false), true);
    bp.on = true;
    assert.equal(bp.days.join(","), "1,4", "月・木が戻る");
    assert.equal(bp.every, false);
    assert.equal(app.itemActive(bp, 1), true);
    assert.equal(app.itemActive(bp, 2), false);
  });
  check("「毎日」も覚えて再ONで戻し、変更したら新しい設定を覚え直す", () => {
    const rec = app.defaultRec();
    const t = rec.day.T;
    t.on = true; t.every = true; t.days = [];
    app.rememberRecDays(rec, "day", "T", t, false);
    t.on = false;
    t.on = true;
    app.restoreRecDays(rec, "day", "T", t, false);
    assert.equal(t.every, true, "毎日が戻る");
    // 火・金へ変更 → 次からは火・金が戻る
    t.every = false; t.days = [2, 5];
    app.rememberRecDays(rec, "day", "T", t, false);
    t.on = false; t.days = []; t.every = true;
    app.restoreRecDays(rec, "day", "T", t, false);
    assert.equal(t.days.join(","), "2,5");
    assert.equal(t.every, false);
  });
  check("翌朝BS・ターゲスBSは曜日だけを覚える（毎日にはしない）", () => {
    const rec = app.defaultRec();
    const nb = rec.night.nextMorningBS;
    nb.on = true; nb.days = [3];
    app.rememberRecDays(rec, "night", "nextMorningBS", nb, true);
    nb.on = false; nb.days = [];
    app.restoreRecDays(rec, "night", "nextMorningBS", nb, true);
    assert.equal(nb.days.join(","), "3");
    assert.equal(nb.every, false, "曜日指定だけの項目に毎日は付けない");
  });
  check("設定メモリーは保存・再読込をまたいで残る", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const r = makeResident(app, 3, "301", "記憶 太郎", { id:"rec-mem" });
    const bp = r.rec.day.BP;
    bp.on = true; bp.every = false; bp.days = [1, 4];
    app.rememberRecDays(r.rec, "day", "BP", bp, false);
    bp.on = false;
    app.saveDB();
    app.loadDB();
    const r2 = app.residentById("rec-mem");
    assert.equal(r2.rec.day.BP.on, false, "OFFのまま（勝手にONへ戻さない）");
    assert.equal(r2.rec.mem.day.BP.d.join(","), "1,4", "曜日の覚え書きが残る");
    const st = r2.rec.day.BP;
    st.days = []; st.every = true;
    assert.equal(app.restoreRecDays(r2.rec, "day", "BP", st, false), true);
    assert.equal(st.days.join(","), "1,4");
    app.DB = keep;
    app.saveDB();
  });
  check("既存入居者の設定は勝手に全OFFにならず、いまの設定がメモリーの初期値になる", () => {
    const keep = app.DB;
    app.DB = {
      v: 8,
      residents: [{
        id: "old-rec", unit: 4, room: "401", name: "既存 太郎", order: 0, status: "in",
        permRaw: "", permShort: "", autoCarry: true,
        rec: {
          day:   { T:{on:true,every:true,days:[]}, BP:{on:true,every:false,days:[1,4]},
                   SpO2:{on:false,every:true,days:[]} },
          night: { T:{on:true,every:true,days:[]} }
        }
      }],
      daily: {}, schedules: [], recurring: [], history: { version:1 }, settings: {}
    };
    app.migrate();
    const rec = app.DB.residents[0].rec;
    assert.equal(rec.day.T.on, true, "既存のONを消さない");
    assert.equal(rec.day.BP.on, true);
    assert.equal(rec.day.BP.days.join(","), "1,4");
    assert.equal(rec.day.SpO2.on, false, "既存のOFFも変えない");
    assert.equal(rec.mem.day.BP.d.join(","), "1,4", "いまの設定をメモリーの初期値にする");
    assert.equal(rec.mem.day.T.e, true);
    assert.ok(!rec.mem.day.SpO2, "使っていない項目の覚え書きは作らない（データを増やさない）");
    assert.equal(app.DB.v, app.DATA_VERSION, "移行後はいまのデータ版数になる");
    const once = JSON.stringify(app.DB);
    app.migrate();
    assert.equal(JSON.stringify(app.DB), once, "何度migrateしてもメモリーは増えない");
    app.DB = keep;
    app.saveDB();
  });
  check("旧データは今までどおり補い、新方式のデータは足りない項目もOFFで補う", () => {
    const legacy = app.normRec({ day: { T: { on:true, every:true, days:[] } }, night: {} });
    assert.equal(legacy.day.T.on, true, "旧データの設定はそのまま");
    assert.equal(legacy.day.P.on, true, "旧データは今までどおりの初期値で補う（設定を変えない）");
    const modern = app.normRec({
      day: { T: { on:true, every:true, days:[] } }, night: {},
      mem: { day:{ T:{ e:true, d:[] } }, night:{}, custom:{} }
    });
    assert.equal(modern.day.T.on, true);
    assert.equal(modern.day.P.on, false, "新方式のデータは足りない項目を勝手にONにしない");
  });
  check("設定メモリーは項目ごとに曜日だけを持ち、履歴を貯めない", () => {
    const rec = app.defaultRec();
    const bp = rec.day.BP;
    for(let i = 0; i < 50; i++){
      bp.every = false; bp.days = [i % 7];
      app.rememberRecDays(rec, "day", "BP", bp, false);
    }
    assert.equal(Object.keys(rec.mem.day).length, 1, "何度変えても1項目1件のまま");
    assert.equal(Object.keys(rec.mem.day.BP).sort().join(","), "d,e");
    assert.equal(rec.mem.day.BP.d.join(","), String(49 % 7), "最後の設定だけを持つ");
    assert.equal(rec.mem.day.memo, undefined, "曜日を持たない項目は覚えない");
  });

  console.log("\n■ 7. バックアップの検証（壊れたファイルで消さない）");
  check("正しいバックアップだけを受け入れる", () => {
    assert.equal(app.validBackup(JSON.parse(JSON.stringify(app.DB))), true);
    assert.equal(app.validBackup(null), false);
    assert.equal(app.validBackup({}), false);
    assert.equal(app.validBackup([1, 2]), false);
    assert.equal(app.validBackup({ residents: {} }), false);
    assert.equal(app.validBackup({ residents: [], daily: [] }), false);
    assert.equal(app.validBackup({ residents: [], recurring: {} }), false);
    assert.equal(app.validBackup({ residents: [null] }), false);
  });
  check("壊れたJSONを読んでも現在のデータは変わらない", () => {
    const before = JSON.stringify(app.DB);
    let parsed = null;
    try{ parsed = JSON.parse("{壊れた"); }catch(e){ parsed = null; }
    if(app.validBackup(parsed)) throw new Error("壊れたデータを受け入れてはいけない");
    assert.equal(JSON.stringify(app.DB), before);
  });
  check("保存データ自体が壊れていても、退避してから起動する（黙って消さない）", () => {
    const keep = app.DB;
    storage.set(app.KEY, "{これは壊れたデータ");
    app.loadDB();
    assert.equal(storage.get(app.KEY + "_broken"), "{これは壊れたデータ", "壊れたデータを退避する");
    assert.ok(app.LOAD_ERROR.length > 0, "職員向けのエラー表示を用意する");
    assert.ok(Array.isArray(app.DB.residents), "起動自体は続けられる");
    app.DB = keep;
    app.saveDB();
  });

  console.log("\n■ 8. オフライン文章整形（外部AIなし）");
  check("単語だけの入力を申し送りへ整える", () => {
    const out = app.tidyToday("発熱 38.0 カロナール服用 水分摂取");
    assert.ok(out.includes("38.0℃"), out);
    assert.ok(out.includes("発熱"), out);
    assert.ok(out.includes("カロナール"), out);
    assert.ok(out.includes("水分摂取"), out);
    assert.ok(out.length <= 40, "無駄に長くしない: " + out);
  });
  check("箇条書きも整えられる", () => {
    const out = app.tidyToday("・昼食3割\n・37.8℃\n・クーリング実施\n・現在36.7℃");
    assert.ok(out.includes("昼食3割"), out);
    assert.ok(out.includes("37.8℃"), out);
  });
  check("バイタルをまとめて読みやすくする", () => {
    const out = app.tidyToday("BP 128/74 P 88 SpO2 96 BS156 体重52.4");
    assert.ok(out.includes("BP128/74"), out);
    assert.ok(out.includes("SpO2 96%"), out);
    assert.ok(out.includes("BS 156"), out);
  });
  check("安全に関わる語は絶対に落とさない", () => {
    const out = app.tidyToday("転倒はありませんでした。歩行時は必ず見守りをしてください。");
    for(const w of ["転倒", "必ず", "見守"]) assert.ok(out.includes(w), w + " が消えた: " + out);
  });
  check("医学的な判断（発熱の閾値など）を勝手に足さない", () => {
    const out = app.tidyToday("37.8℃");
    assert.ok(!out.includes("発熱あり"), out);
    assert.ok(out.includes("37.8℃"), out);
  });
  check("常設メモを短い要点へ整える", () => {
    const out = app.tidyPerm("歩行するときは転倒する可能性があるので、必ず職員が横について見守ってください。");
    assert.ok(out.includes("転倒注意"), out);
    assert.ok(out.includes("歩行見守り"), out);
    assert.ok(out.length < 30, out);
  });
  check("常設メモでも内容語（トロミ・2人介助）は落とさない", () => {
    const out = app.tidyPerm("食事と水分にはトロミをつけてください。移乗は2人介助でお願いします。");
    assert.ok(out.includes("トロミ"), out);
    assert.ok(out.includes("移乗2人介助"), out);
  });
  check("空入力は空のまま", () => {
    assert.equal(app.tidyToday(""), "");
    assert.equal(app.tidyPerm(""), "");
  });

  console.log("\n■ 9. 日付自動更新と全ブロック横断・うろ覚え検索");
  check("起動時はPC本体の今日を表示する", () => {
    assert.equal(startedDate, startedToday);
  });
  check("今日を表示中の日付またぎは翌日へ追従する", () => {
    app.LAST_LOCAL_DAY = "2026-08-14";
    app.setDate("2026-08-14", true);
    assert.equal(app.checkLocalDateChange("2026-08-15"), true);
    assert.equal(app.UI.date, "2026-08-15");
    assert.equal(app.FOLLOW_TODAY, true);
  });
  check("過去日を閲覧中の日付またぎは表示日を変えない", () => {
    app.LAST_LOCAL_DAY = "2026-08-15";
    app.setDate("2026-08-10", false);
    assert.equal(app.checkLocalDateChange("2026-08-16"), false);
    assert.equal(app.UI.date, "2026-08-10");
  });
  check("前日・翌日・今日の既存操作が動く", () => {
    const today = app.todayYmd();
    app.setDate(today, true);
    elements.get("btnPrevDay").listeners.click[0].call(elements.get("btnPrevDay"));
    assert.equal(app.UI.date, app.prevDate(today));
    elements.get("btnNextDay").listeners.click[0].call(elements.get("btnNextDay"));
    assert.equal(app.UI.date, today);
    app.setDate(app.prevDate(today), false);
    elements.get("btnToday").listeners.click[0].call(elements.get("btnToday"));
    assert.equal(app.UI.date, today);
  });

  const searchResident = makeResident(app, 4, "D105", "検索 花子");
  app.dailyOf("2025-08-14", searchResident.id).short = "外部受診あり。";
  app.dailyOf("2026-08-14", searchResident.id).short = "微熱あり、体温37.5℃。血糖値を確認。";
  app.dailyOf("2026-07-14", searchResident.id).short = "病院受診の記録。";
  app.HISTORY_CACHE = null;
  app.SUGGEST_CACHE = null;
  const kw = elements.get("historyKeyword");
  const unit = elements.get("historyUnit");
  const results = elements.get("historyResults");
  function search(q, u){
    app.HISTORY_UI.residentId = "";
    kw.value = q;
    unit.value = u == null ? "" : String(u);
    elements.get("historyFrom").value = "";
    elements.get("historyTo").value = "";
    elements.get("historyKind").value = "";
    elements.get("historyOrder").value = "new";
    app.renderHistory();
    return results._historyRows || [];
  }
  check("全ブロックが初期値で、A〜D を横断検索する", () => {
    assert.equal(unit.value, "");
    const rows = search("テスト", "").filter((x) => x.current);
    assert.deepEqual(Array.from(new Set(rows.map((x) => x.unit))).sort(), [1,2,3,4]);
  });
  check("A・B・C・D でそれぞれ絞り込める", () => {
    for(const u of [1,2,3,4]){
      const rows = search("テスト", u);
      assert.ok(rows.length > 0, "unit=" + u);
      assert.ok(rows.every((x) => x.unit === u), "unit=" + u);
    }
  });
  check("名前の部分一致と部屋番号で現在地を探せる", () => {
    let rows = search("花", "");
    assert.ok(rows.some((x) => x.current && x.residentId === searchResident.id && x.unit === 4 && x.room === "D105"));
    rows = search("D105", "");
    assert.ok(rows.some((x) => x.current && x.residentId === searchResident.id));
    assert.ok(results.innerHTML.includes("Dブロック") && results.innerHTML.includes("D105号室"));
  });
  check("現在地結果から該当ブロック・入居者へ直接移動できる", () => {
    const item = search("検索", "").find((x) => x.current && x.residentId === searchResident.id);
    app.openHistorySource(item);
    assert.equal(app.UI.unit, 4);
    assert.equal(app.UI.tab, "input");
    assert.equal(app.UI.date, app.todayYmd());
  });
  check("年・月・年月・日だけを記録日として解釈する", () => {
    let rows = search("2025", "").filter((x) => x.residentId === searchResident.id);
    assert.equal(rows.length, 1);
    rows = search("8月", "").filter((x) => x.residentId === searchResident.id);
    assert.equal(rows.length, 2);
    assert.equal(search("8", "").filter((x) => x.residentId === searchResident.id).length, 2);
    assert.equal(search("08月", "").filter((x) => x.residentId === searchResident.id).length, 2);
    assert.equal(search("2026年8月", "").filter((x) => x.residentId === searchResident.id).length, 1);
    assert.equal(search("2026/08", "").filter((x) => x.residentId === searchResident.id).length, 1);
    assert.equal(search("2026-08", "").filter((x) => x.residentId === searchResident.id).length, 1);
    assert.equal(search("２０２６年８月", "").filter((x) => x.residentId === searchResident.id).length, 1);
    assert.equal(search("14日", "").filter((x) => x.residentId === searchResident.id).length, 3);
    assert.ok(elements.get("historyInterpret").textContent.includes("日付条件"));
    assert.ok(results.innerHTML.includes("2026/08/14"), "結果に年月日を表示する");
  });
  check("関連語で受診・病院・熱・BSの記録を広げて探せる", () => {
    assert.ok(search("受診", "").some((x) => x.content.includes("外部受診")));
    assert.ok(search("病院", "").some((x) => x.content.includes("外部受診")));
    assert.ok(search("熱", "").some((x) => x.content.includes("微熱")));
    assert.ok(search("ＢＳ", "").some((x) => x.content.includes("血糖値")));
  });
  check("全角半角・大小文字・かな・余分な空白を正規化する", () => {
    assert.equal(app.historyNorm(" ＢＳ　カロ "), "bs かろ");
    assert.equal(app.historyWordMatches(app.historyNorm("カロナール"), app.historyNorm("かろ")), true);
    assert.ok(search("  検索  ", "").some((x) => x.current && x.residentId === searchResident.id));
  });
  check("軽い誤字は自動置換せず、クリック可能な候補として出す", () => {
    const got = app.suggestFor("受信");
    assert.ok(got.some((x) => x.w === "受診" && x.reason === "入力候補"));
    kw.value = "受信";
    app.applySuggest("受診");
    assert.equal(kw.value, "受診");
  });
  check("記録は新しい順を既定にする", () => {
    const rows = search("受診", "").filter((x) => !x.current);
    for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].date >= rows[i].date);
  });

  console.log("\n■ 10. 完全オフライン（外部通信コードが無いこと）");
  check("送信APIを一切使っていない", () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for(const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /sendBeacon/,
                          /navigator\.connection/, /EventSource/, /importScripts/]){
      assert.equal(pattern.test(script), false, "禁止APIが見つかりました: " + pattern);
    }
  });
  check("HTML全体（コメント・CSSを含む）にも送信APIの名前が1件も無い", () => {
    for(const pattern of [/\bfetch\b/i, /XMLHttpRequest/i, /\bWebSocket\b/i, /sendBeacon/i,
                          /EventSource/i, /importScripts/i, /indexedDB/i, /ServiceWorker/i,
                          /\bnavigator\s*\./i, /document\.write/i, /insertAdjacentHTML/i,
                          /\bouterHTML\b/i, /\beval\s*\(/]){
      assert.equal(pattern.test(html), false, "見つかりました: " + pattern);
    }
  });
  check("外部リソースを読み込む記述が無い", () => {
    for(const pattern of [/<script[^>]+src=/i, /<link[^>]+href=/i, /<img[^>]+src=/i,
                          /<iframe/i, /@import/i, /url\(\s*['"]?https?:/i]){
      assert.equal(pattern.test(html), false, "外部リソース参照が見つかりました: " + pattern);
    }
  });
  check("http:// https:// のURLが1件も無い", () => {
    const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) || [];
    assert.equal(urls.length, 0, "URLが含まれています: " + urls.join(", "));
  });
  check("解析・計測ライブラリの記述が無い", () => {
    for(const word of ["analytics", "gtag", "googletagmanager", "telemetry", "sentry", "cdn."]){
      assert.equal(html.toLowerCase().includes(word), false, word + " が含まれています");
    }
  });
  check("Blob（バックアップ保存）はPC内のファイル作成だけに使っている", () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    /* createObjectURL は exportBackup の中だけ。作った URL はすぐ revoke している */
    assert.equal((script.match(/createObjectURL/g) || []).length, 1);
    assert.equal((script.match(/revokeObjectURL/g) || []).length, 1);
    const fn = script.slice(script.indexOf("function exportBackup"),
                            script.indexOf("function validBackup"));
    assert.ok(fn.includes("createObjectURL"), "createObjectURL は exportBackup の中にある");
    assert.ok(fn.includes('a.download'), "ダウンロード（PC内保存）にだけ使っている");
    assert.ok(fn.includes("revokeObjectURL"), "使い終わったら破棄する");
  });
  check("通信を禁止する Content-Security-Policy を宣言している", () => {
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(m, "CSP の meta が必要です");
    for(const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'",
                       "base-uri 'none'", "object-src 'none'", "frame-src 'none'"]){
      assert.ok(m[1].includes(rule), "CSP に " + rule + " が必要です");
    }
    assert.equal(/https?:/.test(m[1]), false, "CSP に外部ホストを書かない");
  });

  console.log("\n■ 11. 入力内容がブラウザ経由で外へ出ないこと（spellcheck 等）");
  check("ページ全体で校正・入力予測・翻訳を止めている", () => {
    const tag = html.match(/<html[^>]*>/)[0];
    for(const attr of ['spellcheck="false"', 'writingsuggestions="false"',
                       'autocapitalize="off"', 'translate="no"']){
      assert.ok(tag.includes(attr), "<html> に " + attr + " が必要です: " + tag);
    }
  });
  check("画面に固定で置かれた入力欄すべてに spellcheck=false / autocomplete=off がある", () => {
    const body = html.slice(html.indexOf("<body>"), html.indexOf("<script>"));
    const fields = body.match(/<(input|textarea)\b[^>]*>/g) || [];
    const typed = fields.filter((f) => !/type="(checkbox|radio|file|hidden|button|submit|reset)"/.test(f));
    assert.ok(typed.length >= 8, "検査対象の入力欄が見つかりません: " + typed.length);
    for(const f of typed){
      assert.ok(/spellcheck="false"/.test(f), "spellcheck が無い: " + f);
      assert.ok(/autocomplete="off"/.test(f), "autocomplete が無い: " + f);
    }
  });
  check("後から作られる入力欄も共通処理で保護する（付け忘れ防止）", () => {
    assert.equal(typeof app.hardenInputs, "function");
    assert.equal(typeof app.hardenField, "function");
    assert.equal(typeof app.startFieldGuard, "function");
    assert.equal(app.NO_CLOUD_ATTRS.spellcheck, "false");
    assert.equal(app.NO_CLOUD_ATTRS.autocomplete, "off");
    assert.equal(app.NO_CLOUD_ATTRS.autocorrect, "off");
    assert.equal(app.NO_CLOUD_ATTRS.autocapitalize, "off");
    /* 文字入力欄には付ける／チェックボックスには付けない */
    const ta = { tagName:"TEXTAREA", attrs:{},
      getAttribute(n){ return this.attrs[n] === undefined ? null : this.attrs[n]; },
      setAttribute(n, v){ this.attrs[n] = String(v); } };
    app.hardenField(ta);
    assert.equal(ta.attrs.spellcheck, "false");
    assert.equal(ta.attrs.autocomplete, "off");
    assert.equal(ta.attrs.writingsuggestions, "false");
    const cb = Object.assign({}, ta, { tagName:"INPUT", attrs:{ type:"checkbox" } });
    app.hardenField(cb);
    assert.equal(cb.attrs.spellcheck, undefined, "チェックボックスには付けない");
  });
  check("すでに指定がある欄の設定を上書きしない", () => {
    const el = { tagName:"INPUT", attrs:{ type:"search", autocomplete:"off" },
      getAttribute(n){ return this.attrs[n] === undefined ? null : this.attrs[n]; },
      setAttribute(n, v){ this.attrs[n] = String(v); } };
    app.hardenField(el);
    assert.equal(el.attrs.autocomplete, "off");
    assert.equal(el.attrs.spellcheck, "false");
  });

  console.log("\n■ 12. 入力文字がコードとして実行されないこと（XSS / HTMLインジェクション）");
  /* 描画結果に「実行されるタグ」が混ざっていないかを見る目印 */
  const DANGER_TAG = /<\s*(script|img|svg|iframe|object|embed|link|style|meta|body|base)\b/i;
  const ATTACKS = [
    '<script>window.__x=1</script>',
    '<img src=x onerror="window.__x=1">',
    '"><b>太字</b>',
    "'><svg onload=alert(1)>",
    '<>&"\'',
    '</textarea><script>alert(1)</script>'
  ];
  check("esc() が < > & \" ' をすべて文字へ変える", () => {
    assert.equal(app.esc('<>&"\''), "&lt;&gt;&amp;&quot;&#39;");
    assert.equal(app.esc('<script>alert(1)</script>'),
      "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.equal(app.esc(null), "");
    assert.equal(app.esc(undefined), "");
  });
  check("お名前・部屋番号にタグを入れても描画結果に実行可能なタグが出ない", () => {
    const victim = makeResident(app, 2, ATTACKS[1], ATTACKS[0]);
    app.UI.unit = 2;
    app.renderInput();
    app.renderMaster();
    const inputHtml  = elements.get("inputList").innerHTML;
    const masterHtml = elements.get("masterBody").innerHTML;
    for(const out of [inputHtml, masterHtml]){
      assert.equal(DANGER_TAG.test(out), false, "タグが生のまま出ています");
      assert.ok(out.includes("&lt;script&gt;"), "文字として表示されること");
      assert.ok(out.includes("&lt;img"), "文字として表示されること");
    }
    app.DB.residents = app.DB.residents.filter((r) => r.id !== victim.id);
  });
  check("申し送り・毎日つづく大事なことにタグを入れても実行されない", () => {
    const victim = makeResident(app, 2, "301", "テスト 太郎");
    victim.permShort = ATTACKS[1];
    const d = app.dailyOf(app.UI.date, victim.id);
    d.short = ATTACKS[0];
    d.raw   = ATTACKS[5];
    app.UI.unit = 2;
    app.renderInput();
    const out = elements.get("inputList").innerHTML;
    assert.equal(DANGER_TAG.test(out), false);
    /* 入力欄を途中で閉じて抜け出していないこと（開いた数＝閉じた数） */
    assert.equal((out.match(/<textarea\b/gi) || []).length,
                 (out.match(/<\/textarea>/gi) || []).length,
                 "textarea を閉じて抜け出せない");
    app.DB.residents = app.DB.residents.filter((r) => r.id !== victim.id);
    delete app.DB.daily[app.UI.date][victim.id];
  });
  check("予定・定期予定・記録項目名にタグを入れても実行されない", () => {
    const victim = makeResident(app, 3, "302", "テスト 次郎");
    app.DB.schedules.push({
      id:"xss-sched", residentId:victim.id, unit:3, date:app.UI.date,
      kind:ATTACKS[0], start:"", end:"", title:ATTACKS[1], place:ATTACKS[2],
      dept:"", family:"", note:ATTACKS[3], h:[3, "302", "テスト 次郎"], demo:false
    });
    addRule(app, 3, victim.id, "day", [0,1,2,3,4,5,6], ATTACKS[1]);
    victim.rec.custom.push({ k:"c1", name:ATTACKS[0], unit:ATTACKS[1], size:"m",
      on:true, shift:"day", every:true, days:[] });
    app.UI.unit = 3;
    app.renderInput();
    app.renderSched();
    const form = app.schedFormHTML(app.DB.schedules[app.DB.schedules.length-1], "edit");
    const printed = app.sheetHTML(3, [victim], app.UI.date);
    for(const out of [elements.get("inputList").innerHTML, form, printed]){
      assert.equal(DANGER_TAG.test(out), false);
    }
    app.DB.schedules = app.DB.schedules.filter((s) => s.id !== "xss-sched");
    app.DB.recurring = app.DB.recurring.filter((r) => r.residentId !== victim.id);
    app.DB.residents = app.DB.residents.filter((r) => r.id !== victim.id);
  });
  check("検索の入力文字と候補が、そのままHTMLとして出ない", () => {
    const victim = makeResident(app, 2, "303", ATTACKS[1]);
    const kw = elements.get("historyKeyword");
    kw.value = ATTACKS[1];
    app.HISTORY_UI.residentId = "";
    app.renderHistory();
    const out = elements.get("historyResults").innerHTML;
    assert.equal(DANGER_TAG.test(out), false, "タグが生のまま出ています");
    kw.value = "";
    app.renderHistory();
    app.DB.residents = app.DB.residents.filter((r) => r.id !== victim.id);
  });
  check("タグを入れた文字も、保存して読み直すと元の文字のまま残る", () => {
    const victim = makeResident(app, 2, "304", ATTACKS[0]);
    app.saveDB();
    const again = JSON.parse(storage.get(app.KEY));
    const found = again.residents.filter((r) => r.id === victim.id)[0];
    assert.equal(found.name, ATTACKS[0], "入力した文字をそのまま保存する（勝手に消さない）");
    app.DB.residents = app.DB.residents.filter((r) => r.id !== victim.id);
    app.saveDB();
  });

  console.log("\n■ 13. 復元・保存データの異常系（既存データを壊さない）");
  check("バックアップに見せかけた不正データを受け付けない", () => {
    for(const bad of ["", "null", "[]", "{}", '{"residents":"x"}', '{"residents":[[]]}',
                      '{"residents":[],"daily":"x"}', '{"residents":[],"settings":[]}',
                      '{"residents":[],"schedules":{}}', "<html>", "{壊れ"]){
      let obj = null;
      try{ obj = JSON.parse(bad); }catch(e){ obj = null; }
      assert.equal(app.validBackup(obj), false, "受け入れてはいけない: " + bad);
    }
  });
  check("復元の途中で失敗しても、いまのデータへ戻せる", () => {
    const before = JSON.stringify(app.DB);
    let threw = false;
    try{
      /* 読んだ瞬間に例外を出す値＝migrate が途中で落ちるバックアップ */
      app.DB = { residents: [{ id:"x", get unit(){ throw new Error("壊れた値"); } }] };
      app.migrate();
    }catch(e){
      threw = true;
      app.DB = JSON.parse(before);       // 本体と同じ「元へ戻す」処理
    }
    assert.equal(threw, true, "壊れた値では migrate が失敗すること");
    assert.equal(JSON.stringify(app.DB), before, "元のデータへ戻る");
    app.saveDB();
    assert.equal(JSON.parse(storage.get(app.KEY)).residents.length,
                 JSON.parse(before).residents.length, "保存内容も元のまま");
  });
  check("細工したバックアップでも共通の土台（プロトタイプ）を汚さない", () => {
    const evil = JSON.parse('{"residents":[],"daily":{"__proto__":{"汚染":1}},'
      + '"vitals":{},"schedules":[],"recurring":[],"settings":{}}');
    assert.equal(app.validBackup(evil), true, "形式としては正しいので通る");
    const keep = app.DB;
    app.DB = evil;
    app.migrate();
    assert.equal(({}).汚染, undefined, "他の場所へ影響していない");
    assert.equal(Object.prototype.hasOwnProperty.call(app.DB.daily, "__proto__"), false,
      "危険なキーは取り除く");
    app.DB = keep;
    app.saveDB();
  });
  check("独自項目のIDを細工しても設定メモリーから土台を汚せない", () => {
    const keep = app.DB;
    const evil = JSON.parse('{"residents":[{"id":"evil","unit":2,"room":"201","name":"細工",'
      + '"rec":{"day":{},"night":{},"custom":[{"id":"__proto__","name":"水分量","shift":"day",'
      + '"on":true,"every":false,"days":[1]}],'
      + '"mem":{"day":{},"night":{},"custom":{"__proto__":{"e":true,"d":[1]}}}}}],'
      + '"daily":{},"vitals":{},"schedules":[],"recurring":[],"settings":{}}');
    app.DB = evil;
    app.migrate();
    const mem = app.DB.residents[0].rec.mem;
    assert.equal(({}).e, undefined, "他の場所へ影響していない");
    assert.equal(Object.prototype.hasOwnProperty.call(mem.custom, "__proto__"), false,
      "危険なIDは設定メモリーのキーにしない");
    assert.equal(mem.custom.e, undefined, "土台を差し替えて値を紛れ込ませられない");
    assert.equal(mem.custom.d, undefined);
    app.DB = keep;
    app.saveDB();
  });
  check("保存キーは常に handover_portfolio_demo_v2（退避先も別キーにする）", () => {
    assert.equal(app.KEY, "handover_portfolio_demo_v2");
    const keys = [...storage.keys()];
    for(const k of keys){
      assert.ok(k === app.KEY || k === app.KEY + "_broken", "想定外の保存キー: " + k);
    }
    assert.ok(storage.get(app.KEY), "実データは残っている");
  });

  console.log("\n■ 13a. 過ぎた「1回だけの予定」の表示（隠すだけ・消さない）");
  check("表示中の日付を基準に「過ぎた予定」を判定する（PC本体の日付では判定しない）", () => {
    const keep = app.DB, keepDate = app.UI.date;
    app.DB = app.defaultDB();
    const r = makeResident(app, 2, "201", "予定 花子", { id:"ps-1" });
    app.DB.schedules.push({ id:"one1", residentId:r.id, date:"2026-08-22", kind:"受診",
      title:"整形外科", place:"", dept:"", start:"", end:"", family:"", note:"", demo:false });
    app.UI.unit = 2;
    app.UI.date = "2026-08-22";
    assert.equal(app.schedBaseDate(), "2026-08-22");
    assert.equal(app.isPastSched(app.DB.schedules[0]), false, "その日は過ぎていない");
    app.UI.date = "2026-08-23";
    assert.equal(app.isPastSched(app.DB.schedules[0]), true, "翌日を表示中なら過ぎた扱い");
    app.UI.date = "2026-08-22";
    assert.equal(app.isPastSched(app.DB.schedules[0]), false, "戻せばまた表示対象");
    app.DB = keep; app.UI.date = keepDate; app.saveDB();
  });
  check("隠れている予定もデータ・保存内容から消えない", () => {
    const keep = app.DB, keepDate = app.UI.date;
    app.DB = app.defaultDB();
    const r = makeResident(app, 2, "201", "予定 花子", { id:"ps-2" });
    app.DB.schedules.push({ id:"one2", residentId:r.id, date:"2026-08-22", kind:"受診",
      title:"整形外科", place:"", dept:"", start:"", end:"", family:"", note:"", demo:false });
    app.UI.unit = 2;
    app.UI.date = "2026-08-23";
    app.saveDB();
    app.renderSched();                                  // 一覧を描き直しても
    assert.equal(app.DB.schedules.length, 1, "予定は残る");
    assert.ok(storage.get(app.KEY).includes("one2"), "保存データにも残る");
    assert.equal(app.pastSchedulesInScope("2026-08-23").length, 1, "隠れている件数は数えられる");
    assert.equal(app.pastSchedulesInScope("2026-08-22").length, 0);
    app.loadDB();
    assert.equal(app.DB.schedules.length, 1, "読み直しても残っている");
    app.DB = keep; app.UI.date = keepDate; app.saveDB();
  });
  check("削除（過ぎた予定の整理）は本体の日付が基準のまま＝表示とは別処理", () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.ok(script.includes("function cutoffDate(days){ return shiftDate(todayYmd()"),
      "整理（削除）は todayYmd() を基準にしている");
    assert.ok(script.includes("function schedBaseDate(){ return isYmd(UI.date)"),
      "表示は UI.date を基準にしている");
  });

  console.log("\n■ 13b. 検索履歴の消去（検索操作の状態だけを消す）");
  check("保存データに検索履歴・検索キャッシュの欄を作っていない", () => {
    const db = app.defaultDB();
    for(const k of ["searchHistory", "recentSearch", "searchWords", "lastSearch", "suggest"]){
      assert.equal(k in db, false, "DB に " + k + " を作らない");
      assert.equal(k in db.settings, false, "settings に " + k + " を作らない");
    }
  });
  check("検索履歴の消去で保存データを書きかえない・実データが残る", () => {
    const keep = app.DB, keepDate = app.UI.date;
    app.DB = app.defaultDB();
    const r = makeResident(app, 2, "201", "記録 次郎", { id:"sh-1", permShort:"移乗は2人介助" });
    app.dailyOf("2026-08-21", r.id).short = "夜間に発熱。カロナール内服。";
    app.vitalsSet("2026-08-21", r.id, "day.T", "37.8");
    app.DB.schedules.push({ id:"one3", residentId:r.id, date:"2026-08-22", kind:"受診",
      title:"整形外科", place:"", dept:"", start:"", end:"", family:"", note:"", demo:false });
    app.saveDB();
    const before = storage.get(app.KEY);
    storage.set("__other_key__", "keep-me");

    elements.get("historyKeyword").value = "発熱";
    elements.get("historyUnit").value = "2";
    elements.get("historyFrom").value = "2026-08-01";
    elements.get("historyKind").value = "申し送り";
    elements.get("historyOrder").value = "old";
    app.HISTORY_UI.residentId = r.id;
    app.buildSuggestIndex();
    assert.ok(app.SUGGEST_CACHE, "入力候補の索引ができている");

    assert.equal(app.clearSearchHistory(), true);
    assert.equal(elements.get("historyKeyword").value, "", "入力した言葉が消える");
    assert.equal(elements.get("historyUnit").value, "");
    assert.equal(elements.get("historyFrom").value, "");
    assert.equal(elements.get("historyTo").value, "");
    assert.equal(elements.get("historyKind").value, "");
    assert.equal(elements.get("historyOrder").value, "new");
    assert.equal(app.HISTORY_UI.residentId, "", "「この人だけ」が解除される");
    assert.equal(app.SUGGEST_CACHE, null, "索引は作り直しになる");

    assert.equal(storage.get(app.KEY), before, "保存データは1文字も変わらない");
    assert.equal(storage.get("__other_key__"), "keep-me", "他のキーも消さない");
    assert.equal(app.DB.residents.length, 1, "入居者が残る");
    assert.equal(app.residentById("sh-1").permShort, "移乗は2人介助");
    assert.equal(app.dailyGet("2026-08-21", "sh-1").short, "夜間に発熱。カロナール内服。");
    assert.equal(app.vitalsGet("2026-08-21", "sh-1")["day.T"], "37.8");
    assert.equal(app.DB.schedules.length, 1, "予定が残る");
    /* 消したあとでも、同じ言葉でもう一度さがせる */
    const hit = app.buildHistoryIndex().filter((x) => x.content.includes("カロナール"));
    assert.equal(hit.length >= 1, true, "記録は再検索できる");
    storage.delete("__other_key__");
    app.DB = keep; app.UI.date = keepDate; app.saveDB();
  });
  check("localStorage.clear() をどこでも使っていない", () => {
    assert.equal(/localStorage\s*\.\s*clear/.test(html), false);
    assert.equal(/\bstorage\s*\.\s*clear\s*\(/.test(html), false);
  });

  console.log("\n■ 13c. 印刷の行の高さ（Adaptive Row Height）");
  check("記録項目が少ない人ほど、必要な高さが小さく見積もられる", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const few = makeResident(app, 2, "201", "少 項目", { id:"ah-few" });
    few.rec.day.T.on = true; few.rec.day.P.on = true; few.rec.day.BP.on = true;
    const many = makeResident(app, 2, "202", "多 項目", { id:"ah-many" });
    for(const k of ["T","P","BP","SpO2","mealB","mealL","hr1","hr2","normalBS"]) many.rec.day[k].on = true;
    for(const k of ["T","mealD","nightBS"]) many.rec.night[k].on = true;
    const date = "2026-08-14";
    const nFew = app.calculateResidentPrintHeight(few, date);
    const nMany = app.calculateResidentPrintHeight(many, date);
    assert.ok(nFew.lines < nMany.lines, "少項目 < 多項目: " + nFew.lines + " / " + nMany.lines);
    assert.equal(app.getAdaptiveRowClass(nFew), "h-compact");
    const rank = (n) => app.ADAPT_ROW_CLASSES.indexOf(app.getAdaptiveRowClass(n));
    assert.ok(rank(nMany) > rank(nFew),
      "多項目のほうが大きい段階になる: " + app.getAdaptiveRowClass(nFew) + " / " + app.getAdaptiveRowClass(nMany));
    /* 段階は4つ。項目を全部ONにした人は、さらに大きい段階になる */
    const all = makeResident(app, 2, "203", "全 項目", { id:"ah-all" });
    for(const sh of app.REC_SHIFTS){ for(const it of sh.items) all.rec[sh.k][it.k].on = true; }
    assert.ok(rank(app.calculateResidentPrintHeight(all, date)) >= rank(nMany),
      app.getAdaptiveRowClass(app.calculateResidentPrintHeight(all, date)));
    /* 項目も文章も多い人は、いちばん大きい段階になる */
    all.permShort = "移乗は必ず2人介助。左上肢はBP測定不可。食事はトロミ付きで誤嚥に注意する。";
    app.dailyOf(date, all.id).short =
      "午前中に38.2℃の発熱あり。医師指示でカロナール内服。水分は日中800ml摂取。昼食は3割。";
    assert.equal(app.getAdaptiveRowClass(app.calculateResidentPrintHeight(all, date)), "h-xlarge");
    app.DB = keep; app.saveDB();
  });
  check("日勤・夜勤は多い側で高さを決める", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const r = makeResident(app, 2, "203", "夜勤 多め", { id:"ah-night" });
    for(const k of ["T","P","BP","SpO2","mealD","nightBS"]) r.rec.night[k].on = true;
    r.rec.day.T.on = true;
    const need = app.calculateResidentPrintHeight(r, "2026-08-14");
    assert.ok(need.night > need.day, "夜勤のほうが多い: " + need.day + " / " + need.night);
    assert.equal(need.shift, need.night, "多い側を採用する");
    app.DB = keep; app.saveDB();
  });
  check("申し送り・大事なこと・予定の文字量も高さに反映する", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const plain = makeResident(app, 2, "204", "短 文", { id:"ah-plain" });
    const wordy = makeResident(app, 2, "205", "長 文", { id:"ah-wordy",
      permShort:"移乗は必ず2人介助。左上肢はBP測定不可。食事はトロミ付きで誤嚥に注意する。" });
    plain.rec.day.T.on = true; wordy.rec.day.T.on = true;
    const date = "2026-08-14";
    app.dailyOf(date, wordy.id).short =
      "午前中に38.2℃の発熱あり。医師指示でカロナール内服。水分は日中800ml摂取。昼食は3割。";
    app.DB.schedules.push({ id:"one4", residentId:wordy.id, date:date, kind:"受診",
      title:"外部受診", place:"外部医療機関", dept:"",
      start:"09:30", end:"12:00", family:"あり", note:"", demo:false });
    const a = app.calculateResidentPrintHeight(plain, date);
    const b = app.calculateResidentPrintHeight(wordy, date);
    assert.ok(b.info > a.info, "長文のほうが情報欄の行数が多い: " + a.info + " / " + b.info);
    assert.ok(b.lines > a.lines);
    app.DB = keep; app.saveDB();
  });
  check("印刷の行に段階クラスが付く（CSSに4段階の定義がある）", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const r = makeResident(app, 2, "206", "行 太郎", { id:"ah-row" });
    r.rec.day.T.on = true;
    const rowHtml = app.rowHTML(r, "2026-08-14");
    assert.ok(/<div class="prow h-(compact|normal|large|xlarge)" data-need="\d+"/.test(rowHtml), rowHtml.slice(0, 90));
    for(const c of ["h-compact", "h-normal", "h-large", "h-xlarge"]){
      assert.ok(new RegExp("\\.prow\\." + c + "\\s*\\{flex-grow:").test(html), c + " の取り分がCSSにある");
      assert.ok(new RegExp("\\.prow\\." + c + "\\s*\\{max-height:").test(html), c + " の上限がCSSにある");
    }
    assert.equal(app.ADAPT_ROW_CLASSES.length, 4);
    app.DB = keep; app.saveDB();
  });
  check("1ブロック＝1枚が基本。収まらないときだけ2枚に分ける", () => {
    const keep = app.DB;
    app.DB = app.defaultDB();
    const list = [];
    for(let i=0;i<10;i++) list.push(makeResident(app, 2, "21" + i, "分割 太郎" + i, { id:"sp-" + i }));
    app.PRINT_SPLIT = {};
    assert.equal(app.printPagesOf(2, list).length, 1, "ふだんは1枚");
    app.PRINT_SPLIT = { 2: 2 };
    const pages = app.printPagesOf(2, list);
    assert.equal(pages.length, 2, "収まらないときだけ2枚");
    assert.equal(pages[0].length + pages[1].length, list.length, "全員が必ずどちらかに入る");
    app.PRINT_SPLIT = {};
    app.DB = keep; app.saveDB();
  });

  console.log("\n■ 14. 公開デモ版の表示とバージョン");
  check("固定記入例は説明用の静的内容だけで構成される", () => {
    for(const u of app.UNITS) assert.equal(app.FIXED_EXAMPLES[u].name, "記入例");
    assert.equal(Object.keys(app.FIXED_EXAMPLES).length, 4);
  });
  check("大きな警告帯ではなく、小さなデモ表示になっている", () => {
    assert.equal(typeof app.showNonLocalNotice, "undefined");
    assert.equal(html.includes('id="webnote"'), false);
    assert.equal(html.includes("showNonLocalNotice"), false);
    assert.ok(html.includes('<span class="badge demo">デモ版</span>'), "ヘッダーに小さなデモ表示がある");
    assert.ok(html.includes("表示されている人物・記録はすべて架空です"), "架空データであることを明示する");
    assert.ok(html.includes("実在する個人情報は入力しないでください"), "実データ入力を止める注意がある");
  });
  check("特定施設向けの文言が残っていない", () => {
    for(const w of ["職場", "静養", "ユニット", "実運用版"]){
      assert.equal(html.includes(w), false, "残っている語: " + w);
    }
  });
  check("アプリ版番号は1か所の定義からVer2.0と表示する", () => {
    assert.equal(app.APP_VERSION, "2.0");
    assert.equal(elements.get("footVer").textContent, "　Ver2.0");
    assert.equal((html.match(/var APP_VERSION\s*=/g) || []).length, 1);
  });
  check("アプリ版番号と保存データ版数・保存キー・デモ版数を分離する", () => {
    assert.equal(app.KEY, "handover_portfolio_demo_v2");
    assert.equal(app.DATA_VERSION, 9);
    assert.equal(app.DEMO_SEED_VERSION, 1);
    assert.equal(app.DB.app, app.APP_VERSION);
    assert.equal(app.DB.v, app.DATA_VERSION);
  });

  console.log("\n" + passed + " 件すべて成功しました。");
}

run();
