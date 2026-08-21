(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert   = function(){};

  var DATE = "2026-08-14";
  var MM = 96/25.4;

  /* 記録項目の ON / OFF をまとめて作る。
     少項目：T・P・BP だけ／多項目：SpO2・食事朝昼・Hr1・Hr2・BS など */
  function recWith(dayKeys, nightKeys){
    var rec = defaultRec();
    function turnOn(shift, keys){
      for(var i=0;i<keys.length;i++){
        if(rec[shift][keys[i]]) rec[shift][keys[i]] = { on:true, every:true, days:[] };
      }
    }
    turnOn("day", dayKeys || []);
    turnOn("night", nightKeys || []);
    return rec;
  }
  function dayKeysOf(shiftKey){
    var defs = shiftKey === "night" ? REC_NIGHT_ITEMS : REC_DAY_ITEMS, out = [];
    for(var i=0;i<defs.length;i++) out.push(defs[i].k);
    return out;
  }
  function put(unit, i, opt){
    var id = "ad-"+unit+"-"+i;
    DB.residents.push({
      id:id, unit:unit, room:String.fromCharCode(64 + unit) + (101 + i),
      name:"適応 太郎"+(i+1), order:i, status:"in",
      permRaw:"", permShort:(opt.perm || ""), permUpdated:DATE,
      autoCarry:true, demo:false, rec:opt.rec || defaultRec()
    });
    if(opt.today){
      DB.daily[DATE] = DB.daily[DATE] || {};
      DB.daily[DATE][id] = { raw:"", short:opt.today, h:[unit,"",""] };
    }
    return id;
  }
  function reset(){
    DB.residents = [];
    DB.daily = {}; DB.vitals = {}; DB.schedules = []; DB.recurring = [];
  }
  /* 画面の印刷プレビューは縮小表示なので、実寸（レイアウト上のpx）で測る */
  function h(el){ return el.offsetHeight; }
  function rowsOf(unit){
    var sh = document.querySelector('#printArea .sheet[data-unit="'+unit+'"]');
    return sh ? { sheet:sh, rows:sh.querySelectorAll(".prow") } : { sheet:null, rows:[] };
  }
  function cellsFit(row){
    var cells = row.querySelectorAll(".pc"), bad = [];
    for(var i=0;i<cells.length;i++){
      if(cells[i].scrollHeight > cells[i].clientHeight + 1) bad.push(cells[i].className);
    }
    return bad;
  }

  /* ============================================================
     1. 少項目（T・P・BP）と多項目（SpO2・食事・Hr・BS…）の高さ比較
     ============================================================ */
  reset();
  var few  = put(2, 0, { rec: recWith(["T","P","BP"], []) });
  var many = put(2, 1, { rec: recWith(dayKeysOf("day"), dayKeysOf("night")) });
  var mid  = put(2, 2, { rec: recWith(["T","P","BP","SpO2","mealB"], ["T"]) });
  var longTxt = put(2, 3, {
    rec: recWith(["T","P","BP"], []),
    perm: "移乗は必ず2人介助。左上肢はBP測定不可。食事はトロミ付きで誤嚥に注意し、口腔ケアを毎食後に実施する。",
    today: "午前中に38.2℃の発熱あり。医師指示でカロナール内服。水分は日中800ml摂取。昼食は3割、夕食は7割。夜間は臥床にて経過観察。"
  });
  DB.settings.allUnits = false;
  UI.unit = 2; UI.date = DATE;
  saveDB();
  switchTab("print"); fitPreview();

  var got = rowsOf(2);
  ok("Bブロックの用紙が1枚できた", !!got.sheet && got.rows.length === 4, got.rows.length);
  var H = {};
  Array.prototype.forEach.call(got.rows, function(row){
    var nm = row.querySelector(".p-info .nm").textContent;
    H[nm] = row.offsetHeight;
  });
  var hFew = H["B101適応 太郎1"], hMany = H["B102適応 太郎2"], hMid = H["B103適応 太郎3"], hLong = H["B104適応 太郎4"];
  ok("T・P・BP だけの人が h-compact になる",
     got.rows[0].classList.contains("h-compact"), got.rows[0].className);
  ok("記録項目が多い人は h-large / h-xlarge になる",
     got.rows[1].classList.contains("h-large") || got.rows[1].classList.contains("h-xlarge"), got.rows[1].className);
  ok("少項目の行 < 多項目の行（無駄な空白が減る）", hFew < hMany - 1,
     Math.round(hFew) + " / " + Math.round(hMany));
  ok("中くらいの項目数は、その中間の高さになる", hFew <= hMid + 1 && hMid <= hMany + 1,
     Math.round(hFew) + " / " + Math.round(hMid) + " / " + Math.round(hMany));
  ok("長文の申し送り・大事なことがある人は必要な高さが確保される", hLong > hFew - 1,
     Math.round(hFew) + " / " + Math.round(hLong));
  ok("少項目でも手書きできる高さがある（5mm 以上）", hFew >= 5*MM - 1, Math.round(hFew/MM*10)/10 + "mm");
  var over1 = [];
  Array.prototype.forEach.call(got.rows, function(row){
    if(cellsFit(row).length) over1.push(row.querySelector(".p-info .nm").textContent);
  });
  ok("文字切れ・重なりがない（欄の中身が枠に収まる）", over1.length === 0, over1.join(","));

  /* 日勤だけ多い人・夜勤だけ多い人も、多い側で高さが決まる */
  reset();
  put(2, 0, { rec: recWith(["T","P","BP"], []) });
  put(2, 1, { rec: recWith([], dayKeysOf("night")) });
  saveDB(); switchTab("print"); fitPreview();
  var g2 = rowsOf(2);
  ok("夜勤だけ項目が多い人も、行が大きくなる",
     g2.rows[1].offsetHeight > g2.rows[0].offsetHeight - 1,
     Math.round(g2.rows[0].offsetHeight) + " / " + Math.round(g2.rows[1].offsetHeight));

  /* 当日の予定がある人も高さに反映される */
  reset();
  var noPlan = put(2, 0, { rec: recWith(["T","P","BP"], []) });
  var hasPlan = put(2, 1, { rec: recWith(["T","P","BP"], []) });
  DB.schedules.push({ id:"sc1", residentId:hasPlan, date:DATE, kind:"受診",
    title:"外部受診", place:"外部医療機関", dept:"", start:"09:30", end:"12:00",
    family:"あり", note:"付き添いあり", demo:false });
  saveDB(); switchTab("print"); fitPreview();
  var g3 = rowsOf(2);
  ok("その日の予定がある人は、予定の分だけ高さが増える",
     g3.rows[1].offsetHeight >= g3.rows[0].offsetHeight,
     Math.round(g3.rows[0].offsetHeight) + " / " + Math.round(g3.rows[1].offsetHeight));
  ok("予定ありでも文字切れがない", cellsFit(g3.rows[1]).length === 0);

  /* ============================================================
     2. 10 / 15 / 20 名（満床）でも 1ブロック＝1枚に収まる
     ============================================================ */
  var PERM = ["歩行見守り・転倒注意","移乗2人介助・褥瘡処置","食事水分トロミ・誤嚥注意","左上肢BP不可","車椅子・トイレ誘導",""];
  var TODAY = ["発熱38.0℃。カロナール服用。水分摂取。昼食3割。","食欲良好。特変なし。","夜間覚醒あり。日中の傾眠に注意。",
               "仙骨部の処置実施。発赤の範囲に変化なし。夕食10割。","BS 156。指示どおり実施。排便1回。",""];
  [10, 15, 20].forEach(function(n){
    reset();
    for(var i=0;i<n;i++){
      /* 実際の現場に近い混在：少項目の人（T・P・BP）・標準の人・多項目の人
         （多項目＝SpO2・食事朝昼・Hr1・Hr2・BS。依頼の例のBさんと同じ組み合わせ） */
      var rec = (i % 3 === 0) ? recWith(["T","P","BP"], [])
              : (i % 3 === 1) ? recWith(["T","P","BP","SpO2","mealB"], ["T","mealD"])
              : recWith(["SpO2","mealB","mealL","hr1","hr2","normalBS"], ["T","mealD","nightBS"]);
      put(2, i, { rec:rec, perm:PERM[i % PERM.length], today:TODAY[i % TODAY.length] });
    }
    saveDB(); switchTab("print"); fitPreview();
    var g = rowsOf(2);
    var sheets = document.querySelectorAll("#printArea .sheet");
    ok(n + "名：Bブロックは1枚のまま（他ブロックが混ざらない）", sheets.length === 1 && g.rows.length === n,
       "sheets=" + sheets.length + " rows=" + g.rows.length);
    ok(n + "名：A4横（285mm × 197mm）を維持",
       Math.abs(g.sheet.offsetWidth  - 285*MM) < 2 &&
       Math.abs(g.sheet.offsetHeight - 197*MM) < 2,
       Math.round(g.sheet.offsetWidth) + "x" + Math.round(g.sheet.offsetHeight));
    var rowsBox = g.sheet.querySelector(".rows");
    var sum = 0, minH = 1e9, maxH = 0, cut = [];
    Array.prototype.forEach.call(g.rows, function(row){
      var h = row.offsetHeight;
      sum += h; if(h < minH) minH = h; if(h > maxH) maxH = h;
      if(cellsFit(row).length) cut.push(row.querySelector(".p-info .nm").textContent);
    });
    ok(n + "名：行の合計が用紙の行エリアに収まる（罫線ズレ・行切れなし）",
       sum <= rowsBox.clientHeight + 1.5, Math.round(sum) + " / " + rowsBox.clientHeight);
    ok(n + "名：用紙全体がはみ出さない",
       g.sheet.scrollHeight <= g.sheet.clientHeight + 1, g.sheet.scrollHeight + " / " + g.sheet.clientHeight);
    ok(n + "名：いちばん狭い行でも手書きできる高さがある（3.6mm 以上）",
       minH >= 3.6*MM - 1, Math.round(minH/MM*10)/10 + "mm");
    ok(n + "名：項目の少ない行と多い行で高さに差がついている", maxH > minH + 1,
       Math.round(minH) + " / " + Math.round(maxH));
    ok(n + "名：文字切れ・重なりがない", cut.length === 0, cut.slice(0,3).join(","));
    if(n === 10 || n === 20){
      var diag = [];
      Array.prototype.forEach.call(g.rows, function(row, i){
        if(i > 5) return;
        var d = row.querySelectorAll(".pc");
        diag.push(i + ":" + row.className.replace("prow ","")
          + " h=" + Math.round(row.offsetHeight/MM*10)/10 + "mm need=" + row.getAttribute("data-need")
          + " info=" + d[0].scrollHeight + "/" + d[0].clientHeight
          + " day=" + d[1].scrollHeight + "/" + d[1].clientHeight
          + " ni=" + d[2].scrollHeight + "/" + d[2].clientHeight);
      });
      lines.push("  [" + n + "名] rowsBox=" + rowsBox.clientHeight + " / " + diag.join(" | "));
    }
  });

  /* ============================================================
     2b. どうしても1枚に収まらない場合は、縮小せず2枚に分ける
         （20名満床で全員が記録項目を全部ONにした極端な状態）
     ============================================================ */
  reset();
  for(var x=0;x<20;x++){
    put(2, x, { rec: recWith(dayKeysOf("day"), dayKeysOf("night")),
                perm:PERM[x % PERM.length], today:TODAY[x % TODAY.length] });
  }
  saveDB(); switchTab("print"); fitPreview();
  var gx = rowsOf(2);
  var sx = document.querySelectorAll("#printArea .sheet");
  ok("収まらないユニットは2枚に分かれる", sx.length === 2, sx.length);
  ok("2枚に分けても、ほかのユニットは混ざらない",
     sx[0].getAttribute("data-unit") === "2" && sx[1].getAttribute("data-unit") === "2");
  ok("分けた用紙の合計人数は20名のまま",
     sx[0].querySelectorAll(".prow").length + sx[1].querySelectorAll(".prow").length === 20,
     sx[0].querySelectorAll(".prow").length + "+" + sx[1].querySelectorAll(".prow").length);
  ok("2枚に分けても文字は小さくならない（同じ data-den のまま）",
     sx[0].getAttribute("data-den") === sx[1].getAttribute("data-den"),
     sx[0].getAttribute("data-den") + "/" + sx[1].getAttribute("data-den"));
  ok("2枚目にも「1/2・2/2」の表示が出る",
     sx[0].getAttribute("data-page") === "1/2" && sx[1].getAttribute("data-page") === "2/2",
     sx[0].getAttribute("data-page") + " " + sx[1].getAttribute("data-page"));
  var cutX = [];
  Array.prototype.forEach.call(sx, function(sh){
    Array.prototype.forEach.call(sh.querySelectorAll(".prow"), function(row){
      if(cellsFit(row).length) cutX.push(row.querySelector(".p-info .nm").textContent);
    });
  });
  ok("2枚に分けたあとは文字切れがない", cutX.length === 0, cutX.slice(0,3).join(","));
  ok("2枚に分けたことを印刷前の案内にも書く",
     document.getElementById("printPlan").textContent.indexOf("2枚に分けて") >= 0,
     document.getElementById("printPlan").textContent.slice(0,120));
  /* 項目を通常の量へ戻せば、1枚へ戻る */
  reset();
  for(var y=0;y<20;y++) put(2, y, { rec: recWith(["T","P","BP"], ["T"]), today:TODAY[y % TODAY.length] });
  saveDB(); switchTab("print"); fitPreview();
  ok("収まるようになれば1枚へ戻る", document.querySelectorAll("#printArea .sheet").length === 1,
     document.querySelectorAll("#printArea .sheet").length);

  /* ============================================================
     3. A15 / B12 / C18 / D16 の基本4枚（各ブロックの内容は混ざらない）
     ============================================================ */
  reset();
  var initialCounts = { 1:15, 2:12, 3:18, 4:16 };
  for(var u=1; u<=4; u++){
    var cap = initialCounts[u];
    for(var i=0;i<cap;i++) put(u, i, { rec: recWith(["T","P","BP","SpO2"], ["T"]), today:TODAY[i % TODAY.length] });
  }
  DB.settings.allUnits = true;
  saveDB(); switchTab("print"); fitPreview();
  ok("A〜Dは基本4枚", document.querySelectorAll("#printArea .sheet").length === 4,
     document.querySelectorAll("#printArea .sheet").length);
  var all = document.querySelectorAll("#printArea .sheet");
  ok("印刷順は A→B→C→D",
     Array.prototype.map.call(all, function(sh){ return sh.getAttribute("data-unit"); }).join(",") === "1,2,3,4");
  var firstRows = all[0].querySelectorAll(".prow");
  ok("Aブロックにも同じ Adaptive のクラスが付く",
     firstRows.length === 15 && ADAPT_ROW_CLASSES.some(function(c){ return firstRows[0].classList.contains(c); }),
     firstRows[0] ? firstRows[0].className : "-");
  var mixed = false;
  Array.prototype.forEach.call(all, function(sh){
    var u = sh.getAttribute("data-unit");
    Array.prototype.forEach.call(sh.querySelectorAll(".prow .p-info .nm"), function(nm){
      var expectedPrefix = String.fromCharCode(64 + parseInt(u, 10));
      if(nm.textContent.indexOf(expectedPrefix) !== 0) mixed = true;
    });
  });
  ok("ブロックの内容が別の用紙へ混ざらない", !mixed);

  /* ============================================================
     4. 高さ判定の共通関数そのものの確認
     ============================================================ */
  var rFew  = residentById(DB.residents.filter(function(x){ return x.unit === 2; })[0].id);
  var needFew = calculateResidentPrintHeight(rFew, DATE);
  ok("calculateResidentPrintHeight() が日勤・夜勤・情報欄の行数を返す",
     typeof needFew.day === "number" && typeof needFew.night === "number" &&
     typeof needFew.info === "number" && typeof needFew.lines === "number",
     JSON.stringify(needFew));
  ok("getAdaptiveRowClass() は段階クラスを返す",
     getAdaptiveRowClass(1) === "h-compact" && getAdaptiveRowClass(3) === "h-normal" &&
     getAdaptiveRowClass(4) === "h-large" && getAdaptiveRowClass(9) === "h-xlarge");
  ok("日勤・夜勤は多い側で判定する",
     calculateResidentPrintHeight({ id:"x", rec: recWith([], dayKeysOf("night")) }, DATE).shift ===
     calculateResidentPrintHeight({ id:"x", rec: recWith([], dayKeysOf("night")) }, DATE).night);

  var errs = (window.__ERR || []);
  lines.push("console/実行時エラー: " + errs.length);
  for(var e=0;e<errs.length && e<5;e++) lines.push("  " + errs[e]);
  lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  var pre = document.getElementById("TESTOUT");
  pre.textContent = lines.join("\n");
  pre.className = "noprint";
})();
