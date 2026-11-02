// お気に入りのロジック（端末内保存）のテスト
const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../www/logic.js');
const D=require('../www/municipalities.js');
const byCode=c=>{const r=D.find(x=>x[0]===c);return r?L.rowToPlace(r):null};
const yachimata=byCode('12230'),fuchuT=byCode('13206'),fuchuH=byCode('34208'),sapporo=byCode('01100');

test('追加・重複なし・同名の市は別扱い',()=>{
  let f=L.addFavorite([],yachimata);
  f=L.addFavorite(f,yachimata);
  assert.equal(f.length,1);
  f=L.addFavorite(L.addFavorite(f,fuchuT),fuchuH);
  assert.deepEqual(f.map(p=>p.pref+p.name),['千葉県八街市','東京都府中市','広島県府中市']);
  assert.ok(L.isFavorite(f,{...fuchuH}));
  assert.ok(!L.isFavorite(f,sapporo));
});

test('上限は12か所',()=>{
  let f=[];for(const r of D.slice(0,20))f=L.addFavorite(f,L.rowToPlace(r));
  assert.equal(f.length,L.FAVORITE_MAX);
  assert.equal(L.FAVORITE_MAX,12);
});

test('削除と並べ替え（端では動かない）',()=>{
  let f=[yachimata,fuchuT,sapporo];
  assert.deepEqual(L.moveFavorite(f,sapporo,-1).map(p=>p.code),['12230','01100','13206']);
  assert.deepEqual(L.moveFavorite(f,yachimata,-1),f);
  assert.deepEqual(L.moveFavorite(f,sapporo,1),f);
  assert.deepEqual(L.removeFavorite(f,fuchuT).map(p=>p.code),['12230','01100']);
  assert.equal(f.length,3,'元の一覧は変更しない');
});

test('地名検索（団体コードなし）の地点も保存できる',()=>{
  const g={name:'富士山（静岡県）',lat:35.3606,lon:138.7274};
  const f=L.addFavorite([yachimata],g);
  assert.equal(f.length,2);
  assert.ok(L.isFavorite(f,{name:'別名',lat:35.3611,lon:138.7269}),'座標が同じなら同一地点');
});

test('保存データの読み込み：壊れたデータに強い',()=>{
  const saved=JSON.stringify([{code:'12230',name:'古い名前',lat:0,lon:0},{name:'x',lat:'a',lon:1},null,{code:'12230'},{name:'那覇',lat:26.2,lon:127.7}]);
  const f=L.loadFavorites(saved,byCode);
  assert.deepEqual(f.map(p=>p.name),['八街市','那覇'],'団体コードは最新データで置き換え、重複・不正値は除く');
  assert.equal(L.loadFavorites('{壊れた',byCode),null);
  assert.equal(L.loadFavorites(null,byCode),null);
  assert.deepEqual(L.loadFavorites('[]',byCode),[],'全部消した状態は空のまま保つ');
  assert.equal(L.loadFavorites(JSON.stringify(D.map(L.rowToPlace)),byCode).length,12);
});
