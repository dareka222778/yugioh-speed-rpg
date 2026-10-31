/** Reusable executed scenario adapter. A generated plan alone never counts as a pass. */
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const e=require('../../dist/duelEngine'),r=require('../../dist/effectRegistry'),{NORMAL_SCENARIOS}=require('../../dist/catalogCertification'),{starterContents}=require('../../dist/cardCatalog'),{definitionFingerprint}=require('../../dist/cardRegistry'),{getMonsterDefinition}=require('../../dist/monsterEffects'),{getEffectModel}=require('../../dist/effectModels'),{assertDuelState,duelCards}=require('../../dist/duelIntegrity');
const base=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),clone=s=>JSON.parse(JSON.stringify(s));
const game=()=>e.createDuel([{id:'a',name:'A',cards:base},{id:'b',name:'B',cards:base}],undefined,0,{randomSeed:'fa'.repeat(32)});
function act(s,who,kind,pred=()=>true){const a=e.legalActions(s,who).find(a=>a.kind===kind&&pred(a));assert.ok(a,kind);return e.step(s,who,a);}
function settle(s){for(let n=0;s.phase==='response';n++){assert.ok(n<20);s=act(clone(s),s.players[e.decisionPlayer(s)].id,'pass');}return s;}
function opponent(card){const s=game();s.turn=3;const c=s.players[1].hand.shift();c.id=card.id;s.players[1].monsters=[{...c,owner:1,faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0}];return {s,uid:c.uid};}
function conservation(s,initial){assertDuelState(clone(s));assert.deepEqual(duelCards(s).map(c=>c.uid).sort(),initial);}
function registerNormalCertification(cards,{reviews,reportFile}){
 const results=[];
 for(const card of cards){const fingerprint=definitionFingerprint(card,r.getEffect(card.id),{monster:getMonsterDefinition,model:getEffectModel}),result={id:card.id,fingerprint,passed:[],failed:[]};results.push(result);
  for(const scenario of NORMAL_SCENARIOS)test(`certification ${card.id} ${card.englishName}: ${scenario}`,()=>{try{
   if(scenario==='identity'){const review=reviews.find(v=>v.id===card.id);assert.ok(review);assert.equal(review.mechanicalFingerprint,fingerprint);assert.equal(review.primaryFacts.atk,card.atk);assert.equal(review.primaryFacts.defense,card.defense);assert.equal(review.primaryFacts.level,card.level);assert.equal(review.primaryFacts.race,card.race);assert.equal(review.primaryFacts.attribute,card.attribute);assert.equal(review.konamiId,card.konamiId);assert.equal(r.getEffect(card.id).kind,'normal');assert.equal(r.getCardStatus(card.id).stage,'certified');}
   else if(['normal-summon','set','json-restore'].includes(scenario)){
    let s=game();s.players[0].hand[0].id=card.id;const tributeCount=card.level>=7?2:card.level>=5?1:0;for(let i=0;i<tributeCount;i++){const index=s.players[0].deck.findIndex(c=>r.getPlayableCard(c.id).kind==='monster'),[c]=s.players[0].deck.splice(index,1);s.players[0].monsters.push({...c,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});}const initial=duelCards(s).map(c=>c.uid).sort(),uid=s.players[0].hand[0].uid,position=scenario==='set'?'set':'atk',action=e.legalActions(s,'a').find(a=>a.kind==='summon'&&a.card===uid&&a.position===position);assert.ok(action);assert.equal(action.tributes.length,tributeCount);const before=clone(s),next=e.step(s,'a',action);assert.deepEqual(clone(e.step(before,'a',action)),clone(next));s=clone(next);const m=s.players[0].monsters.find(m=>m.uid===uid);assert.equal(m.id,card.id);assert.equal(m.faceUp,position==='atk');assert.equal(e.atk(m,s),card.atk);assert.equal(e.def(m,s),card.defense);assert.ok(!e.legalActions(s,'a').some(a=>a.kind==='summon'));conservation(s,initial);
   }else if(scenario==='destroy'){
    let {s,uid}=opponent(card);s.players[0].hand[0].id='66788016';const initial=duelCards(s).map(c=>c.uid).sort();s=settle(act(s,'a','spell'));assert.ok(s.players[1].grave.some(c=>c.uid===uid));assert.ok(!s.players[1].monsters.some(c=>c.uid===uid));conservation(s,initial);
   }else if(scenario==='temporary-control'||scenario==='tribute-owner'){
    let {s,uid}=opponent(card);s.players[0].hand[0].id='04031928';const initial=duelCards(s).map(c=>c.uid).sort();s=settle(act(s,'a','spell',a=>a.target===uid));assert.equal(s.players[0].monsters.find(m=>m.uid===uid).owner,1);
    if(scenario==='tribute-owner'){s.players[0].hand[0].id='28279543';s=settle(act(clone(s),'a','summon',a=>a.position==='atk'&&a.tributes.includes(uid)));assert.ok(s.players[1].grave.some(c=>c.uid===uid));assert.ok(!s.players[0].grave.some(c=>c.uid===uid));}else{s=settle(act(clone(s),'a','end'));assert.ok(s.players[1].monsters.some(m=>m.uid===uid));assert.ok(!s.players[0].monsters.some(m=>m.uid===uid));}conservation(s,initial);
   }else if(scenario==='zone-capacity'){
    const s=game();s.players[0].hand[0].id=card.id;for(let i=0;i<3;i++){const index=s.players[0].deck.findIndex(c=>r.getPlayableCard(c.id).kind==='monster');assert.ok(index>=0);const [c]=s.players[0].deck.splice(index,1);s.players[0].monsters.push({...c,owner:0,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});}assertDuelState(s);const tributeCount=card.level>=7?2:card.level>=5?1:0,actions=e.legalActions(s,'a').filter(a=>a.kind==='summon'&&a.card===s.players[0].hand[0].uid);assert.throws(()=>e.step(s,'a',{kind:'summon',card:s.players[0].hand[0].uid,position:'atk',tributes:[]}));if(tributeCount===0)assert.equal(actions.length,0);else{assert.ok(actions.length);assert.ok(actions.every(a=>a.tributes.length===tributeCount));const next=e.step(s,'a',actions[0]);assert.equal(next.players[0].monsters.length,4-tributeCount);}assert.equal(s.players[0].monsters.length,3);
   }else throw Error('Scenario has no executable adapter');
   result.passed.push(scenario);
  }catch(error){result.failed.push(scenario);throw error;}});
 }
 after(()=>{fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(results,null,2)+'\n');});return results;
}
module.exports={registerNormalCertification};
