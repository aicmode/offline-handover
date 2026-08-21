(function(){
  var pass=0, fail=0, lines=[];
  function ok(n,c,e){ if(c){pass++;lines.push("PASS  "+n);} else {fail++;lines.push("FAIL  "+n+(e!==undefined?"  → "+e:""));} }
  window.confirm = function(){ return true; };
  window.alert   = function(){};

  /* A〜Dブロックの一覧で、部屋番号は狭く・お名前は広いことを実測する。
     「部屋番号 A101」に対して氏名は長くなりやすいので、
     名前欄は入力中に氏名全体が見える幅を確保する。 */
  var NAME = "長谷川 佐和子";              // 実際に出やすい長さの氏名
  var made = [];
  for(var i=0;i<UNIT_DEFS.length;i++){
    var u = UNIT_DEFS[i].id;
    var r = addResident(u, { room: String.fromCharCode(64 + u) + "120", name: NAME });
    if(r) made.push(r);
  }
  ok("A〜Dに1名ずつ用意できた", made.length === UNIT_DEFS.length, made.length);

  var widths = [];
  for(var k=0;k<UNIT_DEFS.length;k++){
    var unit = UNIT_DEFS[k].id;
    UI.unit = unit;
    switchTab("master");
    var row  = document.querySelector('#masterBody tr[data-id="'+made[k].id+'"]');
    var room = row.querySelector('td.c-room input[data-f="room"]');
    var name = row.querySelector('td.c-name input[data-f="name"]');
    ok(uLb(unit) + "：部屋番号・お名前の欄に同じ幅指定が付く", !!room && !!name);
    var rw = room.getBoundingClientRect().width;
    var nw = name.getBoundingClientRect().width;
    widths.push({ unit:unit, room:rw, name:nw });
    ok(uLb(unit) + "：お名前の欄が部屋番号より広い", nw > rw, "room=" + Math.round(rw) + " name=" + Math.round(nw));
    ok(uLb(unit) + "：部屋番号は必要以上に広くない（105px未満）", rw < 105, Math.round(rw));
    ok(uLb(unit) + "：「A101」形式を入力できる幅は残っている", rw >= 50, Math.round(rw));
    ok(uLb(unit) + "：氏名全体が見える幅がある（実測 ≧ 文字幅）",
       nw >= textWidth(NAME, name), Math.round(nw) + " / " + Math.round(textWidth(NAME, name)));
    ok(uLb(unit) + "：名前欄でスクロールせずに全体が見える",
       name.scrollWidth <= name.clientWidth + 1, name.scrollWidth + " / " + name.clientWidth);
  }
  /* A〜Dのすべてがまったく同じ幅であること（同じ表・同じCSSを使う） */
  var same = true;
  for(var w=1;w<widths.length;w++){
    if(Math.abs(widths[w].room - widths[0].room) > 1) same = false;
    if(Math.abs(widths[w].name - widths[0].name) > 1) same = false;
  }
  ok("A〜Dで名前・部屋番号の幅が同じ", same,
     widths.map(function(x){ return x.unit + ":" + Math.round(x.room) + "/" + Math.round(x.name); }).join(" "));

  /* 入力画面の追加フォームも同じ考え方（部屋番号は狭く・お名前は広く） */
  UI.unit = 2; switchTab("input");
  document.getElementById("btnInputAdd").dispatchEvent(new MouseEvent("click",{bubbles:true}));
  var box = document.getElementById("inputAddBox");
  var aRoom = box.querySelector('[data-add-field="room"]');
  var aName = box.querySelector('[data-add-field="name"]');
  var aRoomW = aRoom.getBoundingClientRect().width, aNameW = aName.getBoundingClientRect().width;
  if(window.innerWidth <= 820){
    /* 既存のレスポンシブどおり、狭い画面では1列へ折り返す（崩れない） */
    ok("狭い画面では追加フォームが1列へ折り返す（既存の作りを維持）",
       Math.abs(aNameW - aRoomW) <= 1, Math.round(aRoomW) + " / " + Math.round(aNameW));
  }else{
    ok("追加フォームでもお名前の欄が部屋番号より広い", aNameW > aRoomW,
       Math.round(aRoomW) + " / " + Math.round(aNameW));
  }
  /* Desktop（折り返さない幅）の指定そのものも確認する */
  var gridRule = "";
  for(var s2=0;s2<document.styleSheets.length;s2++){
    var rules = document.styleSheets[s2].cssRules || [];
    for(var r2=0;r2<rules.length;r2++){
      if(rules[r2].selectorText === ".resident-add .add-grid") gridRule = rules[r2].style.gridTemplateColumns;
    }
  }
  ok("Desktopの追加フォームは部屋番号を狭く・お名前を広く取る",
     /(^|\s)92px(\s|$)/.test(gridRule) && gridRule.indexOf("minmax(240px") >= 0, gridRule);

  /* 狭い画面でも一覧が崩れない（表は横スクロールできる枠の中にある） */
  UI.unit = 2; switchTab("master");
  var host = document.querySelector("#masterBody").closest("div[style*='overflow-x']");
  ok("一覧は横スクロールできる枠の中にある（小画面で崩れない）", !!host);
  var row2 = document.querySelector('#masterBody tr[data-id="'+made[1].id+'"]');
  var nameCell = row2.querySelector("td.c-name");
  var roomCell = row2.querySelector("td.c-room");
  ok("行の中で名前セルが部屋番号セルより広い",
     nameCell.getBoundingClientRect().width > roomCell.getBoundingClientRect().width);

  /* 後片付け（この検証で作った入居者は残さない） */
  var ids = made.map(function(r){ return r.id; });
  DB.residents = DB.residents.filter(function(r){ return ids.indexOf(r.id) < 0; });
  saveDB();
  ok("検証用に作った入居者は残さない",
     DB.residents.filter(function(r){ return ids.indexOf(r.id) >= 0; }).length === 0);

  function textWidth(text, el){
    var cs = getComputedStyle(el);
    var span = document.createElement("span");
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
    span.style.font = cs.font || (cs.fontSize + " " + cs.fontFamily);
    span.textContent = text;
    document.body.appendChild(span);
    var w = span.getBoundingClientRect().width;
    document.body.removeChild(span);
    return w;
  }

  var errs = window.__ERR || [];
  lines.push(""); lines.push("console/実行時エラー: " + errs.length);
  errs.forEach(function(e){ lines.push("  " + e); });
  lines.push(""); lines.push("RESULT pass=" + pass + " fail=" + fail + " errors=" + errs.length);
  document.getElementById("TESTOUT").textContent = lines.join("\n");
})();
