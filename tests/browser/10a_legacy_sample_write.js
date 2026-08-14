/* 【旧見本の整理テスト 1/2】
   旧版（見本入居者を自動作成していた版）が保存していた形のデータを書き込む。
   このあと 10b が「新しいアプリで開き直した状態」を検証する。

   ・sample-2 … demo印あり／見本専用データあり（旧版そのまま）
   ・sample-3 … demo印が失われている／見本専用データあり
   ・sample-4 … demo印あり／見本専用データなし（お名前も変えられている）
   ・sample-5 … demo印が失われている／見本4項目が完全一致
   ・rreal1  … 実入居者。お名前だけ「見本 花子」と紛らわしいが実データ
   ・rreal2  … ふつうの実入居者
   ・rmaybe1 … 見本専用データだけを持つ判断できないデータ（消さずに残す）        */
(function(){
  function sample(unit, room, name, perm, opts){
    var r = { id:"sample-"+unit, unit:unit, room:room, name:name, order:-1, status:"in",
      permRaw:perm, permShort:perm, permUpdated:"2026-06-01", autoCarry:false };
    if(opts.demo) r.demo = true;
    if(opts.payload) r.sample = { short:"見本の申し送り", raw:"見本 raw", vitals:{ "day.T":"36.5" } };
    return r;
  }
  var legacy = {
    v:8,
    residents:[
      sample(2, "202", "見本 花子",   "歩行見守り・転倒注意",                     { demo:true,  payload:true }),
      sample(3, "305", "見本 太郎",   "食事一部介助・血糖測定",                   { demo:false, payload:true }),
      sample(4, "410", "見本 みどり", "名前も内容も変えられた見本",               { demo:true,  payload:false }),
      sample(5, "512", "見本 一郎",   "褥瘡処置・移乗2人介助",                    { demo:false, payload:false }),
      { id:"rreal1", unit:2, room:"999", name:"見本 花子", order:0, status:"in",
        permRaw:"", permShort:"実在の入居者です（見本ではありません）",
        permUpdated:"2026-06-01", autoCarry:true, demo:false },
      { id:"rreal2", unit:3, room:"310", name:"実データ 太郎", order:0, status:"in",
        permRaw:"", permShort:"歩行見守り", permUpdated:"2026-06-01", autoCarry:true, demo:false },
      { id:"rmaybe1", unit:5, room:"530", name:"判断できないデータ", order:0, status:"in",
        permRaw:"", permShort:"", permUpdated:"2026-06-01", autoCarry:true, demo:false,
        sample:{ short:"見本専用の入れ物だけがある", raw:"", vitals:{} } }
    ],
    daily:{
      "2026-06-01":{
        "sample-2":{ raw:"", short:"見本の申し送り（消える）" },
        "rreal1":{ raw:"", short:"実入居者の申し送り（残る）" },
        "rreal2":{ raw:"", short:"実データ太郎の申し送り（残る）" }
      }
    },
    vitals:{
      "2026-06-01":{
        "sample-2":{ "day.T":"38.0" },
        "rreal1":{ "day.T":"36.6" }
      }
    },
    schedules:[
      { id:"sample-sch-5", residentId:"sample-5", unit:5, h:[5,"512","見本 一郎"], demo:true,
        date:"2026-09-01", kind:"受診", start:"10:00", end:"", title:"定期受診",
        place:"（見本）中央クリニック", dept:"内科", family:"あり", note:"見本の予定です" },
      { id:"real-sch-1", residentId:"rreal1", unit:2, h:[2,"999","見本 花子"], demo:false,
        date:"2026-09-02", kind:"受診", start:"09:00", end:"", title:"実データの受診",
        place:"○○病院", dept:"内科", family:"あり", note:"" }
    ],
    recurring:[
      { id:"sample-rep-3-0", unit:3, residentId:"sample-3", shift:"day", days:[1],
        title:"見本のターゲス", time:"", note:"見本の定期予定です", on:true, demo:true },
      { id:"real-rep-1", unit:3, residentId:"rreal2", shift:"night", days:[2],
        title:"実データのBS測定", time:"", note:"", on:true, demo:false }
    ],
    history:{ version:1 },
    samplesSeeded:true,
    settings:{ allUnits:true, autoCarry:true, showLeft:false, lastAutoCarry:"" }
  };
  localStorage.setItem("kaigo_handover_v2", JSON.stringify(legacy));
  /* このページの終了処理で上書きされないよう、保存を止める */
  storeSet = function(){ return true; };
  saveDB   = function(){};
  document.getElementById("TESTOUT").textContent =
    "PASS  旧見本を含むデータを書き込みました（residents=" + legacy.residents.length + "）"
    + "\n\nRESULT pass=1 fail=0 errors=0";
})();
