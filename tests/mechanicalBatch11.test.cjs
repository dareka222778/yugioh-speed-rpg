const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry');
const {mechanicalBatch11:cards,mechanicalEffects11:definitions,mechanicalMonsters11:monsterDefinitions}=require('../dist/mechanicalBatch11');
const reviews=require('../docs/evidence/mission11-individual-reviews.json');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {assertDuelState,duelCards}=require('../dist/duelIntegrity');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const clone=structuredClone,ref=(uid,id)=>({uid,id});
const mon=(uid,id,owner=0,extra={})=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
const empty=()=>e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'b1'.repeat(32)});
function game(){const s=empty();s.turn=3;return s;}
function act(s,who,kind,predicate=()=>true){const action=e.legalActions(s,who).find(a=>a.kind===kind&&predicate(a));assert.ok(action,`Missing ${kind}: ${JSON.stringify(e.legalActions(s,who))}`);return e.step(s,who,action);}
function settle(s){for(let i=0;s.phase==='response';i++){assert.ok(i<30,'Unresolved chain');s=act(clone(s),s.players[e.decisionPlayer(s)].id,'pass');}return s;}
function cast(s,id,target){const uid='cast-'+id;s.players[0].hand.push(ref(uid,id));return settle(act(s,'a','spell',a=>a.card===uid&&(!target||a.target===target)));}
const normal=(filter,matched=true)=>r.engineCatalog.find(c=>c.monsterType==='normal'&&c.atk>0&&c.defense>0&&(!filter||matched?(!filter?.attribute||c.attribute===filter.attribute)&&(!filter?.races||filter.races.includes(c.race)):(filter.attribute?c.attribute!==filter.attribute:!filter.races.includes(c.race))));
const results=[];
for(const card of cards){
 const review=reviews.find(x=>x.id===card.id),def=definitions[card.id],monster=monsterDefinitions[card.id];
 const result={id:card.id,fingerprint:definitionFingerprint(card,def,{monster:getMonsterDefinition,model:getEffectModel}),passed:[],failed:[]};
 results.push(result);
 function scenario(label,fn){test(`mission11 ${card.id} ${card.englishName}: ${label}`,()=>{try{fn();result.passed.push(label);}catch(error){result.failed.push(label);throw error;}});}
 scenario('identity',()=>{
  assert.ok(review&&def);assert.equal(card.konamiId,review.konamiId);assert.equal(card.englishName,review.englishName);
  assert.ok(review.historicalOcGDate<='2004-09-30');assert.equal(card.summary,review.expectedText);
  assert.deepEqual(def,review.effect);assert.deepEqual(monster??null,review.monster);
  assert.equal(result.fingerprint,review.mechanicalFingerprint);
  assert.equal(r.getCardStatus(card.id).stage,'certified');assert.equal(cardDistributionAllowed(card.id),false);
  assert.equal(e.getArchivedDefinitionResolver('engine-v6').getPlayableCard(card.id),undefined);
 });
 scenario('mechanic',()=>{
  let s=game();
  if(def.kind==='equip'){
   const target=normal(def);assert.ok(target,'No representative normal monster for '+card.id);
   s.players[0].monsters=[mon('target',target.id)];s.players[1].monsters=[mon('enemy',target.id,1)];
   s=cast(s,card.id,'target');
   assert.equal(e.atk(s.players[0].monsters[0],s),Math.max(0,target.atk+def.atk));
   assert.equal(e.def(s.players[0].monsters[0],s),Math.max(0,target.defense+def.def));
   assert.equal(e.atk(s.players[1].monsters[0],s),target.atk);
   assert.ok(s.players[0].backrow.some(c=>c.id===card.id&&c.faceUp&&c.resolved));
  }else if(def.kind==='burn'){
   s=cast(s,card.id);assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,3700);
  }else if(def.kind==='sequence'){
   s=cast(s,card.id);assert.equal(s.players[0].lp,5000);assert.equal(s.players[1].lp,5000);
  }else if(monster.effect.trigger==='continuous'){
   s.phase='battle';s.players[0].monsters=[mon('attacker',card.id)];s.players[1].monsters=[mon('defender','91152256',1)];
   assert.ok(e.legalActions(s,'a').some(a=>a.kind==='attack'&&a.card==='attacker'&&!a.target));
   s=settle(act(s,'a','attack',a=>a.card==='attacker'&&!a.target));
   assert.equal(s.players[1].lp,4000-card.atk);assert.equal(s.players[1].monsters.length,1);
  }else{
   s.players[0].monsters=[mon('source',card.id),mon('cost1','91152256'),mon('cost2','48305365')];
   const action=e.legalActions(s,'a').find(a=>a.kind==='monsterEffect'&&a.tributes?.includes('cost1')&&a.tributes.includes('cost2'));
   assert.ok(action);s=settle(e.step(s,'a',action));assert.equal(s.players[0].lp,5000);
   assert.deepEqual(s.players[0].monsters.map(m=>m.uid),['source']);
   assert.deepEqual(s.players[0].grave.map(c=>c.uid).sort(),['cost1','cost2']);
  }
  assertDuelState(clone(s));
 });
 scenario('negative',()=>{
  let s=game();
  if(def.kind==='equip'){
   const wrong=normal(def,false);assert.ok(wrong,'No ineligible example for '+card.id);
   s.players[0].monsters=[mon('wrong',wrong.id)];s.players[0].hand=[ref('equip',card.id)];
   assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='equip'));
   assert.throws(()=>e.step(s,'a',{kind:'spell',card:'equip',target:'wrong'}));
  }else if(card.kind==='spell'){
   s.phase='battle';s.players[0].hand=[ref('spell',card.id)];
   assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='spell'));
  }else if(monster.effect.trigger==='continuous'){
   s.phase='battle';s.players[0].monsters=[mon('source',card.id,0,{faceUp:false,position:'def'})];s.players[1].monsters=[mon('def','91152256',1)];
   assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='attack'&&a.card==='source'));
  }else{
   s.players[0].monsters=[mon('source',card.id)];
   assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='monsterEffect'));
   assert.throws(()=>e.step(s,'a',{kind:'monsterEffect',card:'source',discards:[],tributes:['source','fake']}));
  }
  assertDuelState(clone(s));
 });
 scenario('replay',()=>{
  let s=game();s.players[0].hand.push(ref('new',card.id));
  if(def.kind==='equip')s.players[0].monsters=[mon('target',normal(def).id)];
  if(card.kind==='monster')s.players[0].monsters=[];
  const action=e.legalActions(s,'a').find(a=>a.card==='new'&&(a.kind===(card.kind==='monster'?'summon':'spell')));
  assert.ok(action);const snapshot=clone(s),first=e.step(s,'a',action),second=e.step(clone(snapshot),'a',action);
  assert.deepEqual(clone(first),clone(second));assert.equal(first.resolverVersion,'engine-v8');assert.equal(first.catalogRevision,snapshot.catalogRevision);
  assertDuelState(clone(first));
 });
 scenario('counter-or-continuous-negation',()=>{
  let s=game();
  if(card.kind==='spell'){
   if(def.kind==='equip')s.players[0].monsters=[mon('target',normal(def).id)];
   s.players[0].hand=[ref('spell',card.id)];
   s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s.players[1].hand=[ref('discard','91152256')];
   const before=[s.players[0].lp,s.players[1].lp];
   s=act(s,'a','spell',a=>a.card==='spell');
   s=settle(act(s,'b','trap',a=>a.card==='jam'));
   assert.deepEqual([s.players[0].lp,s.players[1].lp],before);
   assert.ok(s.players[0].grave.some(c=>c.id===card.id));
   if(def.kind==='equip')assert.equal(e.atk(s.players[0].monsters[0],s),r.engineCard(s.players[0].monsters[0].id).atk);
  }else if(monster.effect.trigger==='continuous'){
   s.phase='battle';s.players[0].monsters=[mon('source',card.id)];s.players[1].monsters=[mon('def','91152256',1)];
   s.players[1].backrow=[{uid:'skill',id:'82732705',faceUp:true,resolved:true,setTurn:0}];
   assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='attack'&&a.card==='source'&&!a.target));
  }else{
   s.players[0].monsters=[mon('source',card.id),mon('cost1','91152256'),mon('cost2','48305365')];
   s.players[1].backrow=[{uid:'skill',id:'82732705',faceUp:true,resolved:true,setTurn:0}];
   const action=e.legalActions(s,'a').find(a=>a.kind==='monsterEffect'&&!a.tributes.includes('source'));
   assert.ok(action);s=settle(e.step(s,'a',action));
   assert.equal(s.players[0].lp,4000);assert.equal(s.players[0].grave.length,2);
  }
  assertDuelState(clone(s));
 });
 scenario('source-loss-or-cost-recovery',()=>{
  let s=game();
  if(def.kind==='equip'){
   const target=normal(def);s.players[0].monsters=[mon('target',target.id)];
   s=cast(s,card.id,'target');
   assert.equal(e.atk(s.players[0].monsters[0],s),Math.max(0,target.atk+def.atk));
   // An actual Mystical Space Typhoon response destroys the live Equip.
   s.players[1].backrow=[{uid:'mst',id:'05318639',faceUp:false,setTurn:0}];
   s.players[0].hand.push(ref('bait','56260110'));
   s=act(s,'a','spell',a=>a.card==='bait');
   s=settle(act(s,'b','spell',a=>a.card==='mst'&&a.target==='cast-'+card.id));
   assert.equal(e.atk(s.players[0].monsters[0],s),target.atk);
   assert.equal(e.def(s.players[0].monsters[0],s),target.defense);
   assert.ok(s.players[0].grave.some(c=>c.uid==='cast-'+card.id));
  }else if(card.kind==='spell'){
   s.players[0].lp=200;s.players[1].lp=200;s=cast(s,card.id);
   assert.equal(s.players[0].lp,def.kind==='burn'?200:1200);
   assert.equal(s.players[1].lp,def.kind==='burn'?0:1200);
   if(def.kind==='burn')assert.equal(s.phase,'finished');
  }else if(monster.effect.trigger==='continuous'){
   s.phase='battle';s.players[0].monsters=[mon('source',card.id)];s.players[1].monsters=[mon('def','91152256',1)];
   s.players[1].backrow=[{uid:'waboku',id:'12607053',faceUp:false,setTurn:0}];
   s=act(s,'a','attack',a=>a.card==='source'&&!a.target);
   s=settle(act(s,'b','trap',a=>a.card==='waboku'));
   assert.equal(s.players[1].lp,4000);
  }else{
   s.players[0].monsters=[mon('source',card.id),mon('cost1','91152256'),mon('cost2','48305365')];
   const action=e.legalActions(s,'a').find(a=>a.kind==='monsterEffect'&&a.tributes.includes('source'));
   assert.ok(action);const before=clone(s),next=settle(e.step(s,'a',action));
   assert.deepEqual(next,settle(e.step(clone(before),'a',action)));
   assert.equal(next.players[0].lp,5000);
   assert.ok(next.players[0].grave.some(c=>c.uid==='source'));
  }
  assertDuelState(clone(s));
 });
}
test('all 17 new effects remain separate from inherited v7 historic rules',()=>{
 const manifest=require('../catalog/engine-v7/manifest.json');
 assert.equal(manifest.revisions.length,7);const previous=require('../catalog/engine-v7/'+manifest.revisions[4].id+'.json');
 assert.equal(previous.cards.length,723);for(const card of cards)assert.ok(!previous.cards.some(c=>c.id===card.id));
 assert.equal(r.enabledCardIds.length,749);
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission11.json',JSON.stringify(results,null,2)+'\n');});
