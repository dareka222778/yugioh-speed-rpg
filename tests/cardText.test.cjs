const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'card-pt-'));process.env.DATABASE_PATH=path.join(tmp,'game.sqlite');
const {cardRulesPT,racePT,attributePT}=require('../dist/cardText'),r=require('../dist/effectRegistry'),collection=require('../dist/collection');
test('every enabled card has a bounded Portuguese operational description and translated factual types',()=>{
 for(const id of r.enabledCardIds){const c=r.getPlayableCard(id),text=cardRulesPT(id);assert.ok(text.length>80&&text.length<=1024,id);assert.ok(!/undefined|\[object Object\]/.test(text),id);if(c.race)assert.ok(racePT[c.race],c.race);if(c.attribute)assert.ok(attributePT[c.attribute],c.attribute);assert.equal(collection.cardMessage(c).embeds[0].toJSON().fields.find(f=>f.name.startsWith('Regras em português')).value,text);}
});
test('descriptions distinguish untargeted mass removal, attack-only removal, costs and field scope',()=>{
 assert.ok(!cardRulesPT('12580477').includes('em Ataque'));assert.match(cardRulesPT('44095762'),/em Ataque/);assert.match(cardRulesPT('77414722'),/descarte 1 carta como custo/);assert.match(cardRulesPT('03819470'),/mais de 1000 PV/);assert.match(cardRulesPT('86318356'),/dos dois jogadores/);assert.match(cardRulesPT('70368879'),/oponente ganha 1000 PV/);assert.match(cardRulesPT('07089711'),/proprietário/);assert.match(cardRulesPT('26202165'),/embaralhe/);
});
after(()=>{require('../dist/database').db.close();fs.rmSync(tmp,{recursive:true,force:true});});
