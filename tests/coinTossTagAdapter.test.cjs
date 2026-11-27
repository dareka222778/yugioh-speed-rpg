const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel}=require('../dist/tagDuel');
const {enabledCardIds,engineCard}=require('../dist/effectRegistry');
const {randomIndex}=require('../dist/duelRandom');
const {createCoinTossAdapter,assertCoinTossRules}=require('../dist/coinTossTagAdapter');
function unique(kind,count){
 const seen=new Set();
 return enabledCardIds.filter(id=>{const card=engineCard(id);if(!card||card.kind!==kind||card.fusion)return false;const name=card.englishName||card.name;if(seen.has(name))return false;seen.add(name);return true;}).slice(0,count);
}
const monsterIds=unique('monster',8),fieldSpellId='22702055',spellIds=[fieldSpellId,...unique('spell',10).filter(id=>id!==fieldSpellId).slice(0,5)],trapIds=unique('trap',6);
assert.equal(monsterIds.length,8);assert.equal(spellIds.length,6);assert.equal(trapIds.length,6);assert.ok(enabledCardIds.includes(fieldSpellId));
const fixture={barrel:monsterIds[0],blowback:monsterIds[1]},deck=[...monsterIds,...spellIds,...trapIds];
assert.equal(deck.length,20);
function lookup(id){if(id===fixture.barrel)return {kind:'monster',effect:'barrel-dragon'};if(id===fixture.blowback)return {kind:'monster',effect:'blowback-dragon'};return undefined;}
function setup(seed='m654-coin',first=0){
 const players=[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards:[...deck]}));
 const adapter=createCoinTossAdapter(lookup),session=adapter.createSession(createTagDuel(players,{classic:true,first,seed}));
 return {adapter,session};
}
function take(holder,id){
 for(const zone of ['hand','deck','extra']){const list=holder[zone]||[],index=list.findIndex(card=>card.id===id);if(index>=0)return list.splice(index,1)[0];}
 throw new Error('Fixture card not found: '+id);
}
function deploy(session,team,id,seat=team,faceUp=true){
 const holder=seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
 const card=take(holder,id),monster={...card,position:'atk',faceUp,entered:session.duel.core.turn,changed:session.duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:team};
 session.duel.core.players[team].monsters.push(monster);return monster;
}
function setCard(session,team,id,seat=team){
 const holder=seat===session.duel.active[team]?session.duel.core.players[team]:session.duel.reserves[seat];
 const card=take(holder,id),placed={...card,setTurn:session.duel.core.turn-1,faceUp:false};
 session.duel.core.players[team].backrow.push(placed);return placed;
}
function preview(seed){
 const {session}=setup(seed),random=structuredClone(session.duel.core.random);
 return Array.from({length:3},()=>randomIndex(random,2)===0?'heads':'tails');
}
function seedFor(success){
 for(let i=0;i<500;i++){const seed='m654-'+(success?'success-':'fail-')+i,heads=preview(seed).filter(x=>x==='heads').length;if((heads>=2)===success)return seed;}
 throw new Error('Could not find deterministic coin seed.');
}
function summon(session,effect='barrel'){
 return deploy(session,0,effect==='barrel'?fixture.barrel:fixture.blowback,0,true);
}

test('baseline 2v2 preserves deck, hand, zone and Extra Deck owner rules',()=>{
 const {session}=setup();assertCoinTossRules(session.duel);
 assert.equal(session.duel.mode,'tag-classic');assert.equal(session.duel.core.players[0].hand.length,4);
});

test('Barrel Dragon succeeds on two or more heads and offers only opposing monsters',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel');
 const own=deploy(session,0,monsterIds[2],0,true),opponent=deploy(session,1,monsterIds[3],1,false),partner=deploy(session,1,monsterIds[4],3,true);
 const plan=adapter.prepareActivation(session,0,source.uid,'barrel-1');
 assert.equal(plan.effect,'barrel-dragon');
 const result=adapter.resolveCoinToss(session,'barrel-1');
 assert.ok(result.heads>=2);assert.equal(result.success,true);assert.equal(result.awaitingTarget,true);
 assert.ok(result.targetOptions.includes(opponent.uid));assert.ok(result.targetOptions.includes(partner.uid));
 assert.equal(result.targetOptions.includes(own.uid),false);
});

test('Barrel Dragon destroys the selected opponent monster and preserves physical ownership',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel');
 const target=deploy(session,1,monsterIds[3],3,true);
 adapter.prepareActivation(session,0,source.uid,'barrel-destroy-1');
 const rolled=adapter.resolveCoinToss(session,'barrel-destroy-1');
 assert.ok(rolled.targetOptions.includes(target.uid));
 const result=adapter.selectTarget(session,'barrel-destroy-1',target.uid);
 assert.equal(result.destroyed,true);assert.equal(result.destroyedUid,target.uid);
 assert.ok(session.duel.core.players[1].grave.some(card=>card.uid===target.uid));
 assert.equal(session.duel.core.players[1].monsters.some(card=>card.uid===target.uid),false);
});

test('Blowback Dragon can destroy any card on the field, including its controller team backrow',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'blowback');
 const ownSpell=setCard(session,0,spellIds[1],0),opponent=deploy(session,1,monsterIds[2],1,true);
 adapter.prepareActivation(session,0,source.uid,'blowback-any-1');
 const result=adapter.resolveCoinToss(session,'blowback-any-1');
 assert.ok(result.targetOptions.includes(ownSpell.uid));assert.ok(result.targetOptions.includes(opponent.uid));
 const destroyed=adapter.selectTarget(session,'blowback-any-1',ownSpell.uid);
 assert.equal(destroyed.destroyedUid,ownSpell.uid);
 assert.ok(session.duel.core.players[0].grave.some(card=>card.uid===ownSpell.uid));
});

test('Blowback Dragon can select the independent Field Zone',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'blowback'),team=session.duel.core.players[0];
 const fieldCard=take(team,fieldSpellId);team.field={...fieldCard,setTurn:0,faceUp:true};
 adapter.prepareActivation(session,0,source.uid,'blowback-field-1');
 const rolled=adapter.resolveCoinToss(session,'blowback-field-1');
 assert.ok(rolled.targetOptions.includes(fieldCard.uid));
 adapter.selectTarget(session,'blowback-field-1',fieldCard.uid);
 const liveTeam=session.duel.core.players[0];
 assert.equal(liveTeam.field,null);assert.ok(liveTeam.grave.some(card=>card.uid===fieldCard.uid));
});

test('coin toss uses exactly three persisted HMAC draws and is deterministic for the same seed',()=>{
 const seed=seedFor(true),a=setup(seed),b=setup(seed),sourceA=summon(a.session,'barrel'),sourceB=summon(b.session,'barrel');
 a.adapter.prepareActivation(a.session,0,sourceA.uid,'coin-stream-1');b.adapter.prepareActivation(b.session,0,sourceB.uid,'coin-stream-1');
 const before=a.session.duel.core.random.counter,ra=a.adapter.resolveCoinToss(a.session,'coin-stream-1'),rb=b.adapter.resolveCoinToss(b.session,'coin-stream-1');
 assert.deepEqual(ra.rolls,rb.rolls);assert.equal(a.session.duel.core.random.counter-before,3);
});

test('zero or one head fails without offering a target',()=>{
 const {adapter,session}=setup(seedFor(false)),source=summon(session,'barrel');
 deploy(session,1,monsterIds[2],1,true);
 adapter.prepareActivation(session,0,source.uid,'coin-fail-1');
 const result=adapter.resolveCoinToss(session,'coin-fail-1');
 assert.ok(result.heads<=1);assert.equal(result.success,false);assert.equal(result.awaitingTarget,false);
 assert.deepEqual(result.targetOptions,[]);assert.equal(result.destroyed,false);
});

test('target selection is available only after a successful coin result',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel'),target=deploy(session,1,monsterIds[2],1,true);
 adapter.prepareActivation(session,0,source.uid,'target-after-roll-1');
 assert.throws(()=>adapter.selectTarget(session,'target-after-roll-1',target.uid),/não aguarda escolha/);
 const result=adapter.resolveCoinToss(session,'target-after-roll-1');
 assert.ok(result.targetOptions.includes(target.uid));
});

test('a stale target is rejected and another currently legal target can be selected',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'blowback');
 const first=deploy(session,1,monsterIds[2],1,true),second=deploy(session,0,monsterIds[3],0,true);
 adapter.prepareActivation(session,0,source.uid,'stale-target-1');
 const rolled=adapter.resolveCoinToss(session,'stale-target-1');
 assert.ok(rolled.targetOptions.includes(first.uid));
 session.duel.core.players[1].monsters=session.duel.core.players[1].monsters.filter(card=>card.uid!==first.uid);
 session.duel.core.players[1].grave.push({uid:first.uid,id:first.id});
 assert.throws(()=>adapter.selectTarget(session,'stale-target-1',first.uid),/deixou de ser válido/);
 const result=adapter.selectTarget(session,'stale-target-1',second.uid);
 assert.equal(result.destroyedUid,second.uid);
});

test('Barrel Dragon does not offer its own monsters or backrow as targets',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel');
 const own=deploy(session,0,monsterIds[2],0,true),backrow=setCard(session,0,spellIds[0],0),opponent=deploy(session,1,monsterIds[3],1,true);
 adapter.prepareActivation(session,0,source.uid,'barrel-scope-1');
 const result=adapter.resolveCoinToss(session,'barrel-scope-1');
 assert.equal(result.targetOptions.includes(own.uid),false);assert.equal(result.targetOptions.includes(backrow.uid),false);
 assert.ok(result.targetOptions.includes(opponent.uid));
});

test('Blowback Dragon may target its own monster',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'blowback');
 const own=deploy(session,0,monsterIds[2],0,true);
 adapter.prepareActivation(session,0,source.uid,'blowback-own-1');
 const result=adapter.resolveCoinToss(session,'blowback-own-1');
 assert.ok(result.targetOptions.includes(own.uid));
});

test('no target available resolves successfully without opening a target prompt',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel');
 adapter.prepareActivation(session,0,source.uid,'no-target-1');
 const result=adapter.resolveCoinToss(session,'no-target-1');
 assert.equal(result.success,true);assert.equal(result.awaitingTarget,false);assert.deepEqual(result.targetOptions,[]);
});

test('a destroyed source monster does not cancel its already activated coin effect',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel');
 deploy(session,1,monsterIds[2],1,true);
 adapter.prepareActivation(session,0,source.uid,'source-left-1');
 session.duel.core.players[0].monsters=session.duel.core.players[0].monsters.filter(card=>card.uid!==source.uid);
 session.duel.core.players[0].grave.push({uid:source.uid,id:source.id});
 const result=adapter.resolveCoinToss(session,'source-left-1');
 assert.equal(result.rolls.length,3);assert.equal(result.success,true);
});

test('an activation negation consumes no coins and releases the soft once-per-turn flag',()=>{
 const {adapter,session}=setup('activation-negated'),source=summon(session,'barrel');
 adapter.prepareActivation(session,0,source.uid,'activation-negated-1');
 const counter=session.duel.core.random.counter,result=adapter.resolveCoinToss(session,'activation-negated-1','activation');
 assert.equal(result.negation,'activation');assert.equal(result.rolls.length,0);assert.equal(session.duel.core.random.counter,counter);
 const live=session.duel.core.players[0].monsters.find(card=>card.uid===source.uid);
 assert.equal(live.effectUsedTurn,undefined);
 adapter.prepareActivation(session,0,source.uid,'activation-negated-2');
});

test('an effect negation consumes no coins but still uses the once-per-turn activation',()=>{
 const {adapter,session}=setup('effect-negated'),source=summon(session,'blowback');
 adapter.prepareActivation(session,0,source.uid,'effect-negated-1');
 const counter=session.duel.core.random.counter,result=adapter.resolveCoinToss(session,'effect-negated-1','effect');
 assert.equal(result.negation,'effect');assert.equal(result.rolls.length,0);assert.equal(session.duel.core.random.counter,counter);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'effect-negated-2'),/já usou o efeito/);
});

test('once-per-turn restriction remains spent after a failed coin toss and resets on the next turn',()=>{
 const {adapter,session}=setup(seedFor(false)),source=summon(session,'barrel');
 adapter.prepareActivation(session,0,source.uid,'once-turn-1');adapter.resolveCoinToss(session,'once-turn-1');
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'once-turn-2'),/já usou o efeito/);
 session.duel.core.turn++;
 const live=session.duel.core.players[0].monsters.find(card=>card.uid===source.uid);
 assert.ok(live);adapter.prepareActivation(session,0,source.uid,'once-turn-3');
});

test('a face-down Dragon cannot activate its ignition effect',()=>{
 const {adapter,session}=setup('face-down'),source=deploy(session,0,fixture.barrel,0,false);
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'face-down-1'),/face-up/);
});

test('the effect requires the active team Main Phase and its active physical seat',()=>{
 const {adapter,session}=setup('phase'),source=summon(session,'barrel');
 session.duel.core.phase='battle';
 assert.throws(()=>adapter.prepareActivation(session,0,source.uid,'phase-battle-1'),/Fase Principal/);
 session.duel.core.phase='main';
 assert.throws(()=>adapter.prepareActivation(session,2,source.uid,'phase-seat-1'),/assento ativo/);
});

test('a Dragon owned by the inactive partner can activate from the shared team field',()=>{
 const {adapter,session}=setup('partner-source'),source=deploy(session,0,fixture.barrel,2,true);
 const plan=adapter.prepareActivation(session,0,source.uid,'partner-source-1');
 assert.equal(plan.sourceOwnerSeat,2);assert.equal(plan.controllerTeam,0);
});

test('a target removed after the coin result is rejected before destruction',()=>{
 const {adapter,session}=setup(seedFor(true)),source=summon(session,'barrel'),target=deploy(session,1,monsterIds[2],1,true);
 adapter.prepareActivation(session,0,source.uid,'protection-1');
 const result=adapter.resolveCoinToss(session,'protection-1');
 assert.ok(result.targetOptions.includes(target.uid));
 // The target is revalidated at selection; a state change that makes it unavailable is not bypassed.
 session.duel.core.players[1].monsters=session.duel.core.players[1].monsters.filter(card=>card.uid!==target.uid);
 session.duel.core.players[1].grave.push({uid:target.uid,id:target.id});
 assert.throws(()=>adapter.selectTarget(session,'protection-1',target.uid),/deixou de ser válido/);
});

test('a seven-card hand is preserved; the End Phase owns hand-limit discards',()=>{
 const {adapter,session}=setup(seedFor(false)),source=summon(session,'barrel');
 while(session.duel.core.players[0].hand.length<7)session.duel.core.players[0].hand.push(session.duel.core.players[0].deck.shift());
 const before=session.duel.core.players[0].hand.map(card=>card.uid).sort();
 adapter.prepareActivation(session,0,source.uid,'hand-limit-1');adapter.resolveCoinToss(session,'hand-limit-1');
 assert.deepEqual(session.duel.core.players[0].hand.map(card=>card.uid).sort(),before);
});

test('three Monster Zones and three Spell/Trap Zones remain the hard limits',()=>{
 const {session}=setup('zone-limits');
 for(let i=0;i<4;i++)deploy(session,0,monsterIds[i],0,true);
 assert.throws(()=>assertCoinTossRules(session.duel),/limite de zonas/);
});

test('the Field Zone is independent from the three Spell/Trap Zones',()=>{
 const {session}=setup('field-independent'),team=session.duel.core.players[0];
 for(const id of [spellIds[1],spellIds[2],trapIds[0]]){const card=take(team,id);team.backrow.push({...card,setTurn:0,faceUp:false});}
 const field=take(team,fieldSpellId);team.field={...field,setTurn:0,faceUp:true};
 assertCoinTossRules(session.duel);assert.equal(team.backrow.length,3);assert.ok(team.field);
});

test('Main Deck 20–30 and Extra Deck 5 remain enforced',()=>{
 const players=[0,1,2,3].map(i=>({id:'deck'+i,name:'Deck'+i,cards:[...deck]}));
 assert.throws(()=>createTagDuel(players.map(p=>({...p,cards:p.cards.slice(1)})),{classic:true,seed:'deck-19'}),/20 a 30/);
 const fusionIds=enabledCardIds.filter(id=>!!engineCard(id)?.fusion).slice(0,6);assert.ok(fusionIds.length>=6);
 const six=players.map((p,i)=>({...p,extra:i===0?fusionIds:[]}));
 assert.throws(()=>createTagDuel(six,{classic:true,seed:'extra-six'}),/máximo de 5/);
});

test('both real passcodes remain absent from the frozen certification and release sets',()=>{
 const cert=require('../dist/cardCertifications').cardCertifications,released=require('../dist/releasedCardIds').releasedCardIds;
 for(const id of ['21466326','25551951']){assert.equal(Object.hasOwn(cert,id),false);assert.equal(released.has(id),false);}
});
