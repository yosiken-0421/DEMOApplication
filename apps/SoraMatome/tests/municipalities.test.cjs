// 全国市区町村データと検索のテスト（実API・実機での確認ではない）
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const L=require('../www/logic.js');
const D=require('../www/municipalities.js');
const names=(q,n)=>L.searchMunicipalities(D,q,n||5).map(p=>p.name+'/'+p.pref);

test('生成済みデータ：全国をそろえている',()=>{
  assert.ok(D.length>=1700,String(D.length));
  assert.equal(new Set(D.map(r=>r[4])).size,47);
  assert.ok(D.filter(r=>/市$/.test(r[1])).length>=770);
  for(const r of D){
    assert.match(r[0],/^\d{5}$/); assert.match(r[1],/[市区町村]$/,r[1]); assert.ok(r[2],r[1]);
    assert.ok(r[5]>20&&r[5]<46.5&&r[6]>122&&r[6]<154.5,r[1]);
    assert.match(r[7],/^\d{6}$/); assert.match(r[8],/^(\d{6})?$/);
  }
  assert.equal(new Set(D.map(r=>r[0])).size,D.length,'団体コードの重複');
});

test('生成済みデータ：代表的な地点の予報区',()=>{
  const get=c=>L.rowToPlace(D.find(r=>r[0]===c));
  assert.equal(get('12100').area,'120010'); // 千葉市＝千葉県北西部（千葉市公式で確認済み）
  assert.equal(get('12230').office,'120000');
  assert.equal(get('01100').office,'016000');
});

test('検索：漢字・よみ・カタカナ・ローマ字・「市」なし',()=>{
  for(const q of ['八街','八街市','やちまた','ヤチマタ','ﾔﾁﾏﾀ','yachimata','Yachimata','千葉県八街市','千葉 八街'])
    assert.deepEqual(names(q,1),['八街市/千葉県'],q);
});

test('検索：同名の市は県名つきで区別できる',()=>{
  const r=names('府中');
  assert.ok(r.includes('府中市/東京都')&&r.includes('府中市/広島県'));
  assert.deepEqual(names('広島 府中',1),['府中市/広島県']);
});

test('検索：県名だけ・県名で始まる町・ヶ/ケ',()=>{
  assert.ok(names('大阪府',30).every(x=>x.endsWith('/大阪府')));
  assert.equal(names('東京',1)[0],'千代田区/東京都');
  assert.deepEqual(names('福島町',1),['福島町/北海道']);
  assert.deepEqual(names('龍ヶ崎',1),['龍ケ崎市/茨城県']);
  assert.deepEqual(names('',5),[]);
  assert.deepEqual(names('ぞぞぞぞ',5),[]);
});

test('生成スクリプト：分割された市町村をまとめ、座標のないものは除外',()=>{
  const out=require('node:os').tmpdir()+'/sora-mini-'+process.pid+'.js';
  execFileSync('python3',['tools/build_municipalities.py','--area','tests/fixtures/area-mini.json','--wikidata','tests/fixtures/wikidata-mini.json','--out',out,'--min-check']);
  const m=require(out); fs.unlinkSync(out);
  const hm=m.find(r=>r[0]==='22130');
  assert.equal(hm[1],'浜松市'); assert.equal(hm[2],'はままつし'); assert.equal(hm[8],'220040');
  assert.ok(!m.some(r=>r[0]==='12999'));
});
