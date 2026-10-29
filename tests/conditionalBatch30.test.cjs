const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const engine=require('../dist/duelEngine'),r=require('../dist/effectRegistry');
const b=require('../dist/conditionalBatch30');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const clone=x=>JSON.parse(JSON.stringify(x));
const ref=(uid,id)=>({uid,id});
const mon=(uid,id='91152256',extra={})=>({uid,id,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
const back=(uid,id,extra={})=>({uid,id,faceUp:false,setTurn:0,...extra});
const gadgets={'13839120':'41172955','41172955':'86445415','86445415':'13839120'};
function game(){
 const s=engine.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'30'.repeat(32)});
 s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];p.banished=[];p.lp=4000;});
 s.players[0].deck=[ref('filler1','91152256'),ref('filler2','91152256'),ref('filler3','91152256')];
 s.players[1].deck=[ref('other1','91152256'),ref('other2','91152256'),ref('other3','91152256')];
 s.players[0].monsters=[mon('own')];s.players[1].monsters=[mon('enemy','89631139')];return s;
}
function act(s,who,kind,pred=()=>true){const a=engine.legalActions(s,who).find(a=>a.kind===kind&&pred(a));assert.ok(a,`${kind} missing for ${who}: ${JSON.stringify(engine.legalActions(s,who))}`);return engine.step(s,who,a);}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30,'response loop');s=act(s,s.players[engine.decisionPlayer(s)].id,'pass');}return s;}
function finishGadget(s){for(let n=0;s.phase==='response'||s.phase==='choice';n++){assert.ok(n<20,'gadget choice loop');if(s.phase==='response'){s=settle(s);continue;}const source=s.choice.source,target=source==='triggerOptional'?'source':source==='monsterSearch'?'searched':undefined;assert.ok(target,source);s=act(s,'a','choose',a=>a.target===target);}return s;}
function prepare(c){
 const s=game();if(gadgets[c.id]){s.players[0].deck.push(ref('searched',gadgets[c.id]));s.players[0].hand.push(ref('source',c.id));return s;}
 if(['63391643','02314238'].includes(c.id))s.players[0].monsters.push(mon('magician','46986414'));
 if(c.id==='02314238')s.players[1].backrow.push(back('setEnemy','19159413'));
 if(c.id==='38411870'){s.players[0].monsters.push(mon('own2'));s.players[1].monsters.push(mon('enemy2'));}
 if(['28121403','20727787'].includes(c.id))s.players[1].backrow.push(back('equip','01435851',{faceUp:true,resolved:true,equippedTo:'enemy'}));
 if(c.id==='61044390')s.players[0].banished=Array.from({length:7},(_,i)=>ref('ban'+i,'91152256'));
 if(c.kind==='spell')s.players[0].hand.push(ref('source',c.id));else s.players[0].backrow.push(back('source',c.id));
 return s;
}
function activate(s,c){if(gadgets[c.id])return act(s,'a','summon',a=>a.card==='source'&&a.position==='atk');return act(s,'a',c.kind==='spell'?'spell':'trap',a=>a.card==='source'&&(b.conditionalEffects30[c.id].scope!=='selected'||a.target==='enemy'));}
const cards=b.conditionalBatch30;
const rows=cards.map(c=>({id:c.id,fingerprint:definitionFingerprint(c,b.conditionalEffects30[c.id],{model:getEffectModel,monster:id=>b.conditionalMonsters30[id]}),publicEngine:true,resolverVersion:'engine-v9',passed:[],failed:[]}));
for(const c of cards){const row=rows.find(x=>x.id===c.id);function scenario(name,fn){test('M30 '+c.englishName+': '+name,()=>{try{fn();row.passed.push(name);}catch(e){row.failed.push(name);throw e;}});}
 scenario('identity',()=>{const h=require('../catalog/historical/2004-10-01/cards.json').find(h=>h.konamiId===c.konamiId);assert.ok(h.passwords.includes(c.id));assert.equal(h.names.en,c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),true);});
 scenario('active-execution',()=>{
  let s=prepare(c);s=activate(s,c);s=gadgets[c.id]?finishGadget(s):settle(s);
  assert.equal(s.resolverVersion,'engine-v9');
  if(gadgets[c.id]){assert.deepEqual(s.players[0].hand.map(x=>x.uid),['searched']);assert.ok(s.players[0].monsters.some(x=>x.uid==='source'));}
  else if(c.id==='02314238')assert.ok(s.players[1].grave.some(x=>x.uid==='setEnemy'));
  else if(c.id==='20727787')assert.ok(s.players[1].grave.some(x=>x.uid==='equip'));
  else assert.ok(s.players[1].grave.some(x=>x.uid==='enemy'),c.englishName);
  if(c.id==='81510157')assert.equal(s.players[1].lp,5000);
  if(!gadgets[c.id])assert.ok(s.players[0].grave.some(x=>x.uid==='source'),c.englishName);
 });
 scenario('restore',()=>{const s=activate(prepare(c),c);const complete=t=>gadgets[c.id]?finishGadget(t):settle(t);assert.deepEqual(clone(complete(clone(s))),clone(complete(structuredClone(s))));});
 scenario('activation-restrictions',()=>{
  const s=prepare(c);if(gadgets[c.id]){s.players[0].deck=s.players[0].deck.filter(x=>x.uid!=='searched');const result=settle(activate(s,c));assert.equal(result.phase,'main');assert.ok(!result.choice);return;}
  switch(c.id){case '63391643':case '02314238':s.players[0].monsters=s.players[0].monsters.filter(m=>m.uid!=='magician');break;
   case '38411870':s.players[1].monsters.pop();break;
   case '28121403':case '20727787':s.players[1].backrow=[];break;
   case '61044390':s.players[0].banished.pop();break;
   default:s.players[1].monsters[0].faceUp=false;}
  assert.ok(!engine.legalActions(s,'a').some(a=>a.card==='source'&&(a.kind==='spell'||a.kind==='trap')));
 });
 scenario('illegal-action-preserves-input',()=>{const s=prepare(c),raw=JSON.stringify(s);assert.throws(()=>engine.step(s,'b',{kind:'spell',card:'source',target:'imaginary'}));assert.equal(JSON.stringify(s),raw);});
 scenario('negation',()=>{
  let s=prepare(c);if(gadgets[c.id]){s.players[1].backrow=[back('skill','82732705',{faceUp:true,resolved:true})];s=finishGadget(activate(s,c));assert.equal(s.players[0].hand.length,0);return;}
  if(c.kind==='spell'){s.players[1].backrow.push(back('counter','77414722'));s.players[1].hand=[ref('cost','91152256')];}
  else s.players[1].backrow.push(back('counter','03819470'));
  s=activate(s,c);s=act(s,'b','trap',a=>a.card==='counter');s=settle(s);
  assert.ok(s.players[1].monsters.some(x=>x.uid==='enemy'));
  if(c.id==='81510157')assert.equal(s.players[1].lp,4000);
  if(c.id==='02314238')assert.ok(s.players[1].backrow.some(x=>x.uid==='setEnemy'));
  if(c.id==='20727787')assert.ok(s.players[1].backrow.some(x=>x.uid==='equip'));
 });
}
test('M30 Gadgets each search the correct counterpart on Special Summon, not Flip Summon',()=>{
 for(const c of cards.filter(c=>gadgets[c.id])){
  let s=prepare(c);s.players[0].hand=[ref('reborn','83764718')];s.players[0].grave=[ref('source',c.id)];s=settle(act(s,'a','spell',a=>a.card==='reborn'&&a.target==='source'&&a.position==='atk'));s=finishGadget(s);assert.deepEqual(s.players[0].hand.map(x=>x.uid),['searched']);
  s=prepare(c);s.players[0].monsters.push(mon('flipSource',c.id,{faceUp:false,position:'def'}));s.players[0].hand=[];s=settle(act(s,'a','position',a=>a.card==='flipSource'&&a.mode==='flip'));assert.ok(!s.choice);assert.ok(!s.players[0].hand.length);
 }
});
test('M30 selected effects never retarget a changed target and Soul Taker heals only after actual destruction',()=>{
 for(const id of ['63391643','81510157']){
  let s=prepare(cards.find(c=>c.id===id));s.players[1].backrow=[back('book','14087893')];s=activate(s,cards.find(c=>c.id===id));s=act(s,'b','spell',a=>a.card==='book'&&a.target==='enemy');s=settle(s);
  assert.equal(s.players[1].monsters.some(x=>x.uid==='enemy'),id==='81510157');
  assert.equal(s.players[1].lp,4000);
 }
});
test('M30 group removal snapshots before equipment cleanup and includes facedown monsters for Chaos End',()=>{
 let s=prepare(cards.find(c=>c.id==='61044390'));s.players[1].monsters.push(mon('facedown','91152256',{faceUp:false,position:'def'}));s=settle(activate(s,cards.find(c=>c.id==='61044390')));assert.ok(s.players[1].grave.some(x=>x.uid==='facedown'));
 s=prepare(cards.find(c=>c.id==='20727787'));s.players[0].backrow.push(back('ownEquip','91595718',{faceUp:true,resolved:true,equippedTo:'own'}));s=settle(activate(s,cards.find(c=>c.id==='20727787')));assert.ok(s.players[0].grave.some(x=>x.uid==='ownEquip'));assert.ok(s.players[1].grave.some(x=>x.uid==='equip'));
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-conditional30.json',JSON.stringify(rows,null,2)+'\n');});
