// Public four-seat facade: a partner's monster is on the shared field, but
// the incoming boss must stay hidden when set and a single UID pays both Tributes.
const {test}=require('node:test'),assert=require('node:assert/strict'),tag=require('../dist/tagDuel');
const base=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
function take(player,id){for(const zone of ['hand','deck']){const i=player[zone].findIndex(c=>c.id===id);if(i>=0)return player[zone].splice(i,1)[0];}throw Error('Missing fixture '+id);}
for(const [first,donor,boss] of [[0,'17444133','89631139'],[1,'44436472','46986414'],[2,'92084010','39674352'],[3,'38479725','06368038']])test('M44 shared field: private Tribute Set and one physical card, seat '+first,()=>{
 const players=[0,1,2,3].map(i=>({id:'u'+i,name:'U'+i,cards:[donor,boss,...base.filter(id=>id!==donor&&id!==boss).slice(0,18)]}));
 let s=tag.createTagDuel(players,{seed:'double-tribute-'+first,first,classic:true});s.core.turn=3;
 const team=first%2,p=s.core.players[team],other=(first+2)%4,source=take(s.reserves[other],donor),target=take(p,boss);p.hand.push(target);
 p.monsters.push({...source,faceUp:false,owner:team,position:'def',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0});
 const before=tag.tagInventory(s).map(c=>c.uid).sort(),actor=tag.tagDecisionMember(s).id;
 const action=tag.tagActions(s,actor).find(a=>a.kind==='summon'&&a.position==='set'&&a.card===target.uid&&a.tributes.length===1&&a.tributes[0]===source.uid);
 assert.ok(action);s=tag.stepTagDuel(JSON.parse(JSON.stringify(s)),actor,action);tag.assertTagDuel(s);
 assert.equal(s.core.players[team].grave.filter(c=>c.uid===source.uid).length,1);assert.equal(s.core.players[team].monsters.find(c=>c.uid===target.uid).faceUp,false);
 const shown=tag.publicTagDuel(s);assert.equal(shown.teams[team].monsters[0].id,null);assert.ok(shown.log.includes('Um monstro contou como dois Tributos.'));
 const card=require('../dist/effectRegistry').getPlayableCard(boss);assert.ok(!shown.log.some(line=>line.includes(card.name)));assert.deepEqual(tag.tagInventory(s).map(c=>c.uid).sort(),before);
});
