const {test}=require('node:test'),assert=require('node:assert/strict');const tag=require('../dist/tagDuel'),e=require('../dist/duelEngine'),r=require('../dist/effectRegistry');
const cards=tag.tagNormalCardIds.filter(id=>(r.getPlayableCard(id).level??0)<=4).slice(0,10).flatMap(id=>[id,id]);
function game(first=0){return tag.createTagDuel([0,1,2,3].map(i=>({id:'member-'+i,name:'Membro '+i,cards})),{seed:'repeatable',first});}
const end=s=>tag.stepTagDuel(s,tag.tagDecisionMember(s).id,{kind:'end'});
test('four independent hands/decks rotate A1 B1 A2 B2, drawing from the correct deck',()=>{
 let s=game();assert.equal(tag.tagInventory(s).length,80);const order=[];for(let i=0;i<5;i++){order.push(tag.tagDecisionMember(s).id);if(i<4)s=end(s);}assert.deepEqual(order,['member-0','member-1','member-2','member-3','member-0']);assert.equal(s.core.turn,5);assert.deepEqual(s.members.map(p=>tag.tagMemberHand(s,p.id).length),[5,5,5,5]);assert.deepEqual(s.core.players.map(p=>p.lp),[4000,4000]);
});
test('an ally inherits the shared field but does not inherit the other member hand',()=>{
 let s=game();const hand=tag.tagMemberHand(s,'member-0'),summon=tag.tagActions(s,'member-0').find(a=>a.kind==='summon'&&a.position==='atk');assert.ok(summon);s=tag.stepTagDuel(s,'member-0',summon);const uid=s.core.players[0].monsters[0].uid;s=end(s);s=end(s);assert.equal(tag.tagDecisionMember(s).id,'member-2');assert.equal(s.core.players[0].monsters[0].uid,uid);assert.ok(!tag.tagMemberHand(s,'member-2').some(c=>hand.some(old=>old.uid===c.uid)));s=tag.stepTagDuel(s,'member-2',{kind:'battle'});const attack=tag.tagActions(s,'member-2').find(a=>a.kind==='attack');s=tag.stepTagDuel(s,'member-2',attack);assert.ok(s.core.players[1].lp<4000);
});
test('legacy v2 draw capacity pauses for the incoming teammate, survives JSON and preserves all identities',()=>{
 let s=game();s.core.rulesVersion='speed-rpg-v2';s.reserves[2].hand.push(...s.reserves[2].deck.splice(0,3));s=end(s);s=end(s);assert.equal(s.core.phase,'discard');assert.equal(tag.tagDecisionMember(s).id,'member-2');assert.deepEqual(tag.tagActions(s,'member-0'),[]);const refs=new Map(tag.tagInventory(s).map(c=>[c.uid,c.id]));s=JSON.parse(JSON.stringify(s));const discard=tag.tagActions(s,'member-2')[0];s=tag.stepTagDuel(s,'member-2',discard);assert.equal(s.core.phase,'main');assert.equal(tag.tagMemberHand(s,'member-2').length,7);assert.equal(tag.tagInventory(s).length,refs.size);for(const c of tag.tagInventory(s))assert.equal(refs.get(c.uid),c.id);
});
test('end-turn swaps the incoming reserve before drawing; an outgoing empty deck cannot cause the wrong loss',()=>{
 let s=end(game());const p=s.core.players[0];p.grave.push(...p.deck);p.deck=[];s=end(s);assert.equal(tag.tagDecisionMember(s).id,'member-2');assert.notEqual(s.core.phase,'finished');
});
test('public projection excludes all private hands, deck order and physical UIDs, including ally reserves',()=>{
 const s=game(),text=JSON.stringify(tag.publicTagDuel(s));assert.ok(!text.includes('"hand":'));assert.ok(!text.includes('"deck":'));for(const c of tag.tagInventory(s))assert.ok(!text.includes(c.uid));assert.throws(()=>tag.tagMemberHand(s,'outsider'),/participa/);const hand=tag.tagMemberHand(s,'member-0');hand.pop();assert.equal(tag.tagMemberHand(s,'member-0').length,4);
});
test('effects, unsupported cards, duplicate players, invalid turn and out-of-turn actions are rejected atomically',()=>{
 assert.throws(()=>tag.createTagDuel([0,1,2,3].map(i=>({id:String(i),name:'x',cards:[...cards.slice(1),'12580477']}))),/somente monstros normais/);assert.throws(()=>game(4),/Primeiro/);const s=game(),before=JSON.stringify(s);assert.throws(()=>tag.stepTagDuel(s,'member-2',{kind:'end'}),/ativo/);assert.equal(JSON.stringify(s),before);assert.throws(()=>tag.stepTagDuel(s,'member-0',{kind:'spell',card:s.core.players[0].hand[0].uid}),/inválida/);
});
test('all four first seats are valid and the decision owner loses for timeout',()=>{
 for(let first=0;first<4;first++){const s=game(first);assert.equal(tag.tagDecisionMember(s).id,'member-'+first);const done=tag.timeoutTagDuel(s);assert.equal(done.core.phase,'finished');assert.equal(done.core.winner,'tag-team-'+(1-first%2));}
});
