const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),{mechanicalBatch20:cards}=require('../dist/mechanicalBatch20');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels'),{getMonsterDefinition}=require('../dist/monsterEffects');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy'),{duelCards}=require('../dist/duelIntegrity'),{archetypeCard}=require('../dist/cardIdentity');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const rows=cards.map(c=>({id:c.id,fingerprint:definitionFingerprint(c,r.getEffect(c.id),{monster:getMonsterDefinition,model:getEffectModel}),passed:[],failed:[]}));
const ref=(uid,id)=>({uid,id}),mon=(uid,id,owner=0,extra={})=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
const inventory=s=>duelCards(s).map(c=>c.uid+':'+c.id).sort();
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'21'.repeat(32)});assert.equal(s.resolverVersion,'engine-v9');s.turn=3;for(const p of s.players){p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];}return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function cast(s,c){s.players[0].hand=[ref('new',c.id)];const a=e.legalActions(s,'a').find(a=>a.kind===(c.field?'field':'spell')&&a.card==='new');assert.ok(a,c.id);return e.step(s,'a',a);}
function fixture(c){const s=game();
 if(c.monsterType==='fusion'){s.players[0].hand=[ref('poly','24094653'),...c.fusion.map((id,i)=>ref('mat'+i,id))];s.players[0].extra=[ref('fusion',c.id)];return s;}
 if(c.kind==='monster')s.players[0].monsters=[mon('source',c.id)];
 if(c.id==='91932350')s.players[1].monsters=[mon('wind','76812113',1)];
 if(c.id==='52040216'){s.players[0].monsters.push(mon('lady','76812113'));s.players[1].monsters=[mon('lady2','76812113',1)];}
 if(c.id==='40453765')s.players[0].monsters.push(mon('pair','20394040'));
 if(c.id==='20394040')s.players[0].monsters.push(mon('pair','40453765'));
 if(c.id==='47480070')s.players[0].monsters.push(mon('archer','91869203'));
 if(c.id==='38033121'){s.players[0].grave=[ref('dm1','46986414')];s.players[1].grave=[ref('dm2','46986414')];}
 if(c.id==='63224564')s.players[0].monsters=[mon('target','76812113')];
 if(c.id==='27967615'){const f=r.engineCatalog.find(x=>x.fusion&&x.level<=6);s.players[0].monsters=[mon('target',f.id,0,{properlySummoned:true})];}
 if(c.id==='81380218'){s.players[0].monsters=[mon('def','91152256',0,{position:'def'})];s.players[1].monsters=[mon('enemy','91152256',1,{position:'def'})];}
 if(c.id==='10012614')s.players[0].monsters=[mon('target','91152256')];return s;}
const boosts={'91932350':300,'52040216':600,'40453765':500,'20394040':500,'47480070':200,'38033121':600};
for(const c of cards){const row=rows.find(x=>x.id===c.id);function scenario(name,fn){test(`M21 active ${c.id} ${c.englishName}: ${name}`,()=>{try{fn();row.passed.push(name);}catch(error){row.failed.push(name);throw error;}});}
 scenario('identity',()=>{const h=require('../catalog/historical/2004-10-01/cards.json').find(h=>h.passwords.includes(c.id));assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),false);assert.equal(e.getArchivedDefinitionResolver('engine-v9').getPlayableCard(c.id).id,c.id);assert.equal(e.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id),undefined);});
 scenario('mechanic',()=>{let s=fixture(c);if(c.monsterType==='fusion'){const before=inventory(s),a=e.legalActions(s,'a').find(a=>a.kind==='fusion'&&a.extra==='fusion');assert.ok(a);s=settle(e.step(s,'a',a));assert.deepEqual(inventory(s),before);assert.equal(s.players[0].monsters[0].id,c.id);assert.equal(s.players[0].monsters[0].properlySummoned,true);assert.equal(archetypeCard(r.engineCard(c.id),'Archfiend'),true);}
  else if(c.kind==='monster')assert.equal(e.atk(s.players[0].monsters[0],s),c.atk+boosts[c.id]);
  else{s=settle(cast(s,c));const m=s.players[0].monsters[0];if(c.id==='63224564')assert.equal(e.atk(m,s),1800);if(c.id==='27967615'){assert.equal(e.atk(m,s),r.engineCard(m.id).atk+1500);assert.equal(e.def(m,s),r.engineCard(m.id).defense+1500);}if(c.field){assert.equal(e.def(m,s),1700);assert.equal(e.def(s.players[1].monsters[0],s),1700);}if(c.id==='10012614'){assert.equal(e.atk(m,s),1400);s=settle(e.step(s,'a',{kind:'battle'}));assert.equal(e.atk(s.players[0].monsters[0],s),1600);}}
 });
 scenario('negative',()=>{let s=fixture(c);if(c.monsterType==='fusion'){s.players[0].hand=s.players[0].hand.slice(0,2);assert.equal(e.legalActions(s,'a').some(a=>a.kind==='fusion'),false);}
  else if(c.kind==='monster'){s.players[0].monsters[0].faceUp=false;assert.equal(e.atk(s.players[0].monsters[0],s),c.atk);}
  else if(r.getEffect(c.id).kind==='equip'){s.players[0].monsters=[mon('wrong','91152256')];s.players[0].hand=[ref('new',c.id)];assert.equal(e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='new'),false);}
  else{s.phase='battle';s.players[0].hand=[ref('new',c.id)];assert.equal(e.legalActions(s,'a').some(a=>(a.kind==='spell'||a.kind==='field')&&a.card==='new'),false);}
 });
 if(c.kind==='monster'&&c.monsterType!=='fusion')scenario('legal-summon',()=>{
  let s=fixture(c);s.players[0].monsters=[mon('tribute0','91152256'),mon('tribute1','91152256')];s.players[0].hand=[ref('new-monster',c.id)];
  const count=c.level>=7?2:c.level>=5?1:0,tributes=Array.from({length:count},(_,i)=>'tribute'+i),before=inventory(s);
  const action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card==='new-monster'&&a.position==='atk'&&JSON.stringify([...a.tributes].sort())===JSON.stringify(tributes));
  assert.ok(action,c.englishName+' must have a legal summon with the correct Tribute count');
  s=settle(e.step(s,'a',action));assert.deepEqual(inventory(s),before);assert.ok(s.players[0].monsters.some(m=>m.uid==='new-monster'&&m.id===c.id));
  for(const uid of tributes)assert.ok(s.players[0].grave.some(c=>c.uid===uid));assert.ok(e.atk(s.players[0].monsters.find(m=>m.uid==='new-monster'),s)>=c.atk);
 });
 scenario('replay',()=>{let s=fixture(c);if(c.kind==='spell'){s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s=cast(s,c);assert.equal(s.phase,'response');assert.deepEqual(settle(structuredClone(s)),settle(JSON.parse(JSON.stringify(s))));}
  else{const raw=JSON.stringify(s);assert.deepEqual(e.step(s,'a',{kind:'end'}),e.step(JSON.parse(raw),'a',{kind:'end'}));assert.equal(JSON.stringify(s),raw);}
 });
 scenario('negation',()=>{let s=fixture(c);if(c.kind==='monster'&&c.monsterType!=='fusion'){s.players[1].backrow=[{uid:'drain',id:'82732705',faceUp:true,resolved:true,setTurn:0}];assert.equal(e.atk(s.players[0].monsters[0],s),c.atk);}
  else if(c.kind==='spell'){s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s=cast(s,c);const a=e.legalActions(s,'b').find(a=>a.kind==='trap'&&a.card==='jam');assert.ok(a);s=settle(e.step(s,'b',a));assert.equal(s.players[0].backrow.length,0);assert.equal(s.players[0].field??null,null);}
  else{const s0=fixture(c);s0.players[1].hand=[ref('cost','91152256')];s0.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];const a=e.legalActions(s0,'a').find(a=>a.kind==='fusion');s=e.step(s0,'a',a);const counter=e.legalActions(s,'b').find(a=>a.kind==='trap'&&a.card==='jam');assert.ok(counter);s=settle(e.step(s,'b',counter));assert.equal(s.players[0].monsters.length,0);assert.ok(s.players[0].hand.some(x=>x.uid==='mat0'));}
 });
 scenario('source-loss',()=>{let s=fixture(c);if(c.kind==='spell'){s=settle(cast(s,c));s.players[0].backrow=[];s.players[0].field=null;const m=s.players[0].monsters[0];assert.equal(e.atk(m,s),r.engineCard(m.id).atk);assert.equal(e.def(m,s),r.engineCard(m.id).defense);}
  else if(c.monsterType==='fusion'){s.players[0].hand=[ref('body',c.id)];s.players[0].extra=[];assert.equal(e.legalActions(s,'a').some(a=>a.kind==='summon'&&a.card==='body'),false);}
  else{const source=s.players[0].monsters.shift();s.players[0].grave.push(ref(source.uid,source.id));assert.equal(s.players[0].monsters.some(m=>m.uid==='source'),false);}
 });
}
test('M21 new duels enforce the combined three-copy Harpie rules-name limit',()=>{const bad=['76812113','76812113','76812113','91932350',...basic.slice(0,16)];assert.throws(()=>e.createDuel([{id:'a',name:'A',cards:bad},{id:'b',name:'B',cards:basic}]),/3/);});
test('M21 Banner expires on leaving Battle Phase, including a pending End Phase discard',()=>{const c=cards.find(c=>c.id==='10012614');let s=settle(cast(fixture(c),c));s=settle(e.step(s,'a',{kind:'battle'}));assert.equal(e.atk(s.players[0].monsters[0],s),1600);s.players[0].hand=Array.from({length:7},(_,i)=>ref('overflow'+i,'91152256'));s=settle(e.step(s,'a',{kind:'end'}));assert.equal(s.phase,'discard');assert.equal(e.atk(s.players[0].monsters[0],s),1400);});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission21.json',JSON.stringify(rows,null,2)+'\n');});
