/* 【再読込テスト 1/2】入力してから、ページを閉じる（次のページ読み込みへ引き継ぐ） */
(function(){
  DB.residents.push({ id:"reload-1", unit:3, room:"333", name:"再読込 テスト", order:5, status:"in",
    permRaw:"", permShort:"転倒注意", permUpdated:"2026-08-14", autoCarry:true, demo:false, rec:defaultRec() });
  dailyOf("2026-08-14","reload-1").short = "再読込しても残るはずの申し送り";
  vitalsSet("2026-08-14","reload-1","day.T","37.4");
  DB.recurring.push({ id:"reload-rep", unit:3, residentId:"reload-1", shift:"night", days:[1],
    title:"再読込テストBS", time:"", note:"", on:true, demo:false });
  DB.settings.residentSort = "updated";
  saveDB();
  document.getElementById("TESTOUT").textContent =
    "PASS  入力を保存しました（residents=" + DB.residents.length + "）\n\nRESULT pass=1 fail=0 errors=0";
})();
