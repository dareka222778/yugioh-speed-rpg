const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const e=require('../dist/duelEngine'),r=require('../dist/effectRegistry'),{mechanicalBatch16:cards,mechanicalEffects16:effects}=require('../dist/mechanicalBatch16');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json'),basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const manifest=require('../catalog/engine-v8/manifest.json'),baseline=manifest.revisions[1].id;
const rows=cards.map(c=>({id:c.id,fingerprint:definitionFingerprint(c,effects[c.id],{monster:getMonsterDefinition,model:getEffectModel}),passed:[],failed:[]}));
const ref=(uid,id)=>({uid,id}),mon=(uid,id,owner=0,extra={})=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...extra});
function game(){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'16'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];});return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function cast(s,id){s.players[0].hand=[ref('new',id)];const a=e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='new');assert.ok(a);return e.step(s,'a',a);}
function field(card){const s=game();s.players[0].monsters=[mon('source',card.kind==='monster'?card.id:'91152256')];s.players[1].monsters=[mon('enemy','89631139',1)];
 if(card.id==='01434352')s.players[0].grave=[ref('g1','91152256'),ref('g2','89631139'),ref('spell','04542651')];
 if(card.id==='78193831')s.players[1].grave=[ref('g1','89631139'),ref('spell','04542651')];return s;}
for(const c of cards){const row=rows.find(x=>x.id===c.id);const scenario=(name,fn)=>test(`M16 ${c.id} ${c.englishName}: ${name}`,()=>{try{fn();row.passed.push(name);}catch(error){row.failed.push(name);throw error;}});
 scenario('identity',()=>{const h=history.find(h=>h.passwords.includes(c.id));assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),true);
  assert.equal(e.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id,baseline),undefined);assert.equal(e.getArchivedDefinitionResolver('engine-v7').getPlayableCard(c.id),undefined);
 });
 scenario('mechanic',()=>{let s=field(c);if(c.kind==='spell'){s=settle(cast(s,c.id));assert.equal(e.def(s.players[0].monsters[0],s),1500);assert.equal(e.def(s.players[1].monsters[0],s),2500);}
  else assert.equal(e.atk(s.players[0].monsters[0],s),c.id==='01434352'?600:3600);
 });
 scenario('negative',()=>{let s=field(c);if(c.kind==='spell'){s.phase='battle';s.players[0].hand=[ref('new',c.id)];assert.equal(e.legalActions(s,'a').some(a=>a.kind==='spell'&&a.card==='new'),false);}
  else{s.players[0].monsters[0].faceUp=false;assert.equal(e.atk(s.players[0].monsters[0],s),c.atk);}
 });
 scenario('replay',()=>{let s=field(c);if(c.kind==='spell'){
   s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s=cast(s,c.id);assert.equal(s.phase,'response');assert.deepEqual(settle(structuredClone(s)),settle(JSON.parse(JSON.stringify(s))));
  }else{const raw=JSON.stringify(s);assert.deepEqual(e.step(s,'a',{kind:'end'}),e.step(JSON.parse(raw),'a',{kind:'end'}));assert.equal(JSON.stringify(s),raw);}
 });
 scenario('negation',()=>{let s=field(c);if(c.kind==='spell'){
   s.players[1].hand=[ref('cost','91152256')];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];s=cast(s,c.id);const a=e.legalActions(s,'b').find(a=>a.kind==='trap'&&a.card==='jam');assert.ok(a);s=settle(e.step(s,'b',a));assert.equal(e.def(s.players[0].monsters[0],s),1200);
  }else{s.players[1].backrow=[{uid:'drain',id:'82732705',faceUp:true,resolved:true,setTurn:0}];assert.equal(e.atk(s.players[0].monsters[0],s),c.atk);s.players[1].backrow=[];assert.equal(e.atk(s.players[0].monsters[0],s),c.id==='01434352'?600:3600);}
 });
 scenario('source-loss',()=>{let s=field(c);if(c.kind==='spell'){
   s=settle(cast(s,c.id));s.players[0].backrow=[];assert.equal(e.def(s.players[0].monsters[0],s),1200);
  }else{const source=s.players[0].monsters.shift();s.players[0].grave.push(ref(source.uid,source.id));assert.equal(e.atk(s.players[1].monsters[0],s),3000);}
 });
 scenario('dynamic',()=>{let s=field(c);if(c.kind==='spell'){
   s=settle(cast(s,c.id));s.players[0].monsters.push(mon('later','91152256'));assert.equal(e.def(s.players[0].monsters[1],s),1500);
   s.players[0].backrow.push({uid:'second',id:c.id,faceUp:true,resolved:true,setTurn:0});assert.equal(e.def(s.players[0].monsters[0],s),1800);
  }else{const p=s.players[c.id==='01434352'?0:1],start=e.atk(s.players[0].monsters[0],s);p.grave.push(ref('new-monster','89631139'));assert.equal(e.atk(s.players[0].monsters[0],s),start+(c.id==='01434352'?300:500));p.grave.pop();assert.equal(e.atk(s.players[0].monsters[0],s),start);}
 });
}
test('M16 Buster: hidden Dragon identities cannot influence its modifier or the public battle estimate',()=>{const s=field(cards.find(c=>c.id==='78193831'));s.players[1].monsters[0].faceUp=false;assert.equal(e.atk(s.players[0].monsters[0],s),3100);
 const {publicBattleAssessment}=require('../dist/npcStrategy'),a=publicBattleAssessment(s,s.players[0].monsters[0],s.players[1].monsters[0]);s.players[1].monsters[0].id='91152256';assert.deepEqual(publicBattleAssessment(s,s.players[0].monsters[0],s.players[1].monsters[0]),a);
});
test('M16 continuous sources combine independently and recover after serialization',()=>{let s=field(cards.find(c=>c.id==='01434352'));s.players[0].monsters.push(mon('buster','78193831'));s=settle(cast(s,'04542651'));assert.equal(e.atk(s.players[0].monsters[0],s),600);assert.equal(e.atk(s.players[0].monsters[1],s),3100);assert.equal(e.def(s.players[0].monsters[0],s),300);const restored=JSON.parse(JSON.stringify(s));assert.equal(e.atk(restored.players[0].monsters[1],restored),3100);assert.deepEqual(e.step(s,'a',{kind:'end'}),e.step(restored,'a',{kind:'end'}));});
test('M16 AI summon: evaluates prospective Buster field source and does not mutate state',()=>{const {tacticalSummon}=require('../dist/npcStrategy'),s=game();s.players[0].hand=[ref('buster','78193831')];s.players[0].monsters=[mon('cost1','91152256'),mon('cost2','91152256')];s.players[1].monsters=[mon('dragon','89631139',1)];s.players[1].grave=[ref('g1','89631139'),ref('g2','89631139')];const raw=JSON.stringify(s),action=tacticalSummon(s,'a',e.legalActions(s,'a'));assert.equal(action.card,'buster');assert.equal(action.position,'atk');assert.equal(JSON.stringify(s),raw);const done=settle(e.step(s,'a',action));assert.equal(e.atk(done.players[0].monsters[0],done),4100);});
test('M16 AI summon: own Graveyard count includes Tributes and ignores opposing hidden identity',()=>{const {tacticalSummon}=require('../dist/npcStrategy'),s=game();s.players[0].hand=[ref('chaos','01434352')];s.players[0].grave=Array.from({length:8},(_,i)=>ref('g'+i,'91152256'));s.players[1].monsters=[mon('enemy','89631139',1,{faceUp:false})];const actions=e.legalActions(s,'a'),a=tacticalSummon(s,'a',actions);assert.equal(a.card,'chaos');assert.equal(a.position,'atk');s.players[1].monsters[0].id='91152256';assert.deepEqual(tacticalSummon(s,'a',actions),a);});
test('M16 AI regression: prospective Muka Muka leaves the hand before counting hand modifiers',()=>{const {tacticalSummon}=require('../dist/npcStrategy'),s=game();s.players[0].hand=[ref('muka','46657337'),ref('h1','04542651'),ref('h2','04542651'),ref('h3','04542651')];const info=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.atk===1600);assert.ok(info);s.players[1].monsters=[mon('enemy',info.id,1)];const actions=e.legalActions(s,'a').filter(a=>a.kind==='summon'&&a.card==='muka');const action=tacticalSummon(s,'a',actions);assert.equal(action.position,'set');});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission16.json',JSON.stringify(rows,null,2)+'\n');});
test('M16 Chaos: equipment stacks with live grave count and remains after monster-effect negation',()=>{let s=field(cards.find(c=>c.id==='01434352'));s=settle(cast(s,'04614116'));assert.equal(e.atk(s.players[0].monsters[0],s),900);s.players[0].grave.push(ref('third','91152256'));assert.equal(e.atk(s.players[0].monsters[0],s),1200);s.players[1].backrow=[{uid:'drain',id:'82732705',faceUp:true,resolved:true,setTurn:0}];assert.equal(e.atk(s.players[0].monsters[0],s),300);});
test('M16 Buster: separate copies never multiply one another and follow controller rather than owner',()=>{const s=field(cards.find(c=>c.id==='78193831'));s.players[0].monsters.push(mon('copy','78193831'));assert.equal(e.atk(s.players[0].monsters[0],s),3600);assert.equal(e.atk(s.players[0].monsters[1],s),3600);s.players[0].grave=[ref('g1','89631139'),ref('g2','89631139')];const source=s.players[0].monsters.shift();s.players[0].monsters.push(mon('own-dragon','89631139'));s.players[1].monsters.push(source);assert.equal(source.owner,0);assert.equal(e.atk(source,s),4100);assert.equal(e.atk(s.players[0].monsters[0],s),3600);});
test('M16 Shield: spell immunity prevents its modifier and removal restores the live source',()=>{let s=field(cards.find(c=>c.id==='04542651'));s.players[0].monsters.push(mon('effect','01434352'));s=settle(cast(s,'04542651'));s.players[1].backrow=[{uid:'immune',id:'20065549',faceUp:true,resolved:true,setTurn:0}];assert.equal(e.def(s.players[0].monsters[0],s),1200);assert.equal(e.def(s.players[0].monsters[1],s),300);s.players[1].backrow=[];assert.equal(e.def(s.players[0].monsters[0],s),1500);});
test('M16 AI cross-family: a prospective shared aura also strengthens the opposing public attacker',()=>{const {tacticalSummon}=require('../dist/npcStrategy'),s=game(),enemy=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.attribute==='LIGHT'&&c.atk>=600&&c.atk<1000);assert.ok(enemy);s.players[0].hand=[ref('hoshi','67629977')];s.players[1].monsters=[mon('enemy',enemy.id,1)];const action=tacticalSummon(s,'a',e.legalActions(s,'a'));assert.equal(action.card,'hoshi');assert.equal(action.position,'set');});
