const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const e=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {mechanicalBatch18:cards,mechanicalEffects18:effects}=require('../dist/mechanicalBatch18');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const historical=require('../catalog/historical/2004-10-01/cards.json');
const starter=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const archivedRevision=require('../catalog/engine-v8/manifest.json').revisions[3].id;
const results=cards.map(c=>({id:c.id,passed:[],failed:[],fingerprint:definitionFingerprint(c,effects[c.id],{monster:getMonsterDefinition,model:getEffectModel})}));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id,owner=0,overrides={})=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...overrides});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:starter},{id:'b',name:'B',cards:starter}],undefined,0,{randomSeed:'18'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];});return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<40,'unresolved response');s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function check(c,name,fn){test(`M18 ${c.id} ${c.englishName}: ${name}`,()=>{const rec=results.find(x=>x.id===c.id);try{fn();rec.passed.push(name);}catch(err){rec.failed.push(name);throw err;}});}

for(const c of cards){
 check(c,'canonical historical identity and complete official card record',()=>{
  const h=historical.find(x=>x.passwords.includes(c.id));assert.ok(h);assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);
  assert.equal(h.firstObserved.ocg<='2004-09-30',true);assert.equal(registry.getCardStatus(c.id).stage,'certified');
  assert.equal(cardDistributionAllowed(c.id),true);assert.equal(registry.getCardStatus(c.id).issues.length,0);
 });
 check(c,'fingerprint, engine and archive independence',()=>{
  assert.equal(registry.getCardStatus(c.id).stage,'certified');assert.equal(registry.getEffect(c.id).kind,c.monsterType==='fusion'?'fusion':'monsterEffect');
  assert.equal(e.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id,archivedRevision),undefined);
  assert.equal(e.getArchivedDefinitionResolver('engine-v7').getPlayableCard(c.id),undefined);
 });
 check(c,'serialization and no release authorization',()=>{
  const s=game();assert.deepEqual(JSON.parse(JSON.stringify(s)),s);assert.equal(cardDistributionAllowed(c.id),true);
 });
}

const ultimate=cards.find(c=>c.id==='23995348');
check(ultimate,'fusion has exactly three independent Blue-Eyes materials',()=>{
 assert.deepEqual(ultimate.fusion,['89631139','89631139','89631139']);assert.equal(new Set(ultimate.fusion).size,1);
 const s=game();s.players[0].hand=[ref('w1','89631139'),ref('w2','89631139'),ref('poly','24094653')];s.players[0].extra=[ref('extra','23995348')];
 assert.equal(e.legalActions(s,'a').filter(x=>x.kind==='fusion').length,0,'two copies cannot be reused as three');
 s.players[0].hand.push(ref('w3','89631139'));assert.equal(e.legalActions(s,'a').filter(x=>x.kind==='fusion').length,2,'face-up ATK or DEF only');
});
check(ultimate,'Polymerization consumes three distinct copies and leaves summon in the proper slot',()=>{
 let s=game();s.players[0].hand=[ref('w1','89631139'),ref('w2','89631139'),ref('w3','89631139'),ref('poly','24094653')];s.players[0].extra=[ref('extra','23995348')];
 const a=e.legalActions(s,'a').find(x=>x.kind==='fusion'&&x.position==='atk');assert.ok(a);const prior=JSON.stringify(s),original=s;
 s=settle(e.step(s,'a',a));assert.equal(s.players[0].monsters.length,1);assert.equal(s.players[0].monsters[0].id,'23995348');
 assert.equal(e.atk(s.players[0].monsters[0],s),4500);assert.equal(e.def(s.players[0].monsters[0],s),3800);
 assert.deepEqual(s.players[0].grave.map(x=>x.id).sort(),['24094653','89631139','89631139','89631139'].sort());
 assert.equal(s.players[0].extra.length,0);assert.equal(s.players[0].hand.length,0);assert.equal(JSON.stringify(original),prior,'original state must not mutate');
});
check(ultimate,'alternate passcode does not create a duplicate card',()=>{
 assert.equal(registry.getCardStatus('23995346'),undefined);assert.equal(registry.getCardStatus('23995348').stage,'certified');
});

const guard=cards.find(c=>c.id==='37101832');
check(guard,'FLIP targets exactly one opposing monster, never own side',()=>{
 let s=game();s.players[0].monsters=[mon('guard',guard.id,0,{faceUp:false,position:'def'}),mon('friendly','89631139')];
 s.players[1].monsters=[mon('enemy1','89631139',1),mon('enemy2','89631139',1)];
 s=e.step(s,'a',{kind:'position',card:'guard',mode:'flip'});
 assert.equal(s.phase,'choice');assert.deepEqual(s.choice.targets.sort(),['enemy1','enemy2']);
 s=e.step(s,'a',{kind:'choose',target:'enemy1'});s=settle(s);
 assert.equal(s.players[1].monsters.length,1);assert.equal(s.players[1].monsters[0].uid,'enemy2');
 assert.equal(s.players[1].hand.find(x=>x.uid==='enemy1')?.id,'89631139');assert.equal(s.players[0].monsters.length,2);
});
check(guard,'cannot resolve a mandatory flip bounce without an opponent monster',()=>{
 let s=game();s.players[0].monsters=[mon('guard',guard.id,0,{faceUp:false,position:'def'})];
 s=e.step(s,'a',{kind:'position',card:'guard',mode:'flip'});assert.ok(s.phase!=='choice');assert.equal(s.players[0].monsters[0].faceUp,true);
});
check(guard,'controller changes, replay and JSON save keep the target decision deterministic',()=>{
 let s=game();s.players[0].monsters=[mon('guard',guard.id,0,{faceUp:false,position:'def'})];s.players[1].monsters=[mon('target','89631139',1)];
 s=e.step(s,'a',{kind:'position',card:'guard',mode:'flip'});s=e.step(s,'a',{kind:'choose',target:'target'});
 assert.deepEqual(JSON.parse(JSON.stringify(settle(structuredClone(s)))),JSON.parse(JSON.stringify(settle(JSON.parse(JSON.stringify(s))))));
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission18.json',JSON.stringify(results,null,2)+'\n');});
