const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,legalActions,step}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(x=>Array(x.quantity).fill(x.id));
const monster=(uid,id='54098121',options={})=>({uid,id,owner:0,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...options});
const ref=(uid,id)=>({uid,id});
function game(){const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);s.turn=3;return s;}
function act(s,actor,kind,where=()=>true){const a=legalActions(s,actor).find(a=>a.kind===kind&&where(a));assert.ok(a,`No ${kind} in ${s.phase}: ${JSON.stringify(legalActions(s,actor))}`);return step(s,actor,a);}
test('Mysterious Puppeteer is an official Level 4 summon-watching effect monster',()=>{
 const {getCard}=require('../dist/collection'),{getMonsterEffect}=require('../dist/monsterEffects'),{getEffect}=require('../dist/effectRegistry');
 const c=getCard('54098121');assert.equal(c.level,4);assert.equal(c.atk,1000);assert.equal(c.defense,1500);
 assert.equal(getEffect('54098121').kind,'monsterEffect');
 assert.deepEqual(getMonsterEffect('54098121'),{trigger:'onOtherSummon',operation:{kind:'heal',amount:500}});
});
test('two face-up Puppeteers on opposite sides respond to another Normal Summon',()=>{
 let s=game();
 s.players[0].monsters=[monster('ours')];s.players[1].monsters=[monster('theirs','54098121',{owner:1})];
 s.players[0].hand=[ref('summoned','91152256')];
 s=act(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.phase,'main');
 assert.equal(s.players[0].lp,4500);assert.equal(s.players[1].lp,4500);
 assert.ok(s.players[0].monsters.some(m=>m.uid==='summoned'));
 assert.equal(s.summonTriggers?.length??0,0);
});
test('Puppeteer does not trigger its own summon; an existing different Puppeteer does',()=>{
 let s=game();s.players[0].hand=[ref('puppet','54098121')];
 s=act(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.players[0].lp,4000);
 s=game();s.players[0].monsters=[monster('existing')];s.players[0].hand=[ref('puppet','54098121')];
 s=act(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.players[0].lp,4500);
});
test('Flip Summons, but not setting a monster or revealing one by battle, trigger Puppeteer',()=>{
 let s=game();s.players[0].monsters=[monster('puppet'),monster('set','91152256',{position:'def',faceUp:false})];
 s=act(s,'a','position',a=>a.card==='set'&&a.mode==='flip');assert.equal(s.players[0].lp,4500);
 s=game();s.players[0].monsters=[monster('puppet')];s.players[0].hand=[ref('set','91152256')];
 s=act(s,'a','summon',a=>a.position==='set');assert.equal(s.players[0].lp,4000);
 s=game();s.phase='battle';s.players[0].monsters=[monster('puppet'),monster('attacker','91152256')];
 s.players[1].monsters=[monster('faceDown','91152256',{owner:1,position:'def',faceUp:false})];
 s=act(s,'a','attack',a=>a.card==='attacker');
 assert.equal(s.players[0].lp,4000);
});
test('a facedown Puppeteer gains no life points until face-up and alive',()=>{
 let s=game();s.players[0].monsters=[monster('puppet','54098121',{faceUp:false,position:'def'})];
 s.players[0].hand=[ref('other','91152256')];
 s=act(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.players[0].lp,4000);
});
test('Puppeteer summon heal resolves even if summoned monster was destroyed by Trap Hole',()=>{
 let s=game();s.players[0].monsters=[monster('puppet')];s.players[0].hand=[ref('other','91152256')];
 s.players[1].backrow=[{uid:'hole',id:'04206964',faceUp:false,setTurn:1}];
 s=act(s,'a','summon',a=>a.position==='atk');
 assert.equal(s.phase,'response');
 s=act(s,'b','trap',a=>a.card==='hole');
 assert.equal(s.players[0].lp,4500);
 assert.equal(s.players[0].monsters.length,1);
 assert.ok(s.players[0].grave.some(c=>c.uid==='other'));
});
