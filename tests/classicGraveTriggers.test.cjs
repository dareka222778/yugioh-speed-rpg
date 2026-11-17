const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDuel,step,legalActions}=require('../dist/duelEngine');
const {starterContents}=require('../dist/cardCatalog');
const main=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function game(){
 const s=createDuel([{id:'a',name:'A',cards:main},{id:'b',name:'B',cards:main}],()=>.5);
 s.turn=3;return s;
}
const monster=(uid,id,opts={})=>({uid,id,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0,...opts});
const ref=(uid,id)=>({uid,id});
function use(s,actor,kind,predicate=()=>true){
 const a=legalActions(s,actor).find(a=>a.kind===kind&&predicate(a));
 assert.ok(a,`missing ${kind}, phase ${s.phase}: ${JSON.stringify(legalActions(s,actor))}`);
 return step(s,actor,a);
}
test('Sangan and Witch are enabled only with printed cards, stats, and once-per-name grave triggers',()=>{
 const {getCard}=require('../dist/collection'),{getEffect}=require('../dist/effectRegistry'),{getMonsterEffect}=require('../dist/monsterEffects');
 for(const [id,atk,def,stat]of [['26202165',1000,600,'atk'],['78010363',1100,1200,'defense']]){
  assert.equal(getCard(id).atk,atk);assert.equal(getCard(id).defense,def);
  assert.equal(getEffect(id).kind,'monsterEffect');
  assert.deepEqual(getMonsterEffect(id),{trigger:'onSentToGrave',oncePerTurn:true,operation:{kind:'search',stat,maximum:1500}});
 }
});
test('Tributing Sangan for Cannon Soldier pays cost first then searches ATK <= 1500 at effect resolution',()=>{
 let s=game();
 s.players[0].monsters=[monster('cannon','11384280'),monster('sangan','26202165')];
 s.players[0].deck=[ref('eligible','91152256'),ref('too-strong','48305365'),ref('not-monster','38199696')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='sangan');
 assert.equal(s.players[1].lp,3500);
 assert.ok(s.players[0].grave.some(c=>c.uid==='sangan'));
 assert.equal(s.phase,'choice');assert.equal(s.choice.actor,0);assert.equal(s.choice.source,'monsterSearch');
 assert.deepEqual(s.choice.targets,['eligible']);
 assert.throws(()=>step(s,'a',{kind:'choose',target:'too-strong'}),/inválida/);
 s=use(s,'a','choose');
 assert.equal(s.phase,'main');assert.ok(s.players[0].hand.some(c=>c.uid==='eligible'));
 assert.equal(s.players[0].deck.length,2);
 assert.equal(s.blockedEffectNames[0]['91152256'],3);
});
test('Witch of the Black Forest selects monsters by DEF, not ATK',()=>{
 let s=game();s.players[0].monsters=[monster('cannon','11384280'),monster('witch','78010363')];
 s.players[0].deck=[ref('eligible-strong','48305365'),ref('eligible-small','91152256'),ref('blocked-high-def','15025844'),ref('spell','38199696')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='witch');
 assert.equal(s.phase,'choice');
 assert.deepEqual(new Set(s.choice.targets),new Set(['eligible-strong','eligible-small']));
 s=use(s,'a','choose',a=>a.target==='eligible-strong');
 assert.ok(s.players[0].hand.some(c=>c.uid==='eligible-strong'));
 assert.ok(s.players[0].deck.some(c=>c.uid==='blocked-high-def'));
});
test('search prevents ignition effects of the added name for the rest of that turn',()=>{
 let s=game();s.players[0].monsters=[monster('cannon','11384280'),monster('sangan','26202165')];
 s.players[0].deck=[ref('second-cannon','11384280')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='sangan');
 assert.equal(s.phase,'choice');
 s=use(s,'a','choose');
 assert.equal(s.blockedEffectNames[0]['11384280'],s.turn);
 assert.ok(!legalActions(s,'a').some(a=>a.kind==='monsterEffect'&&a.card==='cannon'));
 s.turn++;
 assert.ok(legalActions(s,'a').some(a=>a.kind==='monsterEffect'&&a.card==='cannon'));
});
test('Sangan can search only once per name per player per turn, even if two copies go to grave',()=>{
 let s=game();
 s.players[0].monsters=[monster('s1','26202165'),monster('s2','26202165')];
 s.players[0].hand=[ref('dark-hole','53129443')];
 s.players[0].deck=[ref('target1','91152256'),ref('target2','91152256')];
 s=use(s,'a','spell');
 assert.equal(s.phase,'choice');assert.equal(s.players[0].grave.filter(c=>c.id==='26202165').length,2);
 assert.equal(s.choice.source,'triggerOrder');
 s=use(s,'a','choose',a=>a.target==='s1');
 s=use(s,'a','choose',a=>a.target==='target1');
 assert.equal(s.phase,'main');
 assert.equal(s.players[0].hand.filter(c=>c.id==='91152256').length,1);
 assert.equal(s.players[0].deck.length,1);
});
test('Witch destroyed in face-down Defense by battle searches after damage',()=>{
 let s=game();s.phase='battle';
 s.players[0].monsters=[monster('attacker','91152256')];
 s.players[1].monsters=[monster('witch','78010363',{owner:1,position:'def',faceUp:false})];
 s.players[1].deck=[ref('target','48305365')];
 s=use(s,'a','attack',a=>a.target==='witch');
 assert.equal(s.phase,'choice');assert.equal(s.choice.actor,1);assert.equal(s.choice.source,'monsterSearch');
 assert.ok(s.players[1].grave.some(c=>c.uid==='witch'));
 s=use(s,'b','choose');
 assert.equal(s.phase,'battle');
 assert.ok(s.players[1].hand.some(c=>c.uid==='target'));
 assert.equal(s.players[0].lp,4000);assert.equal(s.players[1].lp,4000);
});
test('sent-to-grave trigger finds no cards, does not open empty choice or block the duel',()=>{
 let s=game();s.players[0].monsters=[monster('cannon','11384280'),monster('sangan','26202165')];
 s.players[0].deck=[ref('high','48305365')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='sangan');
 assert.equal(s.phase,'main');assert.equal(s.choice,undefined);
 assert.equal(s.players[1].lp,3500);
});
test('the graveyard effect belongs to the owner, even if the monster changed controller',()=>{
 let s=game();s.players[0].monsters=[monster('cannon','11384280'),monster('stolen','26202165',{owner:1})];
 s.players[1].deck=[ref('owner-card','91152256')];
 s.players[0].deck=[ref('controller-card','91152256')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='stolen');
 assert.equal(s.phase,'choice');assert.equal(s.choice.actor,1);
 s=use(s,'b','choose');
 assert.ok(s.players[1].hand.some(c=>c.uid==='owner-card'));
 assert.ok(!s.players[0].hand.some(c=>c.uid==='controller-card'));
});

test('deck search labels show individual candidate names in the acting player’s controls',()=>{
 const {actionLabel}=require('../dist/duelEngine');
 const {publicDuelData}=require('../dist/duelUI');
 let s=game();s.players[0].monsters=[monster('cannon','11384280'),monster('sangan','26202165')];
 s.players[0].deck=[ref('search-target','91152256'),ref('secret','48305365')];
 s=use(s,'a','monsterEffect',a=>a.tributes?.[0]==='sangan');
 const choice=legalActions(s,'a').find(a=>a.kind==='choose');
 assert.ok(choice);
 assert.match(actionLabel(s,'a',choice),/Guardião Celta/);
 assert.equal(legalActions(s,'b').length,0);
 const publicView=JSON.stringify(publicDuelData(s));
 assert.ok(!publicView.includes('search-target'));assert.ok(!publicView.includes('secret'));
});
