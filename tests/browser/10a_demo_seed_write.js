/* 【初回デモデータ 1/2】
   file:// で初めて開いたときに架空61名が生成されることを確認し、
   そのうえで「閲覧者が自由に編集できる」ことを確かめてから閉じる。
   このあと 10b が「開き直しても重複せず、変更が残る」ことを検証する。 */
(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  ok("初回表示で架空61名が生成される", DB.residents.length === 61, DB.residents.length);
  ok("A15 / B12 / C18 / D16",
     realResidentsOf(1).length === 15 && realResidentsOf(2).length === 12
     && realResidentsOf(3).length === 18 && realResidentsOf(4).length === 16,
     [1,2,3,4].map(function(u){ return realResidentsOf(u).length; }).join("/"));
  ok("生成された61名に同姓同名がない",
     new Set(DB.residents.map(function(r){ return r.name; })).size === 61);
  ok("部屋番号は A101〜D116 の架空番号",
     DB.residents.every(function(r){ return /^[ABCD]1\d\d$/.test(r.room); }), DB.residents[0].room);
  ok("見本印は付かない＝すべて通常データとして編集できる",
     DB.residents.filter(isSample).length === 0);
  ok("申し送りが入っている人と空欄の人が混ざっている", (function(){
    var day = DB.daily[todayYmd()] || {};
    var filled = DB.residents.filter(function(r){ return day[r.id] && day[r.id].short; }).length;
    return filled > 0 && filled < 61;
  })());
  ok("記録項目の数が人によって違う（Adaptive印刷の差）", (function(){
    var set = new Set(DB.residents.map(function(r){ return fieldDefsFor(r.rec, "day", todayYmd()).length; }));
    return set.size >= 3;
  })());
  ok("これからの予定と過ぎた予定の両方がある",
     DB.schedules.some(function(s){ return s.date > todayYmd(); })
     && DB.schedules.some(function(s){ return s.date < todayYmd(); }));
  ok("定期予定は日勤・夜勤の両方がある",
     DB.recurring.some(function(r){ return r.shift === "day"; })
     && DB.recurring.some(function(r){ return r.shift === "night"; }));
  ok("デモ生成の版が保存される", DB.demoSeed === DEMO_SEED_VERSION, DB.demoSeed);

  /* 閲覧者による変更（このブラウザの中だけに残る） */
  var target = realResidentsOf(1)[0];
  target.name = "閲覧者が変えた名前";
  dailyOf(todayYmd(), target.id).short = "閲覧者が書いた申し送り";
  DB.schedules.push({ id:"demo-visitor", residentId:target.id, unit:1, date:shiftDate(todayYmd(), 2),
    kind:"家族面会", start:"13:00", end:"", title:"", place:"", dept:"", family:"", note:"",
    h:[1, target.room, target.name], demo:false });
  saveDB();
  window.__DEMO_TARGET = target.id;
  ok("変更が保存される",
     JSON.parse(localStorage.getItem(KEY)).residents.filter(function(r){ return r.id === target.id; })[0].name
       === "閲覧者が変えた名前");

  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: "+errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
