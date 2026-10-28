const {test}=require('node:test');
const assert=require('node:assert/strict');
const duel=require('../dist/duelEngine');
const registry=require('../dist/effectRegistry');
const {searchSpellBatch25,searchSpellEffects25}=require('../dist/searchSpellBatch25');
const {searchZoneIssues}=require('../dist/searchZoneRules');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardCertifications}=require('../dist/cardCertifications');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json');
const starter=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
function game(){const s=duel.createDuel([{id:'a',name:'A',cards:starter},{id:'b',name:'B',cards:starter}],undefined,0,{randomSeed:'25'.repeat(32)});s.turn=3;s.players.forEach(p=>{p.hand=[];p.grave=[];p.backrow=[];p.monsters=[];});return s;}
function settle(s){for(let i=0;s.phase==='response';i++){assert.ok(i<30);s=duel.step(s,s.players[duel.decisionPlayer(s)].id,{kind:'pass'});}return s;}
function actions(s,id){s.players[0].hand=[ref('source',id)];return duel.legalActions(s,'a').filter(a=>a.kind==='spell'&&a.card==='source');}
function cast(s,id,uid){const available=actions(s,id),action=available.find(a=>a.target===uid);assert.ok(action,`${id} must offer ${uid}; got ${available.map(a=>a.target)}`);const before=JSON.stringify(s);const after=settle(duel.step(s,'a',action));assert.equal(JSON.stringify(s),before,'immutable transition');return after;}
const warrior=registry.engineCatalog.find(c=>c.kind==='monster'&&c.race==='Warrior'&&c.level<=4).id;
test('M25 six unique historical sources with exact runtime certification',()=>{
 assert.equal(searchSpellBatch25.length,6);
 for(const c of searchSpellBatch25){const h=history.find(x=>x.passwords.includes(c.id));assert.ok(h);assert.equal(h.konamiId,c.konamiId);assert.equal(h.names.en,c.englishName);assert.ok(h.firstObserved.world<='2004-09-30');assert.equal(registry.getCardStatus(c.id).stage,'certified');assert.equal(cardDistributionAllowed(c.id),false);assert.equal(cardCertifications[c.id].fingerprint,definitionFingerprint(c,searchSpellEffects25[c.id],{model:require('../dist/effectModels').getEffectModel}));}
});
const cases=[
 ['Terraforming','73628505','86318356','deck'],
 ['Reinforcement of the Army','32807846',warrior,'deck'],
 ['Fusion Sage','26902560','24094653','deck'],
 ['The Warrior Returning Alive','95281259',warrior,'grave'],
 ['Toon Table of Contents','89997728','59383041','deck'],
 ['Emblem of Dragon Destroyer from Deck','06390406','78193831','deck'],
 ['Emblem of Dragon Destroyer from Graveyard','06390406','78193831','grave']
];
for(const [title,id,target,zone]of cases)test(`M25 ${title}: select source and move exactly one card to hand`,()=>{
 const s=game();s.players[0][zone].push(ref('target',target));
 const after=cast(s,id,'target');
 assert.ok(after.players[0].hand.some(c=>c.uid==='target'&&c.id===target));
 assert.equal(after.players[0][zone].some(c=>c.uid==='target'),false);
 assert.equal(after.players[0].grave.some(c=>c.uid==='source'&&c.id===id),true);
});
test('M25 each spell refuses false candidates from wrong zone, kind, name or owner',()=>{
 for(const [id,uid,zone] of [
  ['73628505','76812113','deck'],['32807846','24094653','deck'],['26902560','76812113','deck'],
  ['95281259','24094653','grave'],['89997728','76812113','deck'],['06390406','24094653','deck']
 ]){const s=game();s.players[0][zone]=[ref('wrong',uid)];const list=actions(s,id);assert.equal(list.some(a=>a.target==='wrong'),false,`invalid target for ${id}`);}
});
test('M25 Emblem searches only its own Deck/Graveyard and never opponent zones',()=>{
 const s=game();s.players[1].deck.push(ref('enemyDeck','78193831'));s.players[1].grave.push(ref('enemyGY','78193831'));
 assert.equal(actions(s,'06390406').some(a=>['enemyDeck','enemyGY'].includes(a.target)),false);
});
test('M25 target is checked again at resolution: no replacement search',()=>{
 const s=game();s.players[0].deck.push(ref('target','24094653'));s.players[0].deck.push(ref('spare','24094653'));
 const a=actions(s,'26902560').find(a=>a.target==='target');assert.ok(a);let chain=duel.step(s,'a',a);
 // Simulated intervening effect removes the chosen card before the chain resolves.
 const removed=chain.players[0].deck.find(c=>c.uid==='target');chain.players[0].deck=chain.players[0].deck.filter(c=>c.uid!=='target');chain.players[0].grave.push(removed);
 chain=settle(chain);assert.equal(chain.players[0].hand.some(c=>c.uid==='spare'),false);
});
test('M25 rejects fabricated search predicates',()=>{
 for(const filter of [{},{race:'Dragon'},{kind:'spell',maxLevel:4},{kind:'spell',unknown:true}])assert.ok(searchZoneIssues({from:'deck',filter}).length);
 assert.ok(searchZoneIssues({from:'enemy',filter:{name:'Polymerization'}}).length);
});
