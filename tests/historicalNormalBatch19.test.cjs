/** Independently exercised packet P001. The second Vorse Raider password is an alias. */
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const e=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {historicalNormalBatch19:cards}=require('../dist/historicalNormalBatch19');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json');
const {revisions}=require('../catalog/engine-v8/manifest.json');
const starter=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const results=cards.map(c=>({id:c.id,fingerprint:definitionFingerprint(c,{kind:'normal'},{}),passed:[],failed:[]}));
function check(c,label,fn){test(`M19 P001 ${c.id} ${c.englishName}: ${label}`,()=>{const record=results.find(x=>x.id===c.id);try{fn();record.passed.push(label);}catch(error){record.failed.push(label);throw error;}});}
function game(){const s=e.createDuel([{id:'a',name:'A',cards:starter},{id:'b',name:'B',cards:starter}],undefined,0,{randomSeed:'19'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.monsters=[];p.backrow=[];p.grave=[];});return s;}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<30);s=e.step(s,s.players[e.decisionPlayer(s)].id,{kind:'pass'});}return s;}

for(const c of cards){
 check(c,'historical identification, normal type and primary reference',()=>{
  const record=history.find(r=>r.passwords.includes(c.id));assert.ok(record);
  assert.equal(record.names.en,c.englishName);assert.equal(record.konamiId,c.konamiId);
  assert.equal(record.firstObserved.world<='2004-09-30',true);
  assert.ok(record.classifications.includes('normal'));assert.equal(record.mechanics.includes('ritual'),false);
  for(const [key,source] of [['level','level'],['atk','atk'],['defense','def']])assert.equal(c[key],record[source]);
  const races={aqua:'Aqua',beastwarrior:'Beast-Warrior'};assert.equal(c.race,races[record.race]);
  assert.equal(c.attribute,record.attribute.toUpperCase());assert.match(c.source,/^https:\/\/www\.db\.yugioh-card\.com\/yugiohdb\/card_search\.action\?/);
 });
 check(c,'mechanical fingerprint and certification do not release card to the shop',()=>{
  assert.equal(registry.getCardStatus(c.id)?.stage,'certified');assert.deepEqual(registry.getCardStatus(c.id).issues,[]);
  assert.equal(registry.getEffect(c.id)?.kind,'normal');assert.equal(cardDistributionAllowed(c.id),false);
  assert.equal(e.getArchivedDefinitionResolver('engine-v7').getPlayableCard(c.id),undefined);
  assert.equal(e.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id,revisions[0].id),undefined);
 });
 check(c,'new current duel can summon, read true stats and conserve the same UID',()=>{
  let s=game();s.players[0].hand=[{uid:'new:'+c.id,id:c.id}];
  const action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card==='new:'+c.id&&a.position==='atk');assert.ok(action);
  const initial=JSON.stringify(s);const next=e.step(s,'a',action);assert.equal(JSON.stringify(s),initial,'never mutate input');
  s=settle(next);const summoned=s.players[0].monsters.find(m=>m.uid==='new:'+c.id);
  assert.ok(summoned);assert.equal(summoned.id,c.id);assert.equal(summoned.faceUp,true);
  assert.equal(e.atk(summoned,s),c.atk);assert.equal(e.def(summoned,s),c.defense);
  assert.equal(s.players[0].hand.find(x=>x.uid==='new:'+c.id),undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(s)),s);
 });
 check(c,'deterministic replay does not reinterpret historical card as an effect',()=>{
  const s=game();s.players[0].hand=[{uid:'new:'+c.id,id:c.id}];
  const action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card==='new:'+c.id&&a.position==='set');assert.ok(action);
  const once=settle(e.step(s,'a',action)),replayed=settle(e.step(JSON.parse(JSON.stringify(s)),'a',action));
  assert.deepEqual(once,replayed);assert.equal(once.players[0].monsters[0].position,'def');assert.equal(once.players[0].monsters[0].faceUp,false);
  assert.equal(once.players[0].monsters[0].id,c.id);
 });
}

test('M19 P001: only two remaining canonical historical normal identities; ritual and duplicate codes excluded',()=>{
 const oldIds=new Set(require('../catalog/engine-v8/'+revisions.at(-2).id+'.json').cards.map(c=>c.id));
 const pending=history.filter(h=>h.classifications.includes('normal')&&!h.mechanics.includes('ritual')&&h.passwords.length&&h.firstObserved.world<='2004-09-30'&&!h.passwords.some(id=>oldIds.has(id)));
 assert.deepEqual(pending.map(h=>h.names.en).sort(),['Slime Toad','Vorse Raider']);
 assert.equal(registry.getCardStatus('14898067'),undefined,'a second historical printing must not create a separate playable card');
 assert.equal(registry.enabledCardIds.length,815);assert.equal(registry.enabledCardIds.filter(cardDistributionAllowed).length,130);
});
after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-executions-mission19.json',JSON.stringify(results,null,2)+'\n');});
