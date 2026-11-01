const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('www/index.html','utf8');
test('weather sections',()=>{
 for(const id of ['location','temp','hours','days','autoTemp','jmaTemp','jmaText','refresh']) {
  assert.ok(html.includes('id="'+id+'"'),id);
 }
});
test('javascript syntax',()=>{
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 new Function(scripts[0][1]);
 new Function(fs.readFileSync('www/logic.js','utf8'));
 assert.match(html,/<script src="logic\.js"><\/script><script>/);
});
test('8d6c54以前の不具合が再発しない',()=>{
 assert.doesNotMatch(html,/i===0\?"今日/);
 // 地域は全国データから選ぶ（八街市を推測の予報区で固定しない）
 assert.match(html,/<script src="municipalities\.js"><\/script><script src="logic\.js"><\/script>/);
 assert.match(html,/"12230"/);
});
test('required source and warning attribution',()=>{
 assert.match(html,/Open-Meteo.com/);
 assert.match(html,/www\.jma\.go\.jp\/bosai\/warning/);
});
test('independent app identifier',()=>{
 const yml=fs.readFileSync('ios-native/project.yml','utf8');
 assert.match(yml,/com\.yosiken0421\.soramatome/);
 assert.doesNotMatch(yml,/com\.yosiken0421\.pikopia/);
});
test('native transport implemented',()=>{
 const swift=fs.readFileSync('ios-native/SoraMatome/SoraMatomeApp.swift','utf8');
 assert.match(swift,/weatherBridge/);
 assert.match(swift,/URLSession/);
});
