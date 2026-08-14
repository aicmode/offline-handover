(function(){
  var lines = [];
  // 実運用に近い人数（静養室4／U2:34／U3-5:30）を作る
  DB.residents = DB.residents.filter(function(r){ return !isSample(r); });
  DB.schedules = []; DB.recurring = [];
  var PERM = ["歩行見守り・転倒注意","移乗2人介助・褥瘡処置","食事・水分トロミ・誤嚥注意",
              "左上肢BP不可・服薬は職員管理","車椅子・トイレ誘導","義歯あり・食事一部介助"];
  var TODAY = ["発熱38.0℃。カロナール服用。水分摂取。昼食3割。",
               "食欲良好。特変なし。","夜間覚醒あり。日中の傾眠に注意。",
               "仙骨部の処置実施。発赤の範囲に変化なし。夕食10割。",
               "BS 156。指示どおり実施。排便1回。",""];
  var counts = { 1:4, 2:34, 3:30, 4:30, 5:30 };
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
      DB.residents.push({ id:id, unit:parseInt(u,10), room:u+"0"+(i<9?"0":"")+(i+1),
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
  DB.recurring.push({id:"r1",unit:2,residentId:"",shift:"day",days:[1,2,3,4,5,6,0],title:"ターゲス",time:"",note:"",on:true,demo:false});
  DB.recurring.push({id:"r2",unit:2,residentId:"p-2-0",shift:"night",days:[0,1,2,3,4,5,6],title:"BS測定",time:"",note:"",on:true,demo:false});
  DB.settings.allUnits = true;
  UI.date = "2026-08-14";
  saveDB();
  switchTab("print");
  fitPreview();
  var sheets = document.querySelectorAll("#printArea .sheet");
  lines.push("作成人数: " + n);
  lines.push("用紙枚数: " + sheets.length);
  Array.prototype.forEach.call(sheets, function(sh){
    lines.push("  unit=" + sh.getAttribute("data-unit") + " rows=" + sh.querySelectorAll(".prow").length
      + " den=" + sh.getAttribute("data-den")
      + " overflowY=" + (sh.scrollHeight > sh.clientHeight + 1 ? "はみ出しあり" : "OK"));
  });
  lines.push("はみ出し警告: " + document.getElementById("ovList").textContent.trim().slice(0,300));
  var pre = document.getElementById("TESTOUT");
  pre.textContent = lines.join("\n");
  pre.className = "noprint";
  document.title = "sheets=" + sheets.length;
})();
