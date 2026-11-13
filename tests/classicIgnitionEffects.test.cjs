const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,step,legalActions}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const cards=starterContents.warrior.flatMap(x=>Array(x.quantity).fill(x.id));
function game(){
 const s=createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],()=>.5);
 s.turn=3;s.phase='main';return s;
}
const monster=(uid,id='11384280')=>({uid,id,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
const action=(s,uid)=>legalActions(s,'a').filter(a=>a.kind==='monsterEffect'&&a.card==='cannon'&&a.tributes?.[0]===uid)[0];
test('Cannon Soldier is an enabled ignition monster with a one-monster Tribute cost',()=>{
 const {getCard}=require('../dist/collection'),{getMonsterEffect}=require('../dist/monsterEffects'),{getEffect}=require('../dist/effectRegistry');
 assert.equal(getCard('11384280').englishName,'Cannon Soldier');
 assert.equal(getCard('11384280').atk,1400);
 assert.equal(getCard('11384280').defense,1300);
 assert.equal(getEffect('11384280').kind,'monsterEffect');
 assert.deepEqual(getMonsterEffect('11384280'),{trigger:'ignition',cost:{kind:'tribute',count:1},operation:{kind:'burn',amount:500}});
});
test('Cannon Soldier pays exactly one legal monster as Tribute on activation',()=>{
 let s=game();s.players[0].monsters=[monster('cannon'),monster('fodder','91152256')];
 const legal=legalActions(s,'a').filter(a=>a.kind==='monsterEffect');
 assert.deepEqual(new Set(legal.map(a=>a.tributes[0])),new Set(['cannon','fodder']));
 assert.throws(()=>step(s,'a',{kind:'monsterEffect',card:'cannon',discards:[],tributes:['bad']}),/inválida/);
 assert.throws(()=>step(s,'a',{kind:'monsterEffect',card:'cannon',discards:[]}),/inválida/);
 s=step(s,'a',action(s,'fodder'));
 assert.equal(s.players[0].monsters.length,1);
 assert.equal(s.players[0].monsters[0].uid,'cannon');
 assert.ok(s.players[0].grave.some(c=>c.uid==='fodder'));
 assert.equal(s.players[1].lp,3500);
 assert.equal(s.phase,'main');
});
test('Cannon Soldier can Tribute itself; activated burn still resolves after source has left',()=>{
 let s=game();s.players[0].monsters=[monster('cannon')];
 const a=action(s,'cannon');assert.ok(a);
 s=step(s,'a',a);
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='cannon'));
 assert.equal(s.players[1].lp,3500);
 assert.equal(s.phase,'main');
});
test('cost is paid before chain response and is never refunded if opponent reacts',()=>{
 let s=game();s.players[0].monsters=[monster('cannon'),monster('fodder','91152256')];
 s.players[1].monsters=[{...monster('enemy','91152256'),owner:1}];
 s.players[1].backrow=[{uid:'boost',id:'17814387',faceUp:false,setTurn:1}];
 s=step(s,'a',action(s,'fodder'));
 assert.equal(s.phase,'response');assert.equal(s.pending.kind,'monsterEffect');
 assert.equal(s.players[0].monsters.length,1);
 assert.ok(s.players[0].grave.some(c=>c.uid==='fodder'));
 assert.equal(s.players[1].lp,4000);
 const response=legalActions(s,'b').find(a=>a.kind==='trap'&&a.target==='enemy');
 assert.ok(response);
 s=step(s,'b',response);
 assert.equal(s.players[1].lp,3500);
 assert.ok(s.players[0].grave.some(c=>c.uid==='fodder'));
});
test('repeated Cannon Soldier activations require a remaining face-up source and a monster to Tribute',()=>{
 let s=game();s.players[0].monsters=[monster('cannon'),monster('fodder1','91152256'),monster('fodder2','91152256')];
 s=step(s,'a',action(s,'fodder1'));
 s=step(s,'a',action(s,'fodder2'));
 assert.equal(s.players[1].lp,3000);
 assert.ok(action(s,'cannon'));
 s=step(s,'a',action(s,'cannon'));
 assert.equal(s.players[1].lp,2500);
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='monsterEffect'));
});
test('Cannon Soldier can win by effect damage instead of battle',()=>{
 let s=game();s.players[0].monsters=[monster('cannon')];s.players[1].lp=500;
 s=step(s,'a',action(s,'cannon'));
 assert.equal(s.phase,'finished');assert.equal(s.winner,'a');assert.equal(s.players[1].lp,0);
});
