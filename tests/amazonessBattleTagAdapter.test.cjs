const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,tagInventory}=require('../dist/tagDuel');
const {enabledCardIds,engineCard,getDuelCard}=require('../dist/effectRegistry');
const {synchronizeCardLifetimes}=require('../dist/cardLifetime');
const {atk}=require('../dist/duelEngine');
const adapter=require('../dist/amazonessBattleTagAdapter');

function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{
  const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;
  const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;
 }).slice(0,count);
}
const monsterIds=unique('monster',8),spellIds=unique('spell',6),trapIds=unique('trap',6);
const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,5);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);assert.equal(fusionIds.length,5);
const deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
const fixture={blowpiper:monsterIds[0],swords:monsterIds[1],tiger:monsterIds[2],ally:monsterIds[3],ally2:monsterIds[4],enemy:monsterIds[5],other:monsterIds[6]};
const definitions={
 [fixture.blowpiper]:{id:adapter.AMAZONESS_BLOWPIPER_ID,name:'Amazoness Blowpiper',kind:'monster',race:'Warrior',level:3,atk:800,defense:1500,effect:'blowpiper-standby-debuff',archetypes:['Amazoness']},
 [fixture.swords]:{id:adapter.AMAZONESS_SWORDS_WOMAN_ID,name:'Amazoness Swords Woman',kind:'monster',race:'Warrior',level:4,atk:1500,defense:1600,effect:'swords-woman-damage-replacement',archetypes:['Amazoness']},
 [fixture.tiger]:{id:adapter.AMAZONESS_TIGER_ID,name:'Amazoness Tiger',kind:'monster',race:'Beast',level:4,atk:1100,defense:1500,effect:'tiger-aura-and-attack-lock',archetypes:['Amazoness']},
 [fixture.ally]:{id:'90000001',name:'Amazoness Paladin',kind:'monster',race:'Warrior',level:4,atk:1700,defense:1200,archetypes:['Amazoness']},
 [fixture.ally2]:{id:'90000002',name:'Amazoness Guard',kind:'monster',race:'Warrior',level:4,atk:1500,defense:1500,archetypes:['Amazoness']},
 [fixture.enemy]:{id:'90000003',name:'Amazoness Scout',kind:'monster',race:'Warrior',level:4,atk:1400,defense:1200,archetypes:['Amazoness']},
 [fixture.other]:{id:'90000004',name:'Goblin Attack Force',kind:'monster',race:'Warrior',level:4,atk:2300,defense:0}
};
function lookup(id){return definitions[id];}
function setup(first=2,isNegated=()=>false,extraTiger=false){
 const cards=extraTiger?[...deck,fixture.tiger]:[...deck];
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...cards],extra:[...fusionIds]}));
 const duel=createTagDuel(players,{classic:true,first,seed:'m687-amazoness'});
 return adapter.createAmazonessBattleSession(duel,lookup,isNegated);
}
function holder(duel,seat){const team=seat%2;return duel.active[team]===seat?duel.core.players[team]:duel.reserves[String(seat)];}
function take(duel,seat,id){
 const held=holder(duel,seat);
 for(const zone of ['hand','deck','extra']){
  const list=held[zone]||[],index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture card not found: '+id);
}
function deploy(session,team,id,seat=session.duel.active[team],options={}){
 const card=take(session.duel,seat,id),turn=session.duel.core.turn;
 const monster={...card,position:options.position??'atk',faceUp:options.faceUp??true,entered:turn,lastSummonedTurn:turn,changed:turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);synchronizeCardLifetimes(session.duel.core);return monster;
}
function moveToGrave(duel,team,monster){
 duel.core.players[team].monsters=duel.core.players[team].monsters.filter(value=>value.uid!==monster.uid);
 duel.core.players[team].grave.push({uid:monster.uid,id:monster.id});synchronizeCardLifetimes(duel.core);
}
function standby(session,eventId='standby-1',activeSeat=session.duel.cursor){
 return {eventId,turn:session.duel.core.turn,activeSeat,phase:'standby'};
}
function inventory(duel){return new Map(tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]));}
function assertInventorySame(before,duel){
 const after=inventory(duel);assert.equal(after.size,before.size);
 for(const [uid,id]of before)assert.equal(after.get(uid),id);
}
function hands(duel){
 const result={};
 for(let seat=0;seat<4;seat++)result[seat]=holder(duel,seat).hand.map(card=>card.uid).sort();
 return result;
}
function moveActiveSeat(duel,team,incoming){
 const outgoing=duel.active[team];if(outgoing===incoming)return;
 const current=duel.core.players[team],next=duel.reserves[String(incoming)];
 assert.ok(next,'A zona privada do assento de entrada precisa existir.');
 duel.reserves[String(outgoing)]={deck:current.deck,hand:current.hand,extra:current.extra};
 current.deck=next.deck;current.hand=next.hand;current.extra=next.extra;
 delete duel.reserves[String(incoming)];duel.active[team]=incoming;duel.cursor=incoming;duel.core.current=team;
 duel.core.teamRotation.active=[duel.active[0],duel.active[1]];duel.core.teamRotation.cursor=incoming;duel.core.teamRotation.reserves=duel.reserves;
}

test('M687 identities and Konami CIDs are explicit; the cards are not admitted by this adapter',()=>{
 assert.equal(adapter.AMAZONESS_BLOWPIPER_ID,'73574678');assert.equal(adapter.AMAZONESS_BLOWPIPER_KONAMI_CID,5646);
 assert.equal(adapter.AMAZONESS_SWORDS_WOMAN_ID,'94004268');assert.equal(adapter.AMAZONESS_SWORDS_WOMAN_KONAMI_CID,5284);
 assert.equal(adapter.AMAZONESS_TIGER_ID,'10979723');assert.equal(adapter.AMAZONESS_TIGER_KONAMI_CID,5647);
 assert.equal(adapter.AMAZONESS_CHAIN_MASTER_ID,'29654737');assert.equal(adapter.AMAZONESS_CHAIN_MASTER_KONAMI_CID,5291);
 for(const id of [adapter.AMAZONESS_BLOWPIPER_ID,adapter.AMAZONESS_SWORDS_WOMAN_ID,adapter.AMAZONESS_TIGER_ID])assert.equal(enabledCardIds.includes(id),false);
 assert.equal(getDuelCard(adapter.AMAZONESS_BLOWPIPER_ID),undefined);
 assert.equal(adapter.defaultAmazonessLookup(adapter.AMAZONESS_TIGER_ID).effect,'tiger-aura-and-attack-lock');
});

test('classic 2v2 profile preserves Deck 20–30, Extra 5, hand 6 at End Phase and zones 3+3',()=>{
 const session=setup(2);adapter.assertAmazonessRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.deepEqual(session.duel.active,[2,3]);
 for(const player of session.duel.core.players){assert.ok(player.monsters.length<=3);assert.ok(player.backrow.length<=3);}
});

test('Blowpiper can trigger for its team when the physical card owner is the inactive teammate',()=>{
 const session=setup(2),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 assert.equal(session.duel.active[0],2);assert.equal(session.duel.cursor,2);
 const plan=adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-owner-1',2),source.uid,target.uid);
 assert.equal(plan.controllerTeam,0);assert.equal(plan.activeSeat,2);assert.match(source.uid,/^m0:/);
 const result=adapter.resolveAmazonessBlowpiperStandby(session,'bp-owner-1',source.uid);
 assert.equal(result.status,'applied');assert.equal(result.targetUid,target.uid);
});

test('Blowpiper reduces exactly 500 ATK until the end of the current turn',()=>{
 const session=setup(),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 const base=atk(target,session.duel.core);
 adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-stat'),source.uid,target.uid);
 adapter.resolveAmazonessBlowpiperStandby(session,'bp-stat',source.uid);
 const current=session.duel.core.players[1].monsters.find(card=>card.uid===target.uid);
 assert.equal(atk(current,session.duel.core),base-500);
 session.duel.core.turn++;
 assert.equal(atk(current,session.duel.core),base);
});

test('Blowpiper rejects a target controlled by its own team',()=>{
 const session=setup(),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,0,fixture.ally,2);
 assert.throws(()=>adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-own'),source.uid,target.uid),/adversário/);
});

test('Blowpiper requires the active physical seat and the Standby boundary',()=>{
 const session=setup(2),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 assert.throws(()=>adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-seat',0),source.uid,target.uid),/assento físico ativo/);
 session.duel.core.phase='battle';
 assert.throws(()=>adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-phase',2),source.uid,target.uid),/assento físico ativo|Standby/);
});

test('Blowpiper cannot be triggered twice by the same physical instance in one Standby',()=>{
 const session=setup(),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-once-a'),source.uid,target.uid);
 assert.throws(()=>adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-once-b'),source.uid,target.uid),/já foi usado/);
});

test('Blowpiper never retargets after the selected physical monster leaves',()=>{
 const session=setup(),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 const before=inventory(session.duel);
 adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-leave'),source.uid,target.uid);
 moveToGrave(session.duel,1,target);
 const result=adapter.resolveAmazonessBlowpiperStandby(session,'bp-leave',source.uid);
 assert.equal(result.status,'target-lost');assertInventorySame(before,session.duel);
});

test('Blowpiper does not resolve after its source leaves or is turned face-down',()=>{
 const removed=setup(),source=deploy(removed,0,fixture.blowpiper,0),target=deploy(removed,1,fixture.enemy,3);
 adapter.prepareAmazonessBlowpiperStandby(removed,standby(removed,'bp-source-lost'),source.uid,target.uid);
 moveToGrave(removed.duel,0,source);
 assert.equal(adapter.resolveAmazonessBlowpiperStandby(removed,'bp-source-lost',source.uid).status,'source-lost');
 const facedown=setup(),source2=deploy(facedown,0,fixture.blowpiper,0),target2=deploy(facedown,1,fixture.enemy,3);
 adapter.prepareAmazonessBlowpiperStandby(facedown,standby(facedown,'bp-source-down'),source2.uid,target2.uid);
 facedown.duel.core.players[0].monsters.find(card=>card.uid===source2.uid).faceUp=false;
 assert.equal(adapter.resolveAmazonessBlowpiperStandby(facedown,'bp-source-down',source2.uid).status,'source-inactive');
});

test('Blowpiper stops when the source becomes negated and resolution replay is idempotent',()=>{
 let negated=false;
 const session=setup(2,(duel,uid)=>negated&&uid.startsWith('m0:')),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3);
 adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-negated'),source.uid,target.uid);
 negated=true;
 assert.equal(adapter.resolveAmazonessBlowpiperStandby(session,'bp-negated',source.uid).status,'source-negated');
 const live=setup(),liveSource=deploy(live,0,fixture.blowpiper,0),liveTarget=deploy(live,1,fixture.enemy,3);
 const base=atk(liveTarget,live.duel.core);
 adapter.prepareAmazonessBlowpiperStandby(live,standby(live,'bp-replay'),liveSource.uid,liveTarget.uid);
 assert.equal(adapter.resolveAmazonessBlowpiperStandby(live,'bp-replay',liveSource.uid).status,'applied');
 const replay=adapter.resolveAmazonessBlowpiperStandby(live,'bp-replay',liveSource.uid);
 assert.equal(replay.status,'duplicate');assert.equal(replay.replayed,true);
 assert.equal(atk(live.duel.core.players[1].monsters.find(card=>card.uid===liveTarget.uid),live.duel.core),base-500);
});

test('Tiger gains 400 ATK for each face-up Amazoness monster controlled by its team, including itself',()=>{
 const session=setup(),tiger=deploy(session,0,fixture.tiger,0),ally=deploy(session,0,fixture.ally,2);
 deploy(session,0,fixture.ally2,0,{faceUp:false});
 deploy(session,1,fixture.enemy,3);
 assert.equal(adapter.amazonessTigerAtkBonus(session.duel,tiger.uid,lookup),800);
 assert.equal(adapter.amazonessTigerAtkBonus(session.duel,ally.uid,lookup),0);
});

test('Tiger aura is inactive while the source is face-down or negated',()=>{
 let negated=false;
 const session=setup(2,(duel,uid)=>negated&&uid.startsWith('m0:')),tiger=deploy(session,0,fixture.tiger,0),ally=deploy(session,0,fixture.ally,2);
 assert.equal(adapter.amazonessTigerAtkBonus(session.duel,tiger.uid,lookup),800);
 negated=true;assert.equal(adapter.amazonessTigerAtkBonus(session.duel,tiger.uid,lookup),0);
 negated=false;session.duel.core.players[0].monsters.find(card=>card.uid===tiger.uid).faceUp=false;
 assert.equal(adapter.amazonessTigerAtkBonus(session.duel,tiger.uid,lookup),0);
});

test('Tiger prevents attacks on other face-up Amazoness monsters but not on itself',()=>{
 const session=setup(),tiger=deploy(session,0,fixture.tiger,0),ally=deploy(session,0,fixture.ally,2),enemy=deploy(session,1,fixture.other,3);
 assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,ally.uid,lookup),false);
 assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,tiger.uid,lookup),true);
 assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,enemy.uid,lookup),true);
});

test('Tiger attack restriction disappears when Tiger is face-down or negated',()=>{
 let negated=false;
 const session=setup(2,(duel,uid)=>negated&&uid===tiger.uid);
 const tiger=deploy(session,0,fixture.tiger,0),ally=deploy(session,0,fixture.ally,2);
 assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,ally.uid,lookup),false);
 negated=true;assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,ally.uid,lookup),true);
 negated=false;session.duel.core.players[0].monsters.find(card=>card.uid===tiger.uid).faceUp=false;
 assert.equal(adapter.amazonessTigerAllowsAttackTarget(session.duel,1,ally.uid,lookup),true);
});

test('Tiger control limit is shared by teammates but not by the opposing team',()=>{
 const session=setup(2,true),first=deploy(session,0,fixture.tiger,0),second=deploy(session,0,fixture.tiger,2);
 assert.equal(adapter.amazonessTigerCanBeControlled(session.duel,0,second.uid,lookup),false);
 assert.equal(adapter.amazonessTigerCanBeControlled(session.duel,0,first.uid,lookup),true);
 assert.equal(adapter.amazonessTigerCanBeControlled(session.duel,1,second.uid,lookup),true);
});

test('Swords Woman redirects only positive battle damage that its controller would take',()=>{
 const session=setup(),source=deploy(session,0,fixture.swords,0),enemy=deploy(session,1,fixture.other,3);
 const lp0=session.duel.core.players[0].lp,lp1=session.duel.core.players[1].lp;
 const prep=adapter.prepareAmazonessSwordsWomanDamage(session,{eventId:'sw-redirect',turn:session.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:400,involvedMonsterUids:[source.uid,enemy.uid]});
 assert.equal(prep.status,'prepared');
 const result=adapter.resolveAmazonessSwordsWomanDamage(session,'sw-redirect');
 assert.equal(result.status,'redirected');assert.equal(result.amount,400);assert.equal(result.targetTeam,1);
 assert.equal(session.duel.core.players[0].lp,lp0);assert.equal(session.duel.core.players[1].lp,lp1);
 session.duel.core.players[result.targetTeam].lp-=result.amount;
 assert.equal(session.duel.core.players[1].lp,lp1-400);
});

test('Swords Woman does not redirect effect damage, damage to the other team, or unrelated battles',()=>{
 const session=setup(),source=deploy(session,0,fixture.swords,0),enemy=deploy(session,1,fixture.other,3);
 const base={turn:session.duel.core.turn,amount:300,involvedMonsterUids:[source.uid,enemy.uid]};
 assert.deepEqual(adapter.prepareAmazonessSwordsWomanDamage(session,{...base,eventId:'sw-effect',damageKind:'effect',damageToTeam:0}),{status:'not-applicable'});
 assert.deepEqual(adapter.prepareAmazonessSwordsWomanDamage(session,{...base,eventId:'sw-other-team',damageKind:'battle',damageToTeam:1}),{status:'not-applicable'});
 assert.deepEqual(adapter.prepareAmazonessSwordsWomanDamage(session,{...base,eventId:'sw-unrelated',damageKind:'battle',damageToTeam:0,involvedMonsterUids:[enemy.uid]}),{status:'not-applicable'});
});

test('Swords Woman requires the physical card to remain face-up and on the field until replacement',()=>{
 const removed=setup(),source=deploy(removed,0,fixture.swords,0),enemy=deploy(removed,1,fixture.other,3);
 removed.duel.core.players[0].lp-=200;
 const prep=adapter.prepareAmazonessSwordsWomanDamage(removed,{eventId:'sw-stale',turn:removed.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:200,involvedMonsterUids:[source.uid,enemy.uid]});
 assert.equal(prep.status,'prepared');
 moveToGrave(removed.duel,0,source);
 assert.equal(adapter.resolveAmazonessSwordsWomanDamage(removed,'sw-stale').status,'source-lost');
 const down=setup(),source2=deploy(down,0,fixture.swords,0),enemy2=deploy(down,1,fixture.other,3);
 adapter.prepareAmazonessSwordsWomanDamage(down,{eventId:'sw-down',turn:down.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:200,involvedMonsterUids:[source2.uid,enemy2.uid]});
 down.duel.core.players[0].monsters.find(card=>card.uid===source2.uid).faceUp=false;
 assert.equal(adapter.resolveAmazonessSwordsWomanDamage(down,'sw-down').status,'source-inactive');
});

test('Swords Woman replacement respects monster-effect negation and rejects damage already applied',()=>{
 let negated=false;
 const session=setup(2,(duel,uid)=>negated&&uid.startsWith('m0:')),source=deploy(session,0,fixture.swords,0),enemy=deploy(session,1,fixture.other,3);
 adapter.prepareAmazonessSwordsWomanDamage(session,{eventId:'sw-negated',turn:session.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:250,involvedMonsterUids:[source.uid,enemy.uid]});
 negated=true;assert.equal(adapter.resolveAmazonessSwordsWomanDamage(session,'sw-negated').status,'source-negated');
 const stale=setup(),source2=deploy(stale,0,fixture.swords,0),enemy2=deploy(stale,1,fixture.other,3);
 adapter.prepareAmazonessSwordsWomanDamage(stale,{eventId:'sw-already-applied',turn:stale.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:250,involvedMonsterUids:[source2.uid,enemy2.uid]});
 stale.duel.core.players[0].lp-=250;
 assert.throws(()=>adapter.resolveAmazonessSwordsWomanDamage(stale,'sw-already-applied'),/antes de aplicar/);
});

test('Swords Woman selects one source and replay never redirects the same damage twice',()=>{
 const session=setup(2,true),first=deploy(session,0,fixture.swords,0),second=deploy(session,0,fixture.swords,2),enemy=deploy(session,1,fixture.other,3);
 const before=inventory(session.duel),handsBefore=hands(session.duel);
 const prep=adapter.prepareAmazonessSwordsWomanDamage(session,{eventId:'sw-once',turn:session.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:500,involvedMonsterUids:[second.uid,enemy.uid,first.uid]});
 assert.equal(prep.status,'prepared');assert.equal(prep.plan.sourceUid,[first.uid,second.uid].sort()[0]);
 const result=adapter.resolveAmazonessSwordsWomanDamage(session,'sw-once');
 assert.equal(result.status,'redirected');assert.equal(result.amount,500);
 const replay=adapter.resolveAmazonessSwordsWomanDamage(session,'sw-once');
 assert.equal(replay.status,'duplicate');assert.equal(replay.replayed,true);assert.equal(replay.originalStatus,'redirected');
 assert.deepEqual(hands(session.duel),handsBefore);assertInventorySame(before,session.duel);
});

test('Standby and battle adapters conserve every physical card and never touch private hands',()=>{
 const session=setup(2),source=deploy(session,0,fixture.blowpiper,0),target=deploy(session,1,fixture.enemy,3),swords=deploy(session,0,fixture.swords,2);
 const before=inventory(session.duel),handsBefore=hands(session.duel);
 adapter.prepareAmazonessBlowpiperStandby(session,standby(session,'bp-conservation',2),source.uid,target.uid);
 adapter.resolveAmazonessBlowpiperStandby(session,'bp-conservation',source.uid);
 const prep=adapter.prepareAmazonessSwordsWomanDamage(session,{eventId:'sw-conservation',turn:session.duel.core.turn,damageKind:'battle',damageToTeam:0,amount:100,involvedMonsterUids:[swords.uid,target.uid]});
 assert.equal(prep.status,'prepared');adapter.resolveAmazonessSwordsWomanDamage(session,'sw-conservation');
 assertInventorySame(before,session.duel);assert.deepEqual(hands(session.duel),handsBefore);
});
