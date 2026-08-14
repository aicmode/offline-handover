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
     9. 外部通信のコードが 1 件も無いこと

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
  const { app, storage, html } = boot();

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

  console.log("\n■ 9. 完全オフライン（外部通信コードが無いこと）");
  check("送信APIを一切使っていない", () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for(const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /sendBeacon/,
                          /navigator\.connection/, /EventSource/, /importScripts/]){
      assert.equal(pattern.test(script), false, "禁止APIが見つかりました: " + pattern);
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

  console.log("\n" + passed + " 件すべて成功しました。");
}

run();
