'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');const {getPlayableCard}=require('../dist/effectRegistry');
const {GRYPHON_WING_ID,TRAP_JAMMER_ID,HARPIE_FEATHER_DUSTER_ID,createCounterTrapSession,counterTrapActions,activateCounterTrap,resolveCounterTrap}=require('../dist/counterTrapTagAdapter');
const HFD=HARPIE_FEATHER_DUSTER_ID,MIRROR='44095762',TORRENTIAL='53582587',MAGIC_JAMMER='77414722',SOGEN='86318356',MOUNTAIN='50913601';
const lookup=id=>{const c=getPlayableCard(id);return c?{kind:c.kind}:undefined;};
const NORMALS=[...new Set(tag.tagNormalCardIds)];assert.ok(NORMALS.length>=20);
function member(seat){return 'm571-seat-'+seat;}
function deck(required=[]){return [...new Set([...required,...NORMALS])].slice(0,20);}
function create(first,required={},seed='fixture'){return tag.createTagDuel([0,1,2,3].map(seat=>({id:member(seat),name:'M571 Seat '+seat,cards:deck(required[seat]||[])})),{classic:true,first,seed:'m571-'+seed});}
function holder(s,seat){return s.active[seat%2]===seat?s.core.players[seat%2]:s.reserves[String(seat)];}
function replace(s,seat,id,suffix){const h=holder(s,seat);assert.ok(h?.deck.length);h.deck.shift();return {uid:'m'+seat+':m571-'+suffix,id};}
function backrow(s,seat,id,suffix){const c={...replace(s,seat,id,suffix),faceUp:false,setTurn:1};s.core.players[seat%2].backrow.push(c);return c;}
function field(s,seat,id,suffix){const c={...replace(s,seat,id,suffix),faceUp:true,setTurn:1,resolved:true};s.core.players[seat%2].field=c;return c;}
function hand(s,seat,id){const h=holder(s,seat),found=h.hand.find(c=>c.id===id);if(found)return found;const i=h.deck.findIndex(c=>c.id===id);assert.ok(i>=0);const [c]=h.deck.splice(i,1);h.hand.push(c);return c;}
function inventory(s){const cs=tag.tagInventory(s).filter(c=>c.entityKind!=='token');assert.equal(cs.length,80);const m=new Map(cs.map(c=>[c.uid,c.id]));assert.equal(m.size,80);return m;}
function conserved(s,b){const cs=tag.tagInventory(s).filter(c=>c.entityKind!=='token');assert.equal(cs.length,b.size);assert.equal(new Set(cs.map(c=>c.uid)).size,b.size);for(const c of cs)assert.equal(b.get(c.uid),c.id);}
function hands(s){const out=[];for(const p of s.core.players)for(const c of p.hand)out.push(c.uid);for(const h of Object.values(s.reserves))for(const c of h.hand)out.push(c.uid);return out.sort();}
function grave(s,t,c){return s.core.players[t].grave.some(x=>x.uid===c.uid&&x.id===c.id);}
function action(s,seat,predicate,label){const a=tag.tagActions(s,member(seat)).find(predicate);assert.ok(a,'seat '+seat+' must have '+label+' in '+s.core.phase);return a;}
function hfdFixture(){
 const s=create(1,{1:[HFD]},'gryphon');s.core.turn=3;
 const magic=backrow(s,0,MAGIC_JAMMER,'gryphon-source-magic-jammer');
 const h=hand(s,1,HFD);
 const pending=tag.stepTagDuel(s,member(1),action(s,1,a=>a.card===h.uid,'HFD activation'));
 assert.equal(pending.core.phase,'response');assert.equal(pending.core.pending.kind,'spell');assert.equal(pending.core.pending.id,HFD);assert.equal(pending.core.pending.actor,1);assert.equal(pending.core.priority,0);tag.assertTagDuel(pending);
 const g=pending.core.players[0].backrow.find(c=>c.uid===magic.uid);assert.ok(g);g.id=GRYPHON_WING_ID;
 const ally=backrow(pending,2,MIRROR,'ally-mirror'),opp=backrow(pending,3,TORRENTIAL,'opp-torrential');
 const ownField=field(pending,0,MOUNTAIN,'own-field'),oppField=field(pending,3,SOGEN,'opp-field');
 return {state:pending,hfd:h,gryphon:g,ally,opp,ownField,oppField};
}
function jammerFixture(){
 const s=create(0,{},'jammer');s.core.turn=2;
 const mirror=backrow(s,3,MIRROR,'opp-mirror'),other=backrow(s,3,TORRENTIAL,'opp-other');
 const oppField=field(s,3,SOGEN,'opp-field'),ownField=field(s,0,MOUNTAIN,'own-field');tag.assertTagDuel(s);
 let n=tag.stepTagDuel(s,member(0),action(s,0,a=>a.kind==='summon'&&a.position==='atk','Attack Position summon'));
 n=tag.stepTagDuel(n,member(0),action(n,0,a=>a.kind==='battle','Battle Phase'));
 n=tag.stepTagDuel(n,member(0),action(n,0,a=>a.kind==='attack','attack declaration'));
 assert.equal(n.core.phase,'response');assert.equal(n.core.pending.kind,'attack');assert.equal(n.core.resume,'battle');
 n=tag.stepTagDuel(n,member(1),action(n,1,a=>a.card===mirror.uid,'Mirror Force activation'));
 assert.equal(n.core.phase,'response');assert.equal(n.core.priority,0);assert.equal(n.core.resume,'battle');
 const jammer=backrow(n,2,TRAP_JAMMER_ID,'jammer');return {state:n,mirror,other,oppField,ownField,jammer};
}
test('M571 cards remain unadmitted: adapter neither certifies nor distributes them',()=>{
 assert.equal(getPlayableCard(GRYPHON_WING_ID),undefined);assert.equal(getPlayableCard(TRAP_JAMMER_ID),undefined);
 for(const id of [HFD,MIRROR,TORRENTIAL,SOGEN,MOUNTAIN])assert.ok(getPlayableCard(id));
});
test('Gryphon Wing opens only against opponent HFD and does not target',()=>{
 const f=hfdFixture(),actions=counterTrapActions(f.state,lookup);assert.deepEqual(actions,[{kind:'trap',card:f.gryphon.uid,target:''}]);
 const s=activateCounterTrap(createCounterTrapSession(f.state),f.gryphon.uid,'gw-1',lookup);
 assert.equal(s.pending['gw-1'].controllerSeat,2);assert.equal(s.pending['gw-1'].sourceOwnerSeat,0);assert.equal(s.duel.core.priority,1);
});
test('Gryphon Wing negates root HFD effect and destroys opposing backrow plus Field Zone only',()=>{
 const f=hfdFixture(),before=inventory(f.state),handBefore=hands(f.state);
 const a=activateCounterTrap(createCounterTrapSession(f.state),f.gryphon.uid,'gw-2',lookup);
 const {session,result}=resolveCounterTrap(a,'gw-2',lookup),d=session.duel;
 assert.equal(result.effectApplied,true);assert.equal(result.pendingEffectNegated,true);assert.equal(result.targetEffectNegated,false);assert.notEqual(d.core.pendingNegated,true);
 assert.deepEqual(new Set(result.destroyedUids),new Set([f.hfd.uid,f.opp.uid,f.oppField.uid]));
 assert.equal(d.core.players[1].backrow.length,0);assert.equal(d.core.players[1].field,null);
 assert.deepEqual(d.core.players[0].backrow.map(c=>c.uid),[f.ally.uid]);assert.equal(d.core.players[0].field.uid,f.ownField.uid);
 assert.ok(grave(d,0,f.gryphon));for(const c of [f.hfd,f.opp,f.oppField])assert.ok(grave(d,1,c));
 assert.deepEqual(hands(d),handBefore);conserved(d,before);
});
test('Gryphon Wing negates an HFD chain link without marking root pending activation negated',()=>{
 const f=hfdFixture();f.state.core.pending={kind:'none'};f.state.core.chain=[{actor:1,card:f.hfd.uid,id:HFD,target:''}];
 const a=activateCounterTrap(createCounterTrapSession(f.state),f.gryphon.uid,'gw-chain',lookup);
 const {session,result}=resolveCounterTrap(a,'gw-chain',lookup);
 assert.equal(result.targetEffectNegated,true);assert.equal(result.pendingEffectNegated,false);
 assert.equal(session.duel.core.chain.length,1);assert.equal(session.duel.core.chain[0].negated,true);assert.ok(grave(session.duel,1,f.hfd));
});
test('Gryphon Wing rejects another Spell, own-team HFD, face-up source, and same-turn Set',()=>{
 const f=hfdFixture(),wrong=structuredClone(f.state);wrong.core.pending.id='05318639';assert.deepEqual(counterTrapActions(wrong,lookup),[]);
 const own=structuredClone(f.state);own.core.pending.actor=0;assert.deepEqual(counterTrapActions(own,lookup),[]);
 const face=structuredClone(f.state);face.core.players[0].backrow.find(c=>c.uid===f.gryphon.uid).faceUp=true;assert.deepEqual(counterTrapActions(face,lookup),[]);
 const same=structuredClone(f.state);same.core.players[0].backrow.find(c=>c.uid===f.gryphon.uid).setTurn=same.core.turn;assert.deepEqual(counterTrapActions(same,lookup),[]);
});
test('Gryphon Wing does not destroy if HFD effect is already negated or its own activation is negated',()=>{
 const f=hfdFixture();f.state.core.pendingNegated=true;
 const a=activateCounterTrap(createCounterTrapSession(f.state),f.gryphon.uid,'gw-already',lookup);
 const r=resolveCounterTrap(a,'gw-already',lookup);assert.equal(r.result.effectApplied,false);assert.deepEqual(r.result.destroyedUids,[]);
 const g=hfdFixture(),b=activateCounterTrap(createCounterTrapSession(g.state),g.gryphon.uid,'gw-negated',lookup);
 const x=resolveCounterTrap(b,'gw-negated',lookup,true);assert.equal(x.result.sourceActivationNegated,true);assert.equal(x.result.effectApplied,false);assert.ok(grave(x.session.duel,0,g.gryphon));
});
test('Trap Jammer opens only for an opponent Trap activation in the Battle Phase',()=>{
 const f=jammerFixture();assert.deepEqual(counterTrapActions(f.state,lookup),[{kind:'trap',card:f.jammer.uid,target:''}]);
 const main=structuredClone(f.state);main.core.resume='main';assert.deepEqual(counterTrapActions(main,lookup),[]);
 const own=structuredClone(f.state);own.core.chain.at(-1).actor=0;assert.deepEqual(counterTrapActions(own,lookup),[]);
 const spell=structuredClone(f.state);spell.core.chain.at(-1).id=HFD;assert.deepEqual(counterTrapActions(spell,lookup),[]);
 const facedown=structuredClone(f.state);facedown.core.players[1].backrow.find(c=>c.uid===f.mirror.uid).faceUp=false;assert.deepEqual(counterTrapActions(facedown,lookup),[]);
});
test('Trap Jammer negates/destroys only the activated Trap; preserves other backrow, Field Zones and physical owners',()=>{
 const f=jammerFixture(),before=inventory(f.state),handBefore=hands(f.state);
 const a=activateCounterTrap(createCounterTrapSession(f.state),f.jammer.uid,'tj-1',lookup);
 assert.equal(a.pending['tj-1'].controllerSeat,0);assert.equal(a.pending['tj-1'].sourceOwnerSeat,2);
 const {session,result}=resolveCounterTrap(a,'tj-1',lookup),d=session.duel;
 assert.equal(result.targetActivationNegated,true);assert.equal(result.effectApplied,true);assert.deepEqual(result.destroyedUids,[f.mirror.uid]);
 assert.equal(d.core.chain.length,1);assert.equal(d.core.chain[0].negated,true);
 assert.ok(grave(d,1,f.mirror));assert.ok(grave(d,0,f.jammer));
 assert.deepEqual(d.core.players[1].backrow.map(c=>c.uid),[f.other.uid]);assert.equal(d.core.players[1].field.uid,f.oppField.uid);assert.equal(d.core.players[0].field.uid,f.ownField.uid);
 assert.deepEqual(hands(d),handBefore);conserved(d,before);
});
test('if Trap Jammer activation is negated, the target Trap remains available to resolve',()=>{
 const f=jammerFixture(),before=inventory(f.state),a=activateCounterTrap(createCounterTrapSession(f.state),f.jammer.uid,'tj-negated',lookup);
 const {session,result}=resolveCounterTrap(a,'tj-negated',lookup,true);
 assert.equal(result.sourceActivationNegated,true);assert.equal(result.targetActivationNegated,false);
 assert.ok(session.duel.core.chain.some(l=>l.card===f.mirror.uid&&!l.negated));assert.ok(session.duel.core.players[1].backrow.some(c=>c.uid===f.mirror.uid));
 assert.ok(grave(session.duel,0,f.jammer));conserved(session.duel,before);
});
