(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  function fire(el,t){ el.dispatchEvent(new Event(t,{bubbles:true})); }
  function click(el){ el.dispatchEvent(new MouseEvent("click",{bubbles:true})); }
  window.confirm = function(){ return true; };
  window.alert = function(m){ window.__ALERT = m; };

  UI.unit = 1; switchTab("input");
  ok("静養室は0/4から開始", registeredCountOf(1) === 0, registeredCountOf(1));
  ok("静養室の入力画面に直接追加ボタンがある",
     document.getElementById("btnInputAdd").textContent === "静養室へ追加");
  ok("0人の案内が別タブへの移動を要求しない",
     document.getElementById("inputList").textContent.indexOf("この画面のまま登録") >= 0);

  click(document.getElementById("btnInputAdd"));
  var box = document.getElementById("inputAddBox");
  var room = box.querySelector('[data-add-field="room"]');
  var name = box.querySelector('[data-add-field="name"]');
  var perm = box.querySelector('[data-add-field="permShort"]');
  ok("部屋番号・名前・毎日つづく大事なことを入力できる", !!room && !!name && !!perm);
  ok("追加フォームにも入力欄保護が適用される",
     room.getAttribute("spellcheck") === "false"
     && room.getAttribute("autocomplete") === "off"
     && room.getAttribute("autocorrect") === "off"
     && room.getAttribute("autocapitalize") === "off"
     && room.getAttribute("writingsuggestions") === "false");
  room.value = "静養1";
  name.value = "静養テスト";
  perm.value = "転倒注意・水分トロミ";
  click(box.querySelector('[data-add-action="submit"]'));

  ok("入力画面だけで静養室1/4へ追加できる", registeredCountOf(1) === 1, registeredCountOf(1));
  var added = realResidentsOf(1)[0];
  var card = document.querySelector('#inputList .card[data-id="'+added.id+'"]');
  ok("追加後は通常の入居者カードを表示", !!card);
  ok("追加時の3項目を同じ入居者データへ保存",
     added.room === "静養1" && added.name === "静養テスト" && added.permShort === "転倒注意・水分トロミ");

  var handover = card.querySelector('[data-f="todayShort"]');
  handover.value = "発熱 38.1 水分摂取"; fire(handover,"input");
  var dayT = card.querySelector('[data-vk="day.T"]');
  var nightT = card.querySelector('[data-vk="night.T"]');
  dayT.value = "38.1"; fire(dayT,"input");
  nightT.value = "37.4"; fire(nightT,"input");
  saveDB();
  var saved = JSON.parse(localStorage.getItem(KEY));
  ok("申し送り・日勤・夜勤バイタルを自動保存",
     saved.daily[UI.date][added.id].short.indexOf("38.1") >= 0
     && saved.vitals[UI.date][added.id]["day.T"] === "38.1"
     && saved.vitals[UI.date][added.id]["night.T"] === "37.4");

  switchTab("print");
  ok("静養室1人で印刷は静養室先頭の5枚",
     unitsForPrint().join(",") === "1,2,3,4,5", unitsForPrint().join(","));

  UI.unit = 2; switchTab("input");
  click(document.getElementById("btnInputAdd"));
  var unitBox = document.getElementById("inputAddBox");
  ok("ユニット2も静養室と同じ追加フォームを使う",
     !!unitBox.querySelector('[data-add-field="room"]')
     && !!unitBox.querySelector('[data-add-field="name"]')
     && !!unitBox.querySelector('[data-add-field="permShort"]'));
  click(unitBox.querySelector('[data-add-action="cancel"]'));

  ok("外部通信は0件", !window.__FETCHCALLS && !window.__XHRCALLS && !window.__BEACON && !window.__WS);
  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: "+errs.length);
  errs.forEach(function(e){ lines.push("  "+e); });
  lines.push(""); lines.push("RESULT pass="+pass+" fail="+fail+" errors="+errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
