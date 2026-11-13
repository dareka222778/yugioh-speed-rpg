const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,step,legalActions,actionLabel}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const ref=(uid,id)=>({uid,id});
const monster=(uid,id,opts={})=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...opts});
const game=()=>{const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;};
function use(s,actor,kind,pred=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&pred(a));assert.ok(a,`missing ${kind}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,a);}
test('Mystic Tomato uses the official DARK/1500 battle recruiter rule',()=>{
 const {getCard}=require('../dist/collection'),{getMonsterEffect}=require('../dist/monsterEffects'),{getEffect}=require('../dist/effectRegistry');
 const c=getCard('83011277');assert.equal(c.level,4);assert.equal(c.atk,1400);assert.equal(c.defense,1100);assert.equal(c.attribute,'DARK');
 assert.equal(getEffect('83011277').kind,'monsterEffect');
 assert.deepEqual(getMonsterEffect('83011277'),{trigger:'onBattleDestroyed',operation:{kind:'specialSummon',attribute:'DARK',maximumAtk:1500}});
});
test('destroyed by battle, Mystic Tomato can Special Summon a DARK monster from the owner Deck',()=>{
 let s=game();s.phase='battle';
 s.players[0].monsters=[monster('attacker','48305365')];s.players[1].monsters=[monster('tomato','83011277',{owner:1})];
 s.players[1].deck=[ref('dark','11384280'),ref('light','15025844'),ref('strong','48305365'),ref('spell','38199696')];
 s=use(s,'a','attack',a=>a.target==='tomato');
 assert.equal(s.choice.source,'triggerOptional');
 s=use(s,'b','choose',a=>a.target==='tomato');
 assert.equal(s.phase,'choice');assert.equal(s.choice.source,'monsterRecruit');assert.equal(s.choice.actor,1);
 assert.equal(s.players[1].lp,3700);
 assert.deepEqual(new Set(s.choice.targets),new Set(['dark']));
 assert.ok(s.players[1].grave.some(c=>c.uid==='tomato'));
 assert.throws(()=>step(s,'b',{kind:'choose',target:'strong'}),/inválida/);
 const option=legalActions(s,'b').find(a=>a.target==='dark');
 assert.match(actionLabel(s,'b',option),/Invocar do Deck/);
 s=use(s,'b','choose',a=>a.target==='dark');
 assert.equal(s.phase,'battle');assert.equal(s.players[1].monsters.length,1);
 assert.equal(s.players[1].monsters[0].uid,'dark');
 assert.equal(s.players[1].monsters[0].position,'atk');
 assert.equal(s.players[1].monsters[0].faceUp,true);
 assert.ok(!s.players[1].deck.some(c=>c.uid==='dark'));
 assert.equal(s.players[1].summoned,false);
});
test('Mystic Tomato has an explicit decline option, never forced by the engine',()=>{
 let s=game();s.phase='battle';
 s.players[0].monsters=[monster('attacker','48305365')];s.players[1].monsters=[monster('tomato','83011277',{owner:1})];
 s.players[1].deck=[ref('dark','11384280')];
 s=use(s,'a','attack');assert.equal(s.phase,'choice');
 assert.match(actionLabel(s,'b',{kind:'choose',target:'__skip__'}),/Não ativar efeito opcional/);
 s=use(s,'b','choose',a=>a.target==='__skip__');
 assert.equal(s.phase,'battle');assert.equal(s.players[1].monsters.length,0);
 assert.ok(s.players[1].deck.some(c=>c.uid==='dark'));
});
test('destroyed by effect or offered as a Tribute does not activate the battle recruiter',()=>{
 let s=game();s.players[0].monsters=[monster('tomato','83011277')];s.players[0].deck=[ref('dark','11384280')];
 s.players[0].hand=[ref('hole','53129443')];
 s=use(s,'a','spell');assert.equal(s.phase,'main');
 assert.equal(s.choice,undefined);assert.ok(s.players[0].grave.some(c=>c.uid==='tomato'));
 s=game();s.players[0].monsters=[monster('tomato','83011277'),monster('cannon','11384280')];
 s.players[0].deck=[ref('dark','26202165')];
 s=use(s,'a','monsterEffect',a=>a.card==='cannon'&&a.tributes?.includes('tomato'));
 assert.equal(s.phase,'main');assert.equal(s.choice,undefined);
});
test('no eligible DARK target leaves the battle state playable without a dead choice',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('attacker','48305365')];
 s.players[1].monsters=[monster('tomato','83011277',{owner:1})];
 s.players[1].deck=[ref('light','15025844'),ref('too-big','48305365')];
 s=use(s,'a','attack');
 assert.equal(s.phase,'battle');assert.equal(s.choice,undefined);
});
test('a battle-destroyed opponent-controlled Tomato attempts to recruit to its own owner field',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[monster('attacker','48305365')];
 s.players[1].monsters=[monster('borrowed-tomato','83011277',{owner:0})];
 s.players[0].deck=[ref('owner-target','11384280')];
 s=use(s,'a','attack');
 assert.equal(s.choice.source,'triggerOptional');
 s=use(s,'a','choose',a=>a.target==='borrowed-tomato');
 assert.equal(s.phase,'choice');assert.equal(s.choice.actor,0);assert.equal(s.choice.source,'monsterRecruit');
 s=use(s,'a','choose',a=>a.target==='owner-target');
 assert.ok(s.players[0].monsters.some(m=>m.uid==='owner-target'));
 assert.ok(!s.players[1].monsters.some(m=>m.uid==='owner-target'));
});
test('battle recruiter does not move a card when the physical owner has no free monster zone',()=>{
 let s=game();s.phase='battle';
 s.players[0].monsters=[monster('attacker','48305365'),monster('full-1','91152256'),monster('full-2','91152256')];
 s.players[1].monsters=[monster('borrowed-tomato','83011277',{owner:0})];
 s.players[0].deck=[ref('candidate','11384280')];
 s=use(s,'a','attack',a=>a.target==='borrowed-tomato');
 assert.equal(s.phase,'battle');assert.equal(s.choice,undefined);
 assert.equal(s.players[0].monsters.length,3);
 assert.ok(s.players[0].deck.some(c=>c.uid==='candidate'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='borrowed-tomato'));
 assert.ok(!s.players[1].grave.some(c=>c.uid==='borrowed-tomato'));
});
