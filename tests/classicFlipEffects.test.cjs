const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,step,legalActions}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const m=(uid,id,props={})=>({uid,id,owner:0,faceUp:false,position:'def',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...props});
function game(){
 const s=createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],()=>.5);
 s.turn=3;return s;
}
function act(s,actor,kind,pred=()=>true){
 const action=legalActions(s,actor).find(a=>a.kind===kind&&pred(a));
 assert.ok(action,`No ${kind}: ${JSON.stringify(legalActions(s,actor))}`);
 return step(s,actor,action);
}
test('five classic FLIP cards are registered with real effects and official stats',()=>{
 const {getMonsterEffect}=require('../dist/monsterEffects');
 const {getCard}=require('../dist/collection');
 const {enabledCardIds,getEffect}=require('../dist/effectRegistry');
 for(const [id,atk,def,kind]of [
  ['54652250',450,600,'destroy'],['07089711',450,500,'bounce'],
  ['31560081',300,400,'recover'],['28933734',900,400,'recover'],
  ['60694662',900,400,'draw']
 ]){
  assert.equal(getMonsterEffect(id).trigger,'flip');
  assert.equal(getMonsterEffect(id).operation.kind,kind);
  assert.equal(getCard(id).atk,atk);assert.equal(getCard(id).defense,def);
  assert.equal(getEffect(id).kind,'monsterEffect');assert.ok(enabledCardIds.includes(id));
 }
});
test('Man-Eater Bug declares a target before chain responses, and destroys the selected instance',()=>{
 let s=game();
 s.players[0].monsters=[m('bug','54652250')];
 s.players[1].monsters=[m('enemy','91152256',{owner:1,faceUp:true,position:'atk'})];
 s.players[1].backrow=[{uid:'reinforce',id:'17814387',setTurn:1,faceUp:false}];
 s=act(s,'a','position',a=>a.mode==='flip');
 // The FLIP target is selected before fast responses to the Flip Summon.
 if(s.phase==='response')s=act(s,'b','pass');
 assert.equal(s.phase,'choice');assert.deepEqual(new Set(s.choice.targets),new Set(['bug','enemy']));
 assert.throws(()=>step(s,'a',{kind:'choose',target:'not-on-field'}),/inválida/);
 s=act(s,'a','choose',a=>a.target==='enemy');
 assert.equal(s.pending.kind,'flip');assert.equal(s.chain.at(-1).target,'enemy');
 assert.equal(s.phase,'response');assert.equal(s.priority,1);
 s=act(s,'b','trap',a=>a.target==='enemy');
 assert.equal(s.phase,'main');
 assert.equal(s.players[1].monsters.length,0);
 assert.ok(s.players[1].grave.some(c=>c.uid==='enemy'));
 assert.equal(s.players[1].grave.filter(c=>c.uid==='enemy').length,1);
});
test('Man-Eater Bug may target itself (both sides are valid)',()=>{
 let s=game();s.players[0].monsters=[m('bug','54652250')];
 s=act(s,'a','position',a=>a.mode==='flip');assert.deepEqual(s.choice.targets,['bug']);
 s=act(s,'a','choose',a=>a.target==='bug');
 assert.equal(s.players[0].monsters.length,0);
 assert.ok(s.players[0].grave.some(c=>c.uid==='bug'));
});
test('Hane-Hane returns control-swapped monsters to their actual owner and cleans the field',()=>{
 let s=game();s.players[0].monsters=[m('hane','07089711')];
 s.players[1].monsters=[m('borrowed','91152256',{owner:0,faceUp:true,position:'atk'})];
 s=act(s,'a','position',a=>a.mode==='flip');
 assert.equal(s.phase,'choice');s=act(s,'a','choose',a=>a.target==='borrowed');
 assert.equal(s.players[1].monsters.length,0);
 assert.ok(s.players[0].hand.some(c=>c.uid==='borrowed'));
 assert.ok(!s.players[0].grave.some(c=>c.uid==='borrowed'));
});
test('Magician of Faith only retrieves owned Spells from the grave',()=>{
 let s=game();s.players[0].monsters=[m('faith','31560081')];
 s.players[0].grave=[{uid:'heal',id:'38199696'},{uid:'trap',id:'12607053'}];
 s.players[1].grave=[{uid:'enemy-spell',id:'66788016'}];
 s=act(s,'a','position',a=>a.mode==='flip');
 assert.deepEqual(s.choice.targets,['heal']);
 s=act(s,'a','choose');
 assert.ok(s.players[0].hand.some(c=>c.uid==='heal'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='trap'));
 assert.ok(s.players[1].grave.some(c=>c.uid==='enemy-spell'));
});
test('Mask of Darkness retrieves a Trap but not a Spell',()=>{
 let s=game();s.players[0].monsters=[m('mask','28933734')];
 s.players[0].grave=[{uid:'heal',id:'38199696'},{uid:'trap',id:'12607053'}];
 s=act(s,'a','position',a=>a.mode==='flip');assert.deepEqual(s.choice.targets,['trap']);
 s=act(s,'a','choose');assert.ok(s.players[0].hand.some(c=>c.uid==='trap'));
 assert.ok(s.players[0].grave.some(c=>c.uid==='heal'));
});
test('Skelengel draws a card on FLIP and loses on failed mandatory draw',()=>{
 let s=game();s.players[0].monsters=[m('angel','60694662')];
 const first=s.players[0].deck[0].uid,before=s.players[0].hand.length;
 s=act(s,'a','position',a=>a.mode==='flip');
 assert.equal(s.phase,'main');assert.equal(s.players[0].hand.length,before+1);
 assert.ok(s.players[0].hand.some(c=>c.uid===first));
 s=game();s.players[0].monsters=[m('angel','60694662')];s.players[0].deck=[];
 s=act(s,'a','position',a=>a.mode==='flip');
 assert.equal(s.phase,'finished');assert.equal(s.winner,'b');
});
test('combat damage and destruction happen BEFORE Man-Eater Bug FLIP effect',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[m('attacker','91152256',{faceUp:true,position:'atk'})];
 s.players[1].monsters=[m('bug','54652250',{owner:1})];
 s=act(s,'a','attack',a=>a.target==='bug');
 assert.equal(s.phase,'choice');assert.equal(s.players[1].monsters.length,0);
 assert.ok(s.players[1].grave.some(c=>c.uid==='bug'));
 assert.deepEqual(s.choice.targets,['attacker']);assert.equal(s.choice.actor,1);
 s=act(s,'b','choose');
 assert.equal(s.players[0].monsters.length,0);assert.equal(s.players[0].lp,4000);
 assert.ok(s.players[0].grave.some(c=>c.uid==='attacker'));
});
test('destroyed-by-battle Magician of Faith still retrieves a Spell',()=>{
 let s=game();s.phase='battle';s.players[0].monsters=[m('attacker','91152256',{faceUp:true,position:'atk'})];
 s.players[1].monsters=[m('faith','31560081',{owner:1})];
 s.players[1].grave=[{uid:'spell',id:'38199696'}];
 s=act(s,'a','attack',a=>a.target==='faith');
 assert.equal(s.phase,'choice');assert.equal(s.choice.actor,1);
 assert.ok(s.players[1].grave.some(c=>c.uid==='faith'));
 s=act(s,'b','choose');
 assert.ok(s.players[1].hand.some(c=>c.uid==='spell'));assert.equal(s.phase,'battle');
});
test('no legal targets means a recovery FLIP does not open a dead choice',()=>{
 let s=game();s.players[0].monsters=[m('faith','31560081')];s.players[0].grave=[];
 s=act(s,'a','position',a=>a.mode==='flip');
 assert.equal(s.phase,'main');assert.equal(s.choice,undefined);
});

test('a targeted FLIP effect does not retarget if its chosen monster leaves before resolution',()=>{
 let s=game();s.players[0].monsters=[m('bug','54652250')];
 s.players[1].monsters=[
  m('victim','91152256',{owner:1,faceUp:true,position:'atk'}),
  m('survivor','91152256',{owner:1,faceUp:true,position:'atk'})
 ];
 s.players[1].backrow=[{uid:'trap',id:'17814387',setTurn:1,faceUp:false}];
 s=act(s,'a','position',a=>a.mode==='flip');
 if(s.phase==='response')s=act(s,'b','pass');
 assert.equal(s.phase,'choice');
 s=act(s,'a','choose',a=>a.target==='victim');
 assert.equal(s.phase,'response');
 // Simulate another chain link having removed the target.
 const [departed]=s.players[1].monsters.splice(0,1);s.players[1].grave.push({uid:departed.uid,id:departed.id});
 s=act(s,'b','pass');
 assert.equal(s.players[1].monsters.length,1);
 assert.equal(s.players[1].monsters[0].uid,'survivor');
 assert.ok(s.log.some(line=>line.includes('não está mais no campo')));
});
