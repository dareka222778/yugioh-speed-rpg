const test = require('node:test');
const assert = require('node:assert/strict');
const {
 createFiendEffectNegationAdapter,
 DARK_RULER_HA_DES_ID,DARK_BALTER_THE_TERRIBLE_ID,SKILL_DRAIN_ID
} = require('../dist/fiendEffectNegationTagAdapter');
const {createTagDuel,tagNormalCardIds,tagInventory} = require('../dist/tagDuel');
const {getDuelCard,getEffect,getEnabledCardIds} = require('../dist/effectRegistry');
const {getMonsterEffect} = require('../dist/monsterEffects');
const {synchronizeCardLifetimes} = require('../dist/cardLifetime');
const {RULES_PROFILE} = require('../dist/rulesProfile');

const enabled=getEnabledCardIds();
const jinzoId=enabled.find(id=>getMonsterEffect(id)?.operation?.kind==='negateTraps');
const royalDecreeId=enabled.find(id=>{
 const effect=getEffect(id);
 return effect?.kind==='continuous'&&effect.rules?.some(rule=>rule.kind==='negateTraps');
});
const fieldSpellId=enabled.find(id=>getEffect(id)?.kind==='field');
const normalSpellId='55144522'; // Pot of Greed, Normal Spell.
const effectMonsterId=enabled.find(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.monsterType==='effect'&&id!==jinzoId&&card.race!=='Fiend';
});
const fiends=enabled.filter(id=>{
 const card=getDuelCard(id);
 return card?.kind==='monster'&&card.race==='Fiend'&&card.monsterType==='normal';
}).slice(0,3);
const trapId=enabled.find(id=>getDuelCard(id)?.kind==='trap'&&id!==royalDecreeId&&getEffect(id)?.kind!=='continuous');
const fusionIds=enabled.filter(id=>getDuelCard(id)?.fusion).slice(0,6);
assert.ok(jinzoId,'O catálogo precisa expor Jinzo como bloqueador de ativação de Armadilhas.');
assert.ok(royalDecreeId,'O catálogo precisa expor Royal Decree como negador de efeitos de Armadilha.');
assert.ok(fieldSpellId,'O catálogo precisa expor uma Magia de Campo.');
assert.equal(getDuelCard(normalSpellId)?.kind,'spell','Pot of Greed precisa estar habilitada como Magia Normal.');
assert.ok(effectMonsterId,'O catálogo precisa expor um Monstro de Efeito não Fiend.');
assert.ok(fiends.length===3,'O catálogo precisa expor três monstros Fiend físicos para fixtures.');
assert.ok(trapId,'O catálogo precisa expor uma Armadilha física para fixture.');
assert.ok(fusionIds.length>=6,'O catálogo precisa expor ao menos seis Fusões para testar o limite Extra 5.');
const [fiendA,fiendB,fiendC]=fiends;
const special=new Set([fiendA,fiendB,fiendC,effectMonsterId,jinzoId,royalDecreeId,fieldSpellId,normalSpellId,trapId]);
const normalIds=tagNormalCardIds.filter(id=>!special.has(id)).slice(0,9);
assert.equal(normalIds.length,9,'O catálogo precisa expor nove monstros normais adicionais.');
const mainDeck=[fiendA,fiendB,fiendC,effectMonsterId,jinzoId,royalDecreeId,fieldSpellId,normalSpellId,trapId,trapId,trapId,...normalIds];
assert.equal(mainDeck.length,20);
assert.equal(new Set(mainDeck).size,18); // somente a Armadilha física tem três cópias.

const fixtureEffects=new Map([
 [fiendA,'ha-des'],
 [fiendB,'dark-balter'],
 [trapId,'skill-drain']
]);
const lookup=id=>{
 const effect=fixtureEffects.get(id);
 return effect?{kind:effect==='skill-drain'?'trap':'monster',effect}:undefined;
};
const adapter=createFiendEffectNegationAdapter(lookup);
const players=[
 {id:'p0',name:'Azul A',cards:mainDeck},
 {id:'p1',name:'Vermelho A',cards:mainDeck},
 {id:'p2',name:'Azul B',cards:mainDeck},
 {id:'p3',name:'Vermelho B',cards:mainDeck}
];
function makeDuel(extra=[]){
 return createTagDuel(players.map(p=>({...p,extra})) ,{seed:'m682-fiend-negation',first:0,classic:true});
}
function holderFor(duel,seat){
 const team=seat%2;
 return duel.active[team]===seat?duel.core.players[team]:duel.reserves[seat];
}
function takePhysical(duel,seat,id){
 const holder=holderFor(duel,seat);
 for(const zone of ['hand','deck','extra']){
  const list=holder[zone];if(!Array.isArray(list))continue;
  const index=list.findIndex(card=>card.id===id);
  if(index>=0)return list.splice(index,1)[0];
 }
 throw new Error('Fixture físico ausente: '+seat+'/'+id);
}
function placeMonster(duel,seat,id,{faceUp=true,position='atk'}={}){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].monsters.push({...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:seat});
 synchronizeCardLifetimes(duel.core);
 return card.uid;
}
function placeBackrow(duel,seat,id,{faceUp=false,resolved=false,setTurn=0}={}){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].backrow.push({...card,setTurn,faceUp,resolved});
 synchronizeCardLifetimes(duel.core);
 return card.uid;
}
function placeField(duel,seat,id){
 const card=takePhysical(duel,seat,id);
 duel.core.players[seat%2].field={...card,setTurn:0,faceUp:true,resolved:true};
 synchronizeCardLifetimes(duel.core);
 return card.uid;
}
function moveMonsterToGrave(duel,uid){
 for(let team=0;team<2;team++){
  const index=duel.core.players[team].monsters.findIndex(m=>m.uid===uid);
  if(index>=0){
   const [monster]=duel.core.players[team].monsters.splice(index,1);
   const owner=Number(/^m([0-3]):/.exec(uid)?.[1]??team);
   duel.core.players[owner%2].grave.push({uid:monster.uid,id:monster.id});
   synchronizeCardLifetimes(duel.core);return;
  }
 }
 throw new Error('Monstro não encontrado para mover ao Cemitério.');
}
function reviveMonsterFromGrave(duel,uid){
 for(let team=0;team<2;team++){
  const index=duel.core.players[team].grave.findIndex(card=>card.uid===uid);
  if(index>=0){
   const [card]=duel.core.players[team].grave.splice(index,1);
   const owner=Number(/^m([0-3]):/.exec(uid)?.[1]??team);
   duel.core.players[owner%2].monsters.push({...card,position:'atk',faceUp:true,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner});
   synchronizeCardLifetimes(duel.core);return;
  }
 }
 throw new Error('Monstro não encontrado para reviver.');
}
function setSkillDrain(session){
 const uid=placeBackrow(session.duel,0,trapId);
 session.duel.core.phase='main';session.duel.core.priority=0;
 const activation=adapter.activateSkillDrain(session,'sd-activate',uid,0);
 const resolution=adapter.resolveSkillDrain(session,'sd-activate');
 return {uid,activation,resolution};
}
function battle(session,{battleId='battle-1',destroyerSeat=2,destroyerId=fiendC,destroyedSeat=1,destroyedId=effectMonsterId,destroyedByBattle=true}={}){
 const destroyerUid=placeMonster(session.duel,destroyerSeat,destroyerId);
 const destroyedUid=placeMonster(session.duel,destroyedSeat,destroyedId);
 const result=adapter.recordBattleDestruction(session,{battleId,destroyerUid,destroyedUid,destroyedByBattle});
 return {destroyerUid,destroyedUid,result};
}

test('fixtures cobrem duas cartas novas e Skill Drain sem alterar o catálogo nem certificar por importação',()=>{
 assert.equal(DARK_RULER_HA_DES_ID,'53982768');
 assert.equal(DARK_BALTER_THE_TERRIBLE_ID,'80071763');
 assert.equal(SKILL_DRAIN_ID,'82732705');
 assert.equal(getDuelCard(DARK_RULER_HA_DES_ID),undefined);
 assert.equal(getDuelCard(DARK_BALTER_THE_TERRIBLE_ID),undefined);
 assert.equal(getDuelCard(SKILL_DRAIN_ID),undefined);
 assert.equal(RULES_PROFILE.mainDeckMin,20);
 assert.equal(RULES_PROFILE.mainDeckMax,30);
 assert.equal(RULES_PROFILE.handLimit,6);
 assert.equal(RULES_PROFILE.handCheck,'end');
 assert.equal(RULES_PROFILE.monsterZones,3);
 assert.equal(RULES_PROFILE.spellTrapZones,3);
 assert.equal(RULES_PROFILE.extraDeckMax,5);
});

test('preserva inventário físico, quatro assentos, equipes e Extra Deck 5',()=>{
 const duel=makeDuel(fusionIds.slice(0,5));
 const before=tagInventory(duel).map(c=>[c.uid,c.id]).sort();
 const session=adapter.createSession(duel);
 assert.equal(session.duel.members.length,4);
 assert.deepEqual(session.duel.active,[0,1]);
 assert.equal(session.duel.core.players[0].monsters.length,0);
 assert.equal(session.duel.core.players[0].backrow.length,0);
 assert.deepEqual(tagInventory(session.duel).map(c=>[c.uid,c.id]).sort(),before);
 assert.throws(()=>makeDuel(fusionIds.slice(0,6)),/Deck Adicional|máximo/i);
});

test('Deck Principal aceita 20 e rejeita 19; mão 7 só é tratada na End Phase',()=>{
 const duel=makeDuel();
 const session=adapter.createSession(duel);
 assert.doesNotThrow(()=>adapter.activeSources(session.duel));
 const short=structuredClone(duel);
 short.core.players[0].deck.pop();
 assert.throws(()=>adapter.createSession(short));
 const seven=structuredClone(duel);
 while(seven.core.players[0].hand.length<7)seven.core.players[0].hand.push(seven.core.players[0].deck.pop());
 assert.doesNotThrow(()=>adapter.createSession(seven));
});

test('Field Zone é independente das três Spell/Trap Zones',()=>{
 const duel=makeDuel();
 for(let i=0;i<3;i++)placeBackrow(duel,0,trapId);
 placeField(duel,0,fieldSpellId);
 assert.doesNotThrow(()=>adapter.createSession(duel));
 const fourth=structuredClone(duel);
 placeBackrow(fourth,0,royalDecreeId);
 assert.throws(()=>adapter.createSession(fourth),/Spell\/Trap Zones|zona/i);
});

test('Skill Drain paga 1000 LP na ativação e só passa a negar após resolver',()=>{
 const session=adapter.createSession(makeDuel());
 const uid=placeBackrow(session.duel,0,trapId);
 const before=session.duel.core.players[0].lp;
 const activation=adapter.activateSkillDrain(session,'sd-1',uid,0);
 assert.equal(activation.lpPaid,1000);
 assert.equal(session.duel.core.players[0].lp,before-1000);
 assert.equal(session.duel.core.players[0].backrow.find(c=>c.uid===uid).faceUp,true);
 assert.equal(session.duel.core.players[0].backrow.find(c=>c.uid===uid).resolved,false);
 assert.equal(adapter.activeSources(session.duel).skillDrainUids.includes(uid),false);
 const resolution=adapter.resolveSkillDrain(session,'sd-1');
 assert.equal(resolution.status,'active');
 assert.equal(adapter.activeSources(session.duel).skillDrainUids.includes(uid),true);
});

test('Skill Drain nega efeitos de monstros face-up de ambas as equipes, sem impedir a ativação',()=>{
 const session=adapter.createSession(makeDuel());
 setSkillDrain(session);
 const blue=placeMonster(session.duel,0,fiendA);
 const red=placeMonster(session.duel,1,fiendC);
 assert.equal(adapter.monsterEffectNegated(session.duel,blue),true);
 assert.equal(adapter.monsterEffectNegated(session.duel,red),true);
 assert.equal(adapter.monsterEffectActivationAllowed(session.duel,blue),true);
 assert.equal(adapter.monsterEffectActivationAllowed(session.duel,red),true);
});

test('Skill Drain não nega monstros face-down e deixa de funcionar quando sai do campo',()=>{
 const session=adapter.createSession(makeDuel());
 const {uid}=setSkillDrain(session);
 const faceDown=placeMonster(session.duel,1,fiendC,{faceUp:false,position:'def'});
 assert.equal(adapter.monsterEffectNegated(session.duel,faceDown),false);
 session.duel.core.players[0].backrow.find(c=>c.uid===uid).faceUp=false;
 assert.equal(adapter.monsterEffectNegated(session.duel,faceDown),false);
});

test('Jinzo impede ativar Skill Drain antes de pagar LP',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,1,jinzoId);
 const uid=placeBackrow(session.duel,0,trapId);
 const lp=session.duel.core.players[0].lp;
 assert.throws(()=>adapter.activateSkillDrain(session,'sd-jinzo',uid,0),/bloqueada/i);
 assert.equal(session.duel.core.players[0].lp,lp);
 assert.equal(session.duel.core.players[0].backrow.find(c=>c.uid===uid).faceUp,false);
});

test('Royal Decree permite a ativação de Skill Drain, mas nega seu efeito',()=>{
 const session=adapter.createSession(makeDuel());
 placeBackrow(session.duel,1,royalDecreeId,{faceUp:true,resolved:true});
 const uid=placeBackrow(session.duel,0,trapId);
 const activation=adapter.activateSkillDrain(session,'sd-decree',uid,0);
 assert.equal(activation.lpPaid,1000);
 const result=adapter.resolveSkillDrain(session,'sd-decree');
 assert.equal(result.status,'effect-negated');
 assert.equal(session.duel.core.players[0].backrow.find(c=>c.uid===uid).faceUp,true);
 assert.equal(adapter.activeSources(session.duel).skillDrainUids.includes(uid),false);
});

test('negar a ativação de Skill Drain não devolve o custo e envia a Armadilha ao Cemitério do dono',()=>{
 const session=adapter.createSession(makeDuel());
 const uid=placeBackrow(session.duel,2,trapId);
 const lp=session.duel.core.players[0].lp;
 adapter.activateSkillDrain(session,'sd-negated',uid,0);
 const result=adapter.resolveSkillDrain(session,'sd-negated',{activationNegated:true});
 assert.equal(result.status,'activation-negated');
 assert.equal(session.duel.core.players[0].lp,lp-1000);
 assert.equal(session.duel.core.players[0].backrow.some(c=>c.uid===uid),false);
 assert.equal(session.duel.core.players[0].grave.some(c=>c.uid===uid),true);
});

test('ativação e resolução de Skill Drain são idempotentes e rejeitam reutilização de ID',()=>{
 const session=adapter.createSession(makeDuel());
 const uid=placeBackrow(session.duel,0,trapId);
 const first=adapter.activateSkillDrain(session,'sd-idempotent',uid,0);
 assert.deepEqual(adapter.activateSkillDrain(session,'sd-idempotent',uid,0),first);
 const result=adapter.resolveSkillDrain(session,'sd-idempotent');
 assert.equal(adapter.resolveSkillDrain(session,'sd-idempotent').replayed,true);
 assert.equal(result.status,'active');
 assert.throws(()=>adapter.activateSkillDrain(session,'sd-idempotent',uid,1),/reutilizado/i);
});

test('pagar exatamente 1000 LP encerra o duelo sem ativar o efeito contínuo',()=>{
 const session=adapter.createSession(makeDuel());
 const uid=placeBackrow(session.duel,0,trapId);
 session.duel.core.players[0].lp=1000;
 const activation=adapter.activateSkillDrain(session,'sd-lethal',uid,0);
 assert.equal(activation.status,'duel-ended-by-cost');
 assert.equal(session.duel.core.players[0].lp,0);
 assert.equal(session.duel.core.phase,'finished');
 assert.equal(adapter.resolveSkillDrain(session,'sd-lethal').status,'duel-ended-by-cost');
});

test('Ha Des nega o efeito de um Effect Monster destruído por Fiend controlado pelo parceiro',()=>{
 const session=adapter.createSession(makeDuel());
 const haDesUid=placeMonster(session.duel,0,fiendA);
 const result=battle(session);
 assert.equal(result.result.status,'effect-negated');
 assert.deepEqual(result.result.sourceUids,[haDesUid]);
 assert.equal(adapter.isDestroyedMonsterEffectNegated(session,result.destroyedUid),true);
});

test('Ha Des não aplica a monstros destruídos por um atacante que não seja Fiend',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,0,fiendA);
 const result=battle(session,{destroyerSeat:2,destroyerId:nonFiendNormalId,battleId:'non-fiend'});
 assert.equal(result.result.status,'not-negated');
});

test('Ha Des não aplica a monstros normais nem quando sua fonte está face-down',()=>{
 const normalTarget=adapter.createSession(makeDuel());
 placeMonster(normalTarget.duel,0,fiendA);
 const notEffect=battle(normalTarget,{destroyedId:normalIds[1],battleId:'normal-target'});
 assert.equal(notEffect.result.status,'not-effect-monster');
 const hidden=adapter.createSession(makeDuel());
 placeMonster(hidden.duel,0,fiendA,{faceUp:false,position:'def'});
 const noSource=battle(hidden,{battleId:'hidden-ha-des'});
 assert.equal(noSource.result.status,'not-negated');
});

test('Ha Des não funciona sob Skill Drain, embora o monstro possa ativar seu efeito',()=>{
 const session=adapter.createSession(makeDuel());
 setSkillDrain(session);
 placeMonster(session.duel,0,fiendA);
 const result=battle(session,{battleId:'ha-des-under-skill-drain'});
 assert.equal(result.result.status,'not-negated');
});

test('Dark Balter nega o efeito do Effect Monster que ele próprio destrói em batalha',()=>{
 const session=adapter.createSession(makeDuel());
 const result=battle(session,{destroyerSeat:0,destroyerId:fiendB,battleId:'balter-battle'});
 assert.equal(result.result.status,'effect-negated');
 assert.deepEqual(result.result.sourceUids,[result.destroyerUid]);
});

test('Dark Balter não estende a negação de batalha a outro Fiend da equipe',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,0,fiendB);
 const result=battle(session,{destroyerSeat:2,destroyerId:fiendC,battleId:'balter-partner'});
 assert.equal(result.result.status,'not-negated');
});

test('Dark Balter só responde a Magia Normal e paga 1000 LP para negar o efeito, não a ativação',()=>{
 const session=adapter.createSession(makeDuel());
 const balterUid=placeMonster(session.duel,0,fiendB);
 session.duel.core.phase='response';session.duel.core.priority=0;
 const before=session.duel.core.players[0].lp;
 assert.throws(()=>adapter.activateDarkBalterSpellNegation(session,{
  activationId:'balter-quickplay',sourceUid:balterUid,actorSeat:0,spellActivationId:'spell-q',spellType:'quickplay'
 }),/Magia Normal/i);
 const activation=adapter.activateDarkBalterSpellNegation(session,{
  activationId:'balter-normal',sourceUid:balterUid,actorSeat:0,spellActivationId:'spell-normal',spellType:'normal'
 });
 assert.equal(activation.lpPaid,1000);
 assert.equal(session.duel.core.players[0].lp,before-1000);
 const result=adapter.resolveDarkBalterSpellNegation(session,'balter-normal');
 assert.equal(result.status,'spell-effect-negated');
 assert.equal(result.spellActivationId,'spell-normal');
});

test('Skill Drain nega o efeito de resposta de Dark Balter, mas não devolve seus 1000 LP',()=>{
 const session=adapter.createSession(makeDuel());
 setSkillDrain(session);
 const balterUid=placeMonster(session.duel,0,fiendB);
 session.duel.core.phase='response';session.duel.core.priority=0;
 const before=session.duel.core.players[0].lp;
 adapter.activateDarkBalterSpellNegation(session,{
  activationId:'balter-under-drain',sourceUid:balterUid,actorSeat:0,spellActivationId:'spell-2',spellType:'normal'
 });
 const result=adapter.resolveDarkBalterSpellNegation(session,'balter-under-drain');
 assert.equal(result.status,'effect-negated');
 assert.equal(session.duel.core.players[0].lp,before-1000);
});

test('Dark Balter perde o vínculo de ativação se deixar o campo antes da resolução',()=>{
 const session=adapter.createSession(makeDuel());
 const balterUid=placeMonster(session.duel,0,fiendB);
 session.duel.core.phase='response';session.duel.core.priority=0;
 adapter.activateDarkBalterSpellNegation(session,{
  activationId:'balter-left',sourceUid:balterUid,actorSeat:0,spellActivationId:'spell-3',spellType:'normal'
 });
 moveMonsterToGrave(session.duel,balterUid);
 assert.equal(adapter.resolveDarkBalterSpellNegation(session,'balter-left').status,'source-left-field');
});

test('uma ativação de Magia Normal não é negada por uma Dark Balter que não esteja face-up',()=>{
 const session=adapter.createSession(makeDuel());
 const balterUid=placeMonster(session.duel,0,fiendB,{faceUp:false,position:'def'});
 session.duel.core.phase='response';session.duel.core.priority=0;
 assert.throws(()=>adapter.activateDarkBalterSpellNegation(session,{
  activationId:'balter-hidden',sourceUid:balterUid,actorSeat:0,spellActivationId:'spell-4',spellType:'normal'
 }),/face-up/i);
});

test('um efeito de batalha só é registrado uma vez e não altera o inventário',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,0,fiendA);
 const before=tagInventory(session.duel).map(c=>[c.uid,c.id]).sort();
 const result=battle(session,{battleId:'one-battle'});
 const replay=adapter.recordBattleDestruction(session,{
  battleId:'one-battle',destroyerUid:result.destroyerUid,destroyedUid:result.destroyedUid,destroyedByBattle:true
 });
 assert.equal(result.result.status,'effect-negated');
 assert.equal(replay.replayed,true);
 assert.deepEqual(tagInventory(session.duel).map(c=>[c.uid,c.id]).sort(),before);
});

test('efeito que não veio de batalha não recebe a negação de Ha Des/Balter',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,0,fiendA);
 const result=battle(session,{battleId:'not-battle',destroyedByBattle:false});
 assert.equal(result.result.status,'not-battle-destruction');
});

test('uma batalha entre membros da mesma equipe é rejeitada',()=>{
 const session=adapter.createSession(makeDuel());
 const attacker=placeMonster(session.duel,0,fiendC);
 const target=placeMonster(session.duel,2,effectMonsterId);
 assert.throws(()=>adapter.recordBattleDestruction(session,{
  battleId:'same-team',destroyerUid:attacker,destroyedUid:target,destroyedByBattle:true
 }),/equipes adversárias/i);
});

test('negação de batalha acompanha o UID até o Cemitério e termina quando a carta retorna ao campo',()=>{
 const session=adapter.createSession(makeDuel());
 placeMonster(session.duel,0,fiendA);
 const result=battle(session,{battleId:'lifetime-battle'});
 assert.equal(adapter.isDestroyedMonsterEffectNegated(session,result.destroyedUid),true);
 moveMonsterToGrave(session.duel,result.destroyedUid);
 assert.equal(adapter.isDestroyedMonsterEffectNegated(session,result.destroyedUid),true);
 reviveMonsterFromGrave(session.duel,result.destroyedUid);
 assert.equal(adapter.isDestroyedMonsterEffectNegated(session,result.destroyedUid),false);
});
