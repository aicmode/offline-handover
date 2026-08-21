/* 【アプリ更新テスト 1/2】
   旧版（v7）が保存していた形式のデータを localStorage へ書き込む。
   このあと 04b が「新しいアプリで開き直した状態」を検証する。 */
(function(){
  var legacy = {
    v:7,
    residents:[
      { id:"L1", unit:2, room:"210", name:"旧構成 一郎", order:0, status:"in",
        permRaw:"歩行時は必ず見守りをしてください。", permShort:"歩行見守り", permUpdated:"2026-06-01",
        autoCarry:true, rec:{ day:{ T:true, P:true, BS:{on:true,every:true,days:[]} }, night:{ T:true } } },
      { id:"L2", unit:5, room:"520", name:"旧構成 花子", order:1, status:"in",
        permRaw:"食事はきざみ食です。", permShort:"", permUpdated:"2026-06-01", autoCarry:true },
      { id:"L3", unit:4, room:"430", name:"旧構成 退居者", order:2, status:"out", leftAt:"2026-05-20",
        permRaw:"", permShort:"", autoCarry:true }
    ],
    daily:{
      "2026-06-01":{ L1:{ raw:"37.9℃ クーリング実施", short:"発熱あり。経過観察。" },
                     L2:{ raw:"昼食10割", short:"" } },
      "2026-06-02":{ L1:{ raw:"", short:"解熱。特変なし。" } }
    },
    schedules:[ { id:"LS1", residentId:"L1", unit:2, date:"2026-06-10", kind:"受診",
                  start:"10:00", end:"", title:"定期受診", place:"外部医療機関", dept:"",
                  family:"あり", note:"" } ],
    history:{version:1},
    settings:{ hideEmpty:true, alwaysBack:true, allUnits:false, autoCarry:true, showLeft:false, lastAutoCarry:"" }
  };
  localStorage.setItem("handover_portfolio_demo_v2", JSON.stringify(legacy));
  /* このページの終了処理で上書きされないよう、保存を止める */
  storeSet = function(){ return true; };
  saveDB   = function(){};
  document.getElementById("TESTOUT").textContent =
    "PASS  旧版データを書き込みました（residents=" + legacy.residents.length
    + " / 日数=" + Object.keys(legacy.daily).length + "）\n\nRESULT pass=1 fail=0 errors=0";
})();
