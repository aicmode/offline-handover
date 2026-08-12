"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ClassList {
  constructor(){ this.values = new Set(); }
  add(...names){ names.forEach((name) => this.values.add(name)); }
  remove(...names){ names.forEach((name) => this.values.delete(name)); }
  contains(name){ return this.values.has(name); }
  toggle(name, force){
    if(force === undefined) force = !this.values.has(name);
    if(force) this.values.add(name); else this.values.delete(name);
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
    this.value = id === "schedCleanupAge" ? "90" : "";
    this.checked = false;
    this.disabled = false;
  }
  addEventListener(type, fn){ (this.listeners[type] ||= []).push(fn); }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  appendChild(){}
  removeChild(){}
  click(){}
  setAttribute(name, value){ this[name] = String(value); }
  getAttribute(name){ return this[name] == null ? null : this[name]; }
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
    querySelector(selector){ return element("selector:" + selector); },
    querySelectorAll(){ return []; },
    addEventListener(){},
    createElement(tag){ return new FakeElement(tag); }
  };
  const storage = new Map();
  const localStorage = {
    getItem(key){ return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value){ storage.set(key, String(value)); },
    removeItem(key){ storage.delete(key); }
  };
  const window = { addEventListener(){}, print(){} };
  const sandbox = {
    console, document, localStorage, window,
    Blob: global.Blob,
    URL: { createObjectURL(){ return "blob:test"; }, revokeObjectURL(){} },
    FileReader: function(){},
    setTimeout(){ return 1; }, clearTimeout(){},
    confirm(){ return true; },
    Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, parseInt, isNaN
  };
  window.document = document;
  window.localStorage = localStorage;
  const htmlPath = path.join(__dirname, "..", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "inline script must exist");
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: "index.html" });
  return { sandbox, elements, storage, html };
}

function run(){
  const { sandbox: app, elements, storage, html } = boot();
  const today = app.ymd(new Date());
  const resident2 = {
    id:"resident-u2", unit:2, room:"201", name:"テスト 二郎", order:0,
    status:"in", permRaw:"常設メモ", permShort:"常設メモ", autoCarry:true, rec:app.defaultRec()
  };
  const resident3 = {
    id:"resident-u3", unit:3, room:"301", name:"テスト 三郎", order:0,
    status:"in", permRaw:"別Unitメモ", permShort:"別Unitメモ", autoCarry:true, rec:app.defaultRec()
  };
  const schedule = (id, residentId, unit, date) => ({
    id, residentId, unit, date, kind:"受診", start:"10:00", end:"",
    title:"定期受診", place:"病院", dept:"内科", family:"", note:"確認用"
  });
  const buildUnit2 = (pastCount) => {
    const list = [];
    for(let i=0;i<pastCount;i++) list.push(schedule("past-"+i, resident2.id, 2, app.shiftDate(today, -(i+1))));
    for(let i=0;i<5;i++) list.push(schedule("future-"+i, resident2.id, 2, app.shiftDate(today, i)));
    return list;
  };
  app.DB = {
    v:5, seedVer:3, residents:[resident2, resident3],
    daily:{ sentinel:{ raw:"申し送り保持", short:"保持" } }, schedules:buildUnit2(9),
    settings:{ hideEmpty:true, alwaysBack:true, allUnits:false, printWarn:false,
      showPastSched:false, showAllUnitSched:false, autoCarry:true }, demo:false
  };
  app.UI.unit = 2;
  app.SCHED_UI.cleanupDismissed = false;
  app.SCHED_UI.result = "";

  // Test A: 9 past items stay stored, but remain hidden and do not trigger a proposal.
  app.renderSched();
  assert.equal((elements.get("schedList").innerHTML.match(/class="sched-row/g) || []).length, 5);
  assert.equal(elements.get("schedPastSummary").textContent, "過去の予定：9件");
  assert.equal(elements.get("schedCleanupNotice").classList.contains("on"), false);
  assert.equal(app.DB.schedules.length, 14);

  // The optional all-Unit view is explicit and does not weaken normal Unit filtering.
  app.DB.schedules.push(schedule("u3-future", resident3.id, 3, app.shiftDate(today, 1)));
  app.renderSched();
  assert.equal((elements.get("schedList").innerHTML.match(/class="sched-row/g) || []).length, 5);
  app.DB.settings.showAllUnitSched = true;
  app.renderSched();
  assert.equal(elements.get("sUnitLabel").textContent, "全Unit");
  assert.equal((elements.get("schedList").innerHTML.match(/class="sched-row/g) || []).length, 6);
  app.DB.settings.showAllUnitSched = false;
  app.DB.schedules = app.DB.schedules.filter((item) => item.id !== "u3-future");

  // Test B/C: the tenth item triggers the bar; "view past" enables the existing option.
  app.DB.schedules.push(schedule("past-9", resident2.id, 2, app.shiftDate(today, -10)));
  app.renderSched();
  assert.equal(elements.get("schedCleanupMessage").textContent, "過去の予定が10件あります。整理しますか？");
  assert.equal(elements.get("schedCleanupNotice").classList.contains("on"), true);
  const noticeClick = elements.get("schedCleanupNotice").listeners.click[0];
  noticeClick({ target:{ closest(){ return { getAttribute(){ return "viewPast"; } }; } } });
  assert.equal(app.DB.settings.showPastSched, true);
  assert.equal(elements.get("optPastSched").checked, true);
  assert.equal((elements.get("schedList").innerHTML.match(/class="sched-row/g) || []).length, 15);
  assert.equal((elements.get("schedList").innerHTML.match(/data-a="schedEditRow"/g) || []).length, 15);

  const residentsBefore = JSON.stringify(app.DB.residents);
  const dailyBefore = JSON.stringify(app.DB.daily);

  // Test D: individual and multi-delete UI handlers remove only confirmed selections.
  app.confirm = () => true;
  const cleanupClick = elements.get("schedCleanupList").listeners.click[0];
  cleanupClick({ target:{ closest(selector){
    if(selector !== "button[data-cleanup-delete]") return null;
    return { closest(){ return { getAttribute(){ return "past-0"; } }; } };
  } } });
  assert.equal(app.DB.schedules.some((item) => item.id === "past-0"), false);
  assert.equal(app.DB.schedules.filter((item) => item.id.startsWith("future-")).length, 5);
  const selectedBoxes = ["past-1", "past-2"].map((id) => ({
    closest(){ return { getAttribute(){ return id; } }; }
  }));
  app.document.querySelectorAll = (selector) => selector === "#schedCleanupList [data-cleanup-select]:checked" ? selectedBoxes : [];
  elements.get("schedDeleteSelected").listeners.click[0]();
  app.document.querySelectorAll = () => [];
  assert.equal(app.DB.schedules.some((item) => item.id === "past-1" || item.id === "past-2"), false);
  app.deletePastScheduleIds(["future-0"]);
  assert.equal(app.DB.schedules.some((item) => item.id === "future-0"), true);
  assert.equal(JSON.stringify(app.DB.residents), residentsBefore);
  assert.equal(JSON.stringify(app.DB.daily), dailyBefore);

  // Test E/F: all-delete requires two confirmations and stays inside the current Unit scope.
  app.DB.schedules = buildUnit2(10).concat([schedule("u3-past", resident3.id, 3, app.shiftDate(today, -20))]);
  const allDelete = elements.get("schedDeleteAllPast").listeners.click[0];
  let answers = [true, false];
  const prompts = [];
  app.confirm = (message) => { prompts.push(message); return answers.shift(); };
  allDelete();
  assert.equal(app.DB.schedules.filter((item) => item.residentId === resident2.id && item.date < today).length, 10);
  answers = [true, true];
  allDelete();
  assert.deepEqual(prompts.slice(-2), ["過去の予定をすべて削除しますか？", "この操作は取り消せません。本当に削除しますか？"]);
  assert.equal(app.DB.schedules.filter((item) => item.id.startsWith("future-")).length, 5);
  assert.equal(app.DB.schedules.some((item) => item.id === "u3-past"), true);
  assert.equal(JSON.stringify(app.DB.residents), residentsBefore);
  assert.equal(JSON.stringify(app.DB.daily), dailyBefore);

  // Period deletion defaults to 90 days and leaves recent past/future entries untouched.
  assert.match(html, /<option value="90" selected>90日以前<\/option>/);
  app.DB.schedules = [
    schedule("old", resident2.id, 2, app.shiftDate(today, -100)),
    schedule("recent", resident2.id, 2, app.shiftDate(today, -2)),
    schedule("future", resident2.id, 2, app.shiftDate(today, 2))
  ];
  app.DB.settings.showPastSched = false;
  app.confirm = () => true;
  app.document.getElementById("schedCleanupAge").value = "90";
  elements.get("schedDeleteByAge").listeners.click[0]();
  assert.equal(app.DB.schedules.some((item) => item.id === "old"), false);
  assert.equal(app.DB.schedules.some((item) => item.id === "recent"), true);
  assert.equal(app.DB.schedules.some((item) => item.id === "future"), true);
  assert.equal(JSON.stringify(app.DB.residents), residentsBefore);
  assert.equal(JSON.stringify(app.DB.daily), dailyBefore);

  const saved = JSON.parse(storage.get(app.KEY));
  assert.equal(saved.schedules.length, 2);
  assert.equal(JSON.stringify(saved.residents), residentsBefore);
  assert.equal(JSON.stringify(saved.daily), dailyBefore);
  console.log("schedule cleanup tests: OK");
}

run();
