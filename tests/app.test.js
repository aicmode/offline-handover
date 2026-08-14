"use strict";

/* =========================================================
   申し送りメーカー（職場運用版）の自動テスト
   ---------------------------------------------------------
   index.html のインラインスクリプトをそのまま読み込んで実行し、
   ブラウザなしで次を確認する（依存パッケージなし）。

     1. ユニット構成・登録上限
     2. 静養室の有無で印刷対象が 4 ユニット / 5 ユニットへ自動で変わること
     3. 見本の入居者が実データに混ざらないこと
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

  console.log("\n■ 1. ユニット構成と上限");
  check("保存キーは kaigo_handover_v2（アプリ更新でも変えない）", () => {
    assert.equal(app.KEY, "kaigo_handover_v2");
  });
  check("静養室＋ユニット2〜5 の5区分", () => {
    assert.equal(app.UNITS.join(","), "1,2,3,4,5");
    assert.equal(app.uLb(1), "静養室");
    assert.equal(app.uLb(2), "ユニット2");
  });
  check("上限は 静養室4 / U2:34 / U3〜5:30", () => {
    assert.equal(app.uMax(1), 4);
    assert.equal(app.uMax(2), 34);
    assert.equal(app.uMax(3), 30);
    assert.equal(app.uMax(4), 30);
    assert.equal(app.uMax(5), 30);
  });
  check("上限はユニット定義1か所で変更できる", () => {
    const def = app.UNIT_DEFS.find((d) => d.id === 3);
    def.max = 31;
    assert.equal(app.uMax(3), 31);
    def.max = 30;
  });

  console.log("\n■ 2. 見本の入居者（実データに混ぜない）");
  check("見本は4人・ユニット2〜5に1人ずつ", () => {
    const samples = app.DB.residents.filter(app.isSample);
    assert.equal(samples.length, 4);
    assert.equal(samples.map((r) => r.unit).sort().join(","), "2,3,4,5");
  });
  check("見本は実人数・登録枠・印刷に含まれない", () => {
    for(const u of [2, 3, 4, 5]){
      assert.equal(app.realResidentsOf(u).length, 0);
      assert.equal(app.registeredCountOf(u), 0);
      assert.equal(app.printableOf(u).length, 0);
    }
  });
  check("見本の申し送りは日次データを作らない", () => {
    assert.equal(Object.keys(app.DB.daily).length, 0);
    assert.ok(app.dailyGet("2030-05-05", "sample-2").short.includes("38.0"));
  });
  check("見本は検索結果に出ない／予定一覧にも出ない", () => {
    app.HISTORY_CACHE = null;
    assert.equal(app.buildHistoryIndex().filter((x) => String(x.name).includes("見本")).length, 0);
    assert.equal(app.DB.schedules.filter(app.schedInCurrentScope).length, 0);
  });

  console.log("\n■ 3. 印刷対象（静養室の有無で自動変更）");
  makeResident(app, 2, "201", "テスト 二郎");
  makeResident(app, 3, "301", "テスト 三郎");
  makeResident(app, 4, "401", "テスト 四郎");
  makeResident(app, 5, "501", "テスト 五郎");
  check("静養室0人 → ユニット2〜5 の4枚", () => {
    assert.equal(app.unitsForPrint().join(","), "2,3,4,5");
  });
  const rest = makeResident(app, 1, "S1", "テスト 静子");
  check("静養室に1人 → 静養室を先頭にした5枚", () => {
    assert.equal(app.unitsForPrint().join(","), "1,2,3,4,5");
  });
  check("静養室が空床だけなら4枚へ戻る", () => {
    rest.status = "empty";
    assert.equal(app.unitsForPrint().join(","), "2,3,4,5");
    rest.status = "out";
    assert.equal(app.unitsForPrint().join(","), "2,3,4,5");
    rest.status = "in";
    assert.equal(app.unitsForPrint().join(","), "1,2,3,4,5");
  });
  check("見本だけの静養室は0人扱い（デモは判定に含めない）", () => {
    rest.status = "out";
    app.DB.residents.push({
      id: "sample-rest", unit: 1, room: "S9", name: "見本 静", order: -1, status: "in",
      permRaw: "", permShort: "", permUpdated: "2026-08-14",
      autoCarry: false, demo: true, rec: app.defaultRec()
    });
    assert.equal(app.unitsForPrint().join(","), "2,3,4,5");
    app.DB.residents = app.DB.residents.filter((r) => r.id !== "sample-rest");
    rest.status = "in";
  });
  check("印刷対象は上限人数を超えない", () => {
    for(let i = 0; i < 40; i++) makeResident(app, 2, "2-" + i, "多数 " + i);
    assert.equal(app.printableOf(2).length, 34);
    app.DB.residents = app.DB.residents.filter((r) => !r.id.startsWith("t-2-2-"));
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
  check("見本の入居者は引継ぎの対象にならない", () => {
    assert.equal(app.DB.daily["2026-08-14"]["sample-2"], undefined);
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
    assert.equal(app.DB.v, 8);
    const once = JSON.stringify(app.DB);
    app.migrate();
    assert.equal(JSON.stringify(app.DB), once, "何度migrateしても同じ結果");
    app.DB = keep;
  });
  check("知らないユニット番号は静養室ではなくユニット2へ退避", () => {
    const keep = app.DB;
    app.DB = { v: 7, residents: [{ id: "x", unit: 9, room: "9", name: "不明ユニット" }],
      daily: {}, schedules: [], history: { version: 1 }, settings: {} };
    app.migrate();
    assert.equal(app.DB.residents[0].unit, app.DEFAULT_UNIT);
    assert.equal(app.DEFAULT_UNIT, 2);
    app.DB = keep;
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

  console.log("\n■ 9. 日付自動更新と全ユニット横断・うろ覚え検索");
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

  const searchResident = makeResident(app, 4, "405", "山田 花子");
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
  check("全ユニットが初期値で、5区分を横断検索する", () => {
    assert.equal(unit.value, "");
    const rows = search("テスト", "").filter((x) => x.current);
    assert.deepEqual(Array.from(new Set(rows.map((x) => x.unit))).sort(), [1,2,3,4,5]);
  });
  check("静養室・ユニット2〜5でそれぞれ絞り込める", () => {
    for(const u of [1,2,3,4,5]){
      const rows = search("テスト", u);
      assert.ok(rows.length > 0, "unit=" + u);
      assert.ok(rows.every((x) => x.unit === u), "unit=" + u);
    }
  });
  check("名前の部分一致と部屋番号で現在地を探せる", () => {
    let rows = search("山", "");
    assert.ok(rows.some((x) => x.current && x.residentId === searchResident.id && x.unit === 4 && x.room === "405"));
    rows = search("405", "");
    assert.ok(rows.some((x) => x.current && x.residentId === searchResident.id));
    assert.ok(results.innerHTML.includes("ユニット4") && results.innerHTML.includes("405号室"));
  });
  check("現在地結果から該当ユニット・入居者へ直接移動できる", () => {
    const item = search("山田", "").find((x) => x.current && x.residentId === searchResident.id);
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
    assert.ok(search("  山田  ", "").some((x) => x.current && x.residentId === searchResident.id));
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
  check("保存キーは常に kaigo_handover_v2（退避先も別キーにする）", () => {
    assert.equal(app.KEY, "kaigo_handover_v2");
    const keys = [...storage.keys()];
    for(const k of keys){
      assert.ok(k === app.KEY || k === app.KEY + "_broken", "想定外の保存キー: " + k);
    }
    assert.ok(storage.get(app.KEY), "実データは残っている");
  });

  console.log("\n■ 14. 確認用の公開ページ（GitHub Pages）への注意");
  check("見本データは架空の4名だけで、実在しそうな情報を含まない", () => {
    for(const s of app.SAMPLE_DEFS) assert.ok(s.name.startsWith("見本 "), s.name);
    assert.equal(app.SAMPLE_DEFS.length, 4);
  });
  check("file:// 以外で開いたときだけ注意書きを出す仕組みがある", () => {
    assert.equal(typeof app.showNonLocalNotice, "function");
    assert.ok(html.includes('id="webnote"'), "注意書きの置き場所が必要です");
    assert.ok(html.includes("実在する入居者"), "実データを入れない旨を書く");
  });

  console.log("\n" + passed + " 件すべて成功しました。");
}

run();
