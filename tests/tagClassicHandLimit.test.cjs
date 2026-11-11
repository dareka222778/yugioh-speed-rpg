const {test}=require('node:test'),assert=require('node:assert/strict');
const tag=require('../dist/tagDuel'),registry=require('../dist/effectRegistry');
const cards=tag.tagNormalCardIds.filter(id=>(registry.getPlayableCard(id).level??0)<=4).slice(0,10).flatMap(id=>[id,id]);
function game(first=0){return tag.createTagDuel([0,1,2,3].map(i=>({id:'member-'+i,name:'Membro '+i,cards})),{seed:'classic-hand-limit-2v2',first,classic:true});}
function end(s,member){return tag.stepTagDuel(s,member,{kind:'end'});}
function discard(s,member){const action=tag.tagActions(s,member).find(a=>a.kind==='discard');assert.ok(action,'o participante ativo precisa receber uma opção de descarte');return tag.stepTagDuel(JSON.parse(JSON.stringify(s)),member,action);}
test('classic 2v2 keeps seven cards during Main Phase and enforces six only in the active member End Phase',()=>{
 let s=game();const p=s.core.players[0];p.hand.push(...p.deck.splice(0,3));
 assert.equal(tag.tagMemberHand(s,'member-0').length,7);assert.equal(s.core.phase,'main');
 assert.ok(!tag.tagActions(s,'member-0').some(a=>a.kind==='discard'));
 s=end(s,'member-0');assert.equal(s.core.phase,'discard');assert.equal(tag.tagDecisionMember(s).id,'member-0');
 assert.deepEqual(tag.tagActions(s,'member-1'),[]);
 const count=tag.tagInventory(s).length;s=discard(s,'member-0');
 assert.equal(s.core.phase,'main');assert.equal(tag.tagDecisionMember(s).id,'member-1');
 assert.equal(tag.tagMemberHand(s,'member-0').length,6);assert.equal(tag.tagInventory(s).length,count);
 const inventory=tag.tagInventory(s);assert.equal(new Set(inventory.map(c=>c.uid)).size,inventory.length);
});
test('classic 2v2 enforces the six-card limit for every starting seat and preserves the next seat',()=>{
 for(let first=0;first<4;first++){
  let s=game(first),member='member-'+first,team=first%2,p=s.core.players[team];
  p.hand.push(...p.deck.splice(0,3));assert.equal(tag.tagMemberHand(s,member).length,7);
  s=end(s,member);assert.equal(s.core.phase,'discard');assert.equal(tag.tagDecisionMember(s).id,member);
  s=discard(s,member);assert.equal(tag.tagMemberHand(s,member).length,6);
  assert.equal(tag.tagDecisionMember(s).id,'member-'+((first+1)%4));
  assert.equal(tag.tagInventory(s).length,80);assert.equal(new Set(tag.tagInventory(s).map(c=>c.uid)).size,80);
 }
});
test('inactive partner hand stays private and its own End Phase discard survives JSON restoration',()=>{
 let s=game();const reserve=s.reserves[2];reserve.hand.push(...reserve.deck.splice(0,3));
 assert.equal(tag.tagMemberHand(s,'member-2').length,7);assert.deepEqual(tag.tagActions(s,'member-2'),[]);
 const privateCard=tag.tagMemberHand(s,'member-2')[0];
 const publicState=JSON.stringify(tag.publicTagDuel(s));
 assert.ok(!publicState.includes(privateCard.uid));assert.ok(!publicState.includes(privateCard.id));
 s=end(s,'member-0');assert.equal(tag.tagDecisionMember(s).id,'member-1');
 assert.equal(tag.tagMemberHand(s,'member-2').length,7);assert.deepEqual(tag.tagActions(s,'member-2'),[]);
 s=end(s,'member-1');assert.equal(tag.tagDecisionMember(s).id,'member-2');
 assert.equal(tag.tagMemberHand(s,'member-2').length,8);
 s=end(s,'member-2');assert.equal(s.core.phase,'discard');assert.equal(tag.tagDecisionMember(s).id,'member-2');
 s=JSON.parse(JSON.stringify(s));s=discard(s,'member-2');
 assert.equal(s.core.phase,'discard');assert.equal(tag.tagMemberHand(s,'member-2').length,7);
 s=JSON.parse(JSON.stringify(s));s=discard(s,'member-2');
 assert.equal(s.core.phase,'main');assert.equal(tag.tagDecisionMember(s).id,'member-3');
 assert.equal(tag.tagMemberHand(s,'member-2').length,6);
 const inventory=tag.tagInventory(s);assert.equal(inventory.length,80);assert.equal(new Set(inventory.map(c=>c.uid)).size,80);
});
