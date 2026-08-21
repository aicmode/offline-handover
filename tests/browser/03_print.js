(function(){
  var pass=0, fail=0, lines=[];
  function ok(name, cond, extra){
    if(cond){ pass++; lines.push("PASS  " + name); }
    else { fail++; lines.push("FAIL  " + name + (extra !== undefined ? "  → " + extra : "")); }
  }
  // 満床（A〜D 各20名＝合計80名）を作り、いちばん詰まった状態で用紙を測る
  DB = defaultDB(); migrate();
  DB.schedules = []; DB.recurring = [];
  var PERM = ["歩行見守り・転倒注意","移動は車椅子使用","水分摂取量の確認",
              "食事量の確認","杖歩行。段差に注意","夜間はセンサー使用"];
  var TODAY = ["朝食8割。水分摂取良好。","日中は臥床がち。声かけで離床。",
               "昼食5割。水分摂取少なめ。","レクリエーション参加。表情良好。",
               "入浴実施。皮膚状態に変化なし。",""];
  var counts = { 1:20, 2:20, 3:20, 4:20 };
  // 新規入居者は全項目OFFから始まるので、印刷レイアウトの検証では
  // 通常の項目（T・P・BP・SpO2・食事・Hr）をONにして、いちばん詰まった状態で測る
  function fullRec(){
    var rec = defaultRec();
    for(var s=0;s<REC_SHIFTS.length;s++){
      var sh = REC_SHIFTS[s];
      for(var j=0;j<sh.items.length;j++){
        if(!sh.items[j].defOff) rec[sh.k][sh.items[j].k].on = true;
      }
    }
    return rec;
  }
  var n = 0;
  for(var u in counts){
    for(var i=0;i<counts[u];i++){
      var id = "p-"+u+"-"+i;
      var rec = fullRec();
      if(i % 4 === 0){ rec.day.normalBS = {on:true,every:true,days:[]}; rec.night.nightBS = {on:true,every:true,days:[]}; }
      if(i % 5 === 0){ rec.day.BW = {on:true,every:true,days:[]}; }
      if(i % 7 === 0){ rec.custom.push(normCustom({id:"c"+id,name:"水分量",unit:"ml",shift:"day",size:"l",on:true,every:true,days:[]})); }
      DB.residents.push({ id:id, unit:parseInt(u,10), room:"ABCD".charAt(parseInt(u,10)-1)+(101+i),
        name:"テスト 太郎"+(i+1), order:i, status:"in",
        permRaw:"", permShort:PERM[i % PERM.length], permUpdated:"2026-08-14",
        autoCarry:true, demo:false, rec:rec });
      DB.daily["2026-08-14"] = DB.daily["2026-08-14"] || {};
      DB.daily["2026-08-14"][id] = { raw:"", short:TODAY[i % TODAY.length], h:[parseInt(u,10),"",""] };
      DB.vitals["2026-08-14"] = DB.vitals["2026-08-14"] || {};
      DB.vitals["2026-08-14"][id] = { "day.T":"36.6","day.P":"72","day.BP":"118/70","day.SpO2":"97",
        "day.mealB":"10","day.mealL":"8","night.mealD":"9","night.T":"36.4" };
      n++;
    }
  }
  DB.recurring.push({id:"r1",unit:2,residentId:"",shift:"day",days:[1,2,3,4,5,6,0],title:"全体カンファレンス",time:"",note:"",on:true,demo:false});
  DB.recurring.push({id:"r2",unit:2,residentId:"p-2-0",shift:"night",days:[0,1,2,3,4,5,6],title:"BS測定",time:"",note:"",on:true,demo:false});
  DB.settings.allUnits = true;
  UI.date = "2026-08-14";
  saveDB();
  switchTab("print");
  fitPreview();
  var sheets = document.querySelectorAll("#printArea .sheet");
  ok("A〜Dの満床データを80名作成", n === 80, n);
  ok("満床でも基本4枚", sheets.length === 4, sheets.length);
  ok("印刷順は A→B→C→D",
     Array.prototype.map.call(sheets, function(sh){ return sh.getAttribute("data-unit"); }).join(",") === "1,2,3,4");
  Array.prototype.forEach.call(sheets, function(sh){
    var label = uLb(parseInt(sh.getAttribute("data-unit"), 10));
    ok(label + "：20名全員の行がある", sh.querySelectorAll(".prow").length === 20,
       sh.querySelectorAll(".prow").length);
    ok(label + "：用紙全体が縦にはみ出さない", sh.scrollHeight <= sh.clientHeight + 1,
       sh.scrollHeight + "/" + sh.clientHeight);
  });
  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("はみ出し確認表示: " + document.getElementById("ovList").textContent.trim().slice(0,300));
  lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  " + e); });
  lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  var pre = document.getElementById("TESTOUT");
  pre.textContent = lines.join("\n");
  pre.className = "noprint";
  document.title = "sheets=" + sheets.length;
})();
