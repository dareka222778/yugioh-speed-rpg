const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const e=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {mechanicalBatch17:cards,mechanicalEffects17:effects}=require('../dist/mechanicalBatch17');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json');
const initial=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const baseline=require('../catalog/engine-v8/manifest.json').revisions[1].id;
const status=cards.map(c=>({id:c.id,passed:[],failed:[],fingerprint:definitionFingerprint(c,effects[c.id],{monster:getMonsterDefinition,model:getEffectModel})}));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id,owner=0,other={})=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...other});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:initial},{id:'b',name:'B',cards:initial}],undefined,0,{randomSeed:'17'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];});return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30,'unresolved chain');s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function cast(s,id){s.players[0].hand=[ref('spell',id)];const a=e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='spell');assert.ok(a,'legal Spell activation');return e.step(s,'a',a);}
function scenario(card,name,fn){const rec=status.find(x=>x.id===card.id);test(`M17 ${card.id} ${card.englishName}: ${name}`,()=>{try{fn();rec.passed.push(name);}catch(err){rec.failed.push(name);throw err;}});}

for(const c of cards){
 scenario(c,'independent historical identity and certificate; not distributed',()=>{
  const h=history.find(h=>h.passwords.includes(c.id));assert.ok(h);assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);
  assert.equal(registry.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),true);
  assert.equal(e.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id,baseline),undefined);
  assert.equal(e.getArchivedDefinitionResolver('engine-v7').getPlayableCard(c.id),undefined);
 });
 scenario(c,'definition is executable without invented operations',()=>{
  assert.equal(registry.getCardStatus(c.id).issues.length,0);assert.ok(registry.getEffect(c.id));
  if(c.kind==='monster')assert.equal(getMonsterDefinition(c.id).effect.trigger,'continuous');
 });
 scenario(c,'legal action / continuously exposed status',()=>{
  const s=game();if(c.kind==='spell'){
   s.players[1].backrow=[{uid:'opp',id:'04542651',faceUp:true,resolved:true,setTurn:0}];
   const out=settle(cast(s,c.id));assert.ok(out);assert.equal(e.legalActions(game(),'b').filter(a=>a.card==='spell').length,0);
  }else{
   const source=mon('candidate',c.id);s.players[0].monsters=[source];assert.ok(e.atk(source,s)>=0);
  }
 });
 scenario(c,'hidden identity cannot contribute continuous benefit',()=>{
  if(c.kind!=='monster')return;
  const s=game(),source=mon('candidate',c.id);s.players[0].monsters=[source];
  const visible=e.atk(source,s);source.faceUp=false;assert.equal(e.atk(source,s),c.atk);source.faceUp=true;assert.equal(e.atk(source,s),visible);
 });
 scenario(c,'save/replay determinism and no input mutation',()=>{
  let s=game();s.players[0].monsters=[mon('owner',c.kind==='monster'?c.id:'91152256')];
  if(c.kind==='spell'){
   s=cast(s,c.id);assert.deepEqual(settle(structuredClone(s)),settle(JSON.parse(JSON.stringify(s))));
  }
  else{const raw=JSON.stringify(s);assert.deepEqual(e.step(s,'a',{kind:'end'}),e.step(JSON.parse(raw),'a',{kind:'end'}));assert.equal(JSON.stringify(s),raw);}
 });
}

test('M17 historical aliases remain one playable identity, not two newly certified cards',()=>{
 const original=registry.engineCatalog.map(c=>c.id);assert.ok(original.includes('73134081'));assert.ok(original.includes('18144506'));
 for(const alias of ['73134082','18144507'])assert.equal(registry.getCardStatus(alias),undefined);
});
test('M17 Goblin Thief drains exactly 500, independent of response replay',()=>{
 let s=game();s.players[0].lp=2800;s.players[1].lp=1300;s=settle(cast(s,'45311864'));assert.equal(s.players[0].lp,3300);assert.equal(s.players[1].lp,800);
});
test('M17 Machine King counts itself and all visible Machines on both sides',()=>{
 const s=game();s.players[0].monsters=[mon('king','46700124')];const king=s.players[0].monsters[0];
 assert.equal(e.atk(king,s),2300);s.players[1].monsters=[mon('other','46700124',1)];assert.equal(e.atk(king,s),2400);
 s.players[1].monsters[0].faceUp=false;assert.equal(e.atk(king,s),2300);s.players[0].monsters.push(mon('nonmachine','91152256'));assert.equal(e.atk(king,s),2300);
});
test('M17 Perfect Machine King excludes self, dynamically counts opponent and owner',()=>{
 const s=game();s.players[0].monsters=[mon('king','18891691')];const king=s.players[0].monsters[0];
 assert.equal(e.atk(king,s),2700);s.players[1].monsters=[mon('machine','46700124',1)];assert.equal(e.atk(king,s),3200);
 s.players[1].monsters[0].faceUp=false;assert.equal(e.atk(king,s),2700);s.players[0].monsters.push(mon('ownmachine','46700124'));assert.equal(e.atk(king,s),3200);
 s.players[0].monsters[0].faceUp=false;assert.equal(e.atk(king,s),2700);
});
test('M17 Mudora uses own Fairy Graveyard, ignores opponent grave and nonmonsters',()=>{
 const s=game();s.players[0].monsters=[mon('mudora','82108372')];const m=s.players[0].monsters[0];
 assert.equal(e.atk(m,s),1500);s.players[0].grave=[ref('fairy','82108372'),ref('spell','73134082')];assert.equal(e.atk(m,s),1700);
 s.players[1].grave=[ref('opp','82108372')];assert.equal(e.atk(m,s),1700);s.players[0].grave.push(ref('fairy2','82108372'));assert.equal(e.atk(m,s),1900);
});
test('M17 Wodan counts only face-up Plant monsters on both fields',()=>{
 const plant=registry.engineCatalog.find(x=>x.kind==='monster'&&x.race==='Plant'&&x.monsterType==='normal');assert.ok(plant);
 const s=game();s.players[0].monsters=[mon('wodan','42883273')];const w=s.players[0].monsters[0];assert.equal(e.atk(w,s),900);
 s.players[1].monsters=[mon('plant',plant.id,1)];assert.equal(e.atk(w,s),1000);s.players[1].monsters[0].faceUp=false;assert.equal(e.atk(w,s),900);
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission17.json',JSON.stringify(status,null,2)+'\n');});
