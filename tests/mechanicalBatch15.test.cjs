const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'admission15-'));process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const e=require('../dist/duelEngine'),engine=e.getArchivedDefinitionResolver('engine-v8'),r=require('../dist/effectRegistry'),{chooseNPC}=require('../dist/duelStore');
const {mechanicalBatch15:cards,mechanicalEffects15:effects}=require('../dist/mechanicalBatch15'),{definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),history=require('../catalog/historical/2004-10-01/cards.json');
const executions=new Map(cards.map(c=>[c.id,{id:c.id,fingerprint:definitionFingerprint(c,effects[c.id],{model:getEffectModel}),passed:[],failed:[]}]));
const mark=(id,name)=>executions.get(id).passed.push(name);
const mon=(uid,id,owner=1)=>({uid,id,owner,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
function game(c,side=1){const s=engine.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:'15'.repeat(32)});s.turn=3;s.players[0].hand=[{uid:'new',id:c.id}];s.players[1].hand=[];
 const race=effects[c.id].filter.races?.[0]??'Warrior',id=r.engineCatalog.find(c=>c.monsterType==='normal'&&c.race===race).id;s.players[side].monsters=[mon('victim',id,side)];
 if(effects[c.id].filter.equipped)s.players[0].backrow=[{uid:'equip',id:'56747793',faceUp:true,resolved:true,setTurn:0,equippedTo:'victim'}];return s;}
function activate(s){const a=e.legalActions(s,'a').find(a=>a.kind==='spell'&&a.card==='new');assert.ok(a);assert.equal(a.target,undefined);return e.step(s,'a',a);}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}
for(const c of cards){
 test(`M15 ${c.id} identity: ${c.englishName} is individually registered, fingerprinted and blocked for distribution`,()=>{
  const h=history.find(h=>h.passwords?.includes(c.id));assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);assert.equal(r.getCardStatus(c.id).stage,'certified');assert.equal(engine.getPlayableCard(c.id).id,c.id);assert.equal(cardDistributionAllowed(c.id),false);
  const initial=require('../catalog/engine-v8/manifest.json').revisions[0].id;assert.equal(engine.getPlayableCard(c.id,initial),undefined);assert.equal(e.getArchivedDefinitionResolver('engine-v7').getPlayableCard(c.id),undefined);mark(c.id,'identity');
 });
 test(`M15 ${c.id} mechanic: complete Normal Spell effect resolves through the committed catalog`,()=>{
  const done=settle(activate(game(c)));assert.equal(done.players[1].monsters.length,0);assert.ok(done.players[1].grave.some(x=>x.uid==='victim'));assert.ok(done.players[0].grave.some(x=>x.uid==='new'));assert.equal(done.players[0].lp,4000);mark(c.id,'mechanic');
 });
 test(`M15 ${c.id} negative: activation negation preserves the affected group`,()=>{
  const s=game(c);s.players[1].hand=[{uid:'cost',id:'91152256'}];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];let p=activate(s);const a=e.legalActions(p,'b').find(a=>a.kind==='trap'&&a.card==='jam');assert.ok(a);p=e.step(p,'b',a);const done=settle(p);assert.equal(done.players[1].monsters.length,1);assert.ok(done.players[1].grave.some(x=>x.uid==='cost'));mark(c.id,'negative');
 });
 test(`M15 ${c.id} replay: committed revision restores a pending command via the real dispatcher`,()=>{
  const s=game(c);s.players[1].hand=[{uid:'held-response-cost',id:'91152256'}];s.players[1].backrow=[{uid:'jam',id:'77414722',faceUp:false,setTurn:0}];const pending=activate(s);assert.equal(pending.phase,'response');const raw=JSON.stringify(pending);assert.deepEqual(settle(pending),settle(JSON.parse(raw)));assert.equal(JSON.stringify(pending),raw);mark(c.id,'replay');
 });
 test(`M15 ${c.id} AI: casts beneficial removal and rejects an exclusively harmful destruction`,()=>{
  const good=game(c),bad=game(c,0);assert.equal(chooseNPC(good,'a').kind,'spell');assert.equal(chooseNPC(good,'a').card,'new');const action=chooseNPC(bad,'a');assert.equal(action?.kind==='spell'&&action.card==='new',false);mark(c.id,'ai');
 });
}
test('M15: new v8 games and all eight new spells are admitted in classic 2v2 with deterministic recovery',()=>{
 const t=require('../dist/tagDuel');for(const c of cards){let s=t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[c.id,...basic.slice(1)]})),{classic:true,seed:c.id});assert.equal(s.core.resolverVersion,'engine-v8');
  const actor=t.tagDecisionMember(s).id,action=t.tagActions(s,actor).find(a=>a.kind==='end');assert.ok(action);const a=t.stepTagDuel(s,actor,action),b=t.stepTagDuel(JSON.parse(JSON.stringify(s)),actor,action);assert.deepEqual(a,b);t.assertTagDuel(a);
 }
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission15.json',JSON.stringify([...executions.values()],null,2)+'\n');require('../dist/database').db.close();fs.rmSync(folder,{recursive:true,force:true});});
