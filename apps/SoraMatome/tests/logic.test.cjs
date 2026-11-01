// 実通信なしの決定的テスト（実API・実機での動作確認ではない）
const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../www/logic.js');
const jma=require('./fixtures/jma-120000.json');
const geo=require('./fixtures/geocode-yachimata.json');
const at=s=>new Date(s);

test('都道府県→気象庁府県予報区コード',()=>{
  assert.equal(L.officeForPrefecture('千葉県'),'120000');
  assert.equal(L.officeForPrefecture('東京都'),'130000');
  assert.equal(L.officeForPrefecture('大阪府'),'270000');
  assert.equal(L.officeForPrefecture('青森県'),'020000');
  // 予報区が複数ある道県は推測しない
  for(const p of ['北海道','鹿児島県','沖縄県','不明県',undefined]) assert.equal(L.officeForPrefecture(p),null);
});

test('天気コード',()=>{
  assert.deepEqual(L.weatherInfo(0),['☀️','快晴']);
  assert.equal(L.weatherInfo(45)[1],'霧');
  assert.equal(L.weatherInfo(63)[1],'雨');
  assert.equal(L.weatherInfo(95)[1],'雷雨');
  assert.equal(L.weatherInfo(20)[1],'不明');
  assert.equal(L.weatherInfo(null)[1],'不明');
});

test('時間別予報の開始位置は日本時間で決まる',()=>{
  const times=['2026-11-02T08:00','2026-11-02T09:00','2026-11-02T10:00'];
  // UTC 00:30 = JST 09:30 → 09:00の枠
  assert.equal(L.hourlyStart(times,at('2026-11-02T00:30:00Z')),1);
  // すべて過去なら -1（古いキャッシュを「現在」として表示しない）
  assert.equal(L.hourlyStart(times,at('2026-11-03T00:00:00Z')),-1);
  assert.equal(L.hourlyStart(undefined,at('2026-11-02T00:00:00Z')),-1);
});

test('日付ラベルは日本時間の今日・明日',()=>{
  // UTC 11/1 16:00 = JST 11/2 01:00
  const now=at('2026-11-01T16:00:00Z');
  assert.equal(L.dayLabel('2026-11-02',now),'今日 11/02');
  assert.equal(L.dayLabel('2026-11-03',now),'明日 11/03');
  assert.equal(L.dayLabel('2026-11-04',now),'11/04（水）');
  assert.equal(L.dayLabel('2026-11-01',now),'11/01（日）');
});

test('気象庁JSON：区域指定あり',()=>{
  const r=L.parseJmaForecast(jma,'120020',at('2026-11-02T03:00:00Z'));
  assert.equal(r.exact,true);
  assert.equal(r.title,'北東部');
  assert.equal(r.lines.length,3);
  assert.match(r.lines[1],/くもり 時々 雨/);
  assert.equal(r.office,'銚子地方気象台');
});

test('気象庁JSON：区域未確認なら全区域を並べ、1区域を推測しない',()=>{
  for(const code of [undefined,'999999']){
    const r=L.parseJmaForecast(jma,code,at('2026-11-02T03:00:00Z'));
    assert.equal(r.exact,false);
    assert.equal(r.lines.length,3);
    assert.ok(r.lines.some(x=>x.startsWith('北西部')));
    assert.ok(r.lines.some(x=>x.startsWith('南部')));
  }
});

test('気象庁JSON：古い発表・壊れた形式はエラー',()=>{
  assert.throws(()=>L.parseJmaForecast(jma,'120010',at('2026-11-04T00:00:00Z')),/古い発表/);
  assert.throws(()=>L.parseJmaForecast([],'120010',at('2026-11-02T03:00:00Z')));
  assert.throws(()=>L.parseJmaForecast(null,'120010',at('2026-11-02T03:00:00Z')));
  const noDate=JSON.parse(JSON.stringify(jma));delete noDate[0].reportDatetime;
  assert.throws(()=>L.parseJmaForecast(noDate,'120010',at('2026-11-02T03:00:00Z')),/発表時刻/);
  const empty=JSON.parse(JSON.stringify(jma));empty[0].timeSeries[0].areas[0].weathers=[];
  assert.throws(()=>L.parseJmaForecast(empty,'120010',at('2026-11-02T03:00:00Z')),/内容なし/);
});

test('地域検索：日本の結果だけを使い、府県予報区を付ける',()=>{
  const p=L.placeFromGeocode(geo);
  assert.deepEqual(p,{name:'八街市（千葉県）',lat:35.66,lon:140.32,office:'120000'});
  assert.equal(p.area,undefined);
  assert.equal(L.placeFromGeocode({results:[{name:'札幌市',latitude:43,longitude:141,country_code:'JP',admin1:'北海道'}]}).office,undefined);
  assert.equal(L.placeFromGeocode({}),null);
  assert.equal(L.placeFromGeocode({results:[{name:'Paris',latitude:1,longitude:2,country_code:'FR'}]}),null);
});

test('キャッシュの有効期限',()=>{
  const now=at('2026-11-02T06:00:00Z');
  assert.equal(L.cacheUsable({time:now.getTime()-3600000,data:{}},now,6),true);
  assert.equal(L.cacheUsable({time:now.getTime()-7*3600000,data:{}},now,6),false);
  assert.equal(L.cacheUsable({time:now.getTime()+3600000,data:{}},now,6),false);
  assert.equal(L.cacheUsable(null,now,6),false);
});
