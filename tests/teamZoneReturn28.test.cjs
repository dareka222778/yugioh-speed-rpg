const {test}=require('node:test'),assert=require('node:assert/strict'),t=require('../dist/tagDuel'),e=require('../dist/duelEngine');
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function take(held,id){for(const zone of ['hand','deck']){const i=held[zone].findIndex(c=>c.id===id);if(i>=0)return held[zone].splice(i,1)[0];}throw Error('Fixture card missing');}
for(const first of [0,1,2,3])test('M28 Soul Reversal returns inactive partner card to its own Deck top, active seat '+first,()=>{
 const cards=['78864369','60694662',...basic.slice(2)];let s=t.createTagDuel([0,1,2,3].map(i=>({id:'m'+i,name:'M'+i,cards})),{classic:true,first,seed:'zone28-'+first});s.core.turn=3;
 const team=first%2,other=(first+2)%4,p=s.core.players[team],source=take(p,'78864369');p.hand.push(source);const reserve=s.core.teamRotation.reserves[other],target=take(reserve,'60694662');p.grave.push(target);const before=t.tagInventory(s).map(c=>c.uid).sort(),activeDeck=p.deck.map(c=>c.uid),topBefore=reserve.deck[0]?.uid;
 const actor=t.tagDecisionMember(s).id,action=t.tagActions(s,actor).find(a=>a.kind==='spell'&&a.card===source.uid);assert.ok(action);s=t.stepTagDuel(s,actor,action);assert.equal(s.core.choice.source,'selectedMovement');
 const replay=JSON.parse(JSON.stringify(s));s=t.stepTagDuel(s,actor,{kind:'choose',target:target.uid});const restored=t.stepTagDuel(replay,actor,{kind:'choose',target:target.uid});assert.deepEqual(JSON.parse(JSON.stringify(s)),JSON.parse(JSON.stringify(restored)));t.assertTagDuel(s);
 assert.deepEqual(t.tagInventory(s).map(c=>c.uid).sort(),before);assert.deepEqual(s.core.players[team].deck.map(c=>c.uid),activeDeck);assert.equal(s.core.teamRotation.reserves[other].deck[0].uid,target.uid);assert.equal(s.core.teamRotation.reserves[other].deck[1]?.uid,topBefore);assert.ok(!s.core.players[team].hand.some(c=>c.uid===target.uid));
});
