'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {enabledCardIds,getDuelCard}=require('../dist/effectRegistry');
const {rulesFor,RULES_VERSION}=require('../dist/rulesProfile');

const normalIds=tag.tagNormalCardIds;
const fusionIds=enabledCardIds.filter(id=>getDuelCard(id)?.fusion?.length).slice(0,6);
assert.ok(normalIds.length>=30,'o catálogo precisa oferecer 30 monstros Normais habilitados');
assert.equal(fusionIds.length,6,'o catálogo precisa oferecer seis Fusão para testar o limite 5');
const standardExtra=fusionIds.slice(0,5);

function players(deck,extra=standardExtra){
 return [0,1,2,3].map(i=>({id:'m669-p'+i,name:'M669 P'+i,cards:[...deck],extra:[...extra]}));
}
function classic(first=0,deck=normalIds.slice(0,20),extra=standardExtra){
 return tag.createTagDuel(players(deck,extra),{seed:'m669-owner-rules-'+first+'-'+deck.length+'-'+extra.length,first,classic:true});
}
function take(p,id){
 for(const zone of ['hand','deck']){
  const cards=p[zone],index=cards.findIndex(c=>c.id===id);
  if(index>=0)return cards.splice(index,1)[0];
 }
 throw new Error('Carta '+id+' não encontrada na mão/deck físico do assento ativo.');
}
function monster(card,owner=0){
 return {...card,owner,position:'atk',faceUp:true,entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
}
function setBackrow(card){return {...card,setTurn:0,faceUp:false};}
function assertUniqueInventory(s){
 const cards=tag.tagInventory(s).filter(c=>c.entityKind!=='token');
 assert.equal(new Set(cards.map(c=>c.uid)).size,cards.length,'UID físico duplicado no inventário');
}
function act(s,kind,member=tag.tagDecisionMember(s).id){
 const action=tag.tagActions(s,member).find(a=>a.kind===kind);
 assert.ok(action,'ação '+kind+' ausente para '+member+' em '+s.core.phase);
 return tag.stepTagDuel(s,member,action);
}
function passResponses(s){
 for(let n=0;s.core.phase==='response';n++){
  assert.ok(n<24,'cadeia de respostas excedeu o orçamento');
  s=act(s,'pass');
 }
 return s;
}

test('o perfil clássico fixa Deck 20–30, Extra 5, zonas 3+3 e mão 6 na End Phase',()=>{
 const s20=classic(0,normalIds.slice(0,20));
 const s30=classic(0,normalIds.slice(0,30));
 assert.equal(s20.core.rulesVersion,RULES_VERSION);
 assert.equal(s30.core.rulesVersion,RULES_VERSION);
 for(const s of [s20,s30]){
  const r=rulesFor(s.core);
  assert.equal(r.mainDeckMin,20);
  assert.equal(r.mainDeckMax,30);
  assert.equal(r.extraDeckMax,5);
  assert.equal(r.monsterZones,3);
  assert.equal(r.spellTrapZones,3);
  assert.equal(r.handLimit,6);
  assert.equal(r.handCheck,'end');
  assert.equal(s.core.players[0].extra.length,5);
  assertUniqueInventory(s);
 }
 assert.throws(()=>classic(0,normalIds.slice(0,19)));
 assert.throws(()=>classic(0,normalIds.slice(0,31)));
 assert.throws(()=>classic(0,normalIds.slice(0,20),fusionIds));
});

test('três Monster Zones e três Spell/Trap Zones coexistem com Field Zone separada',()=>{
 const fieldId='56594520';
 const backrowIds=['05318639','14087893','17814387','77414722'];
 assert.equal(getDuelCard(fieldId)?.field,true,'Umi deve ser reconhecida como Field Spell');
 for(const id of backrowIds)assert.ok(['spell','trap'].includes(getDuelCard(id)?.kind),'carta de backrow inválida: '+id);
 const deck=[...normalIds.slice(0,15),...backrowIds,fieldId];
 assert.equal(deck.length,20);
 const s=classic(0,deck);
 const p=s.core.players[0];
 for(const id of normalIds.slice(0,3))p.monsters.push(monster(take(p,id),0));
 for(const id of backrowIds.slice(0,3))p.backrow.push(setBackrow(take(p,id)));
 p.field={...take(p,fieldId),setTurn:0,faceUp:true};
 tag.assertTagDuel(s);
 assert.equal(p.monsters.length,3);
 assert.equal(p.backrow.length,3);
 assert.equal(p.field.id,fieldId);
 assertUniqueInventory(s);

 const tooManyMonsters=structuredClone(s);
 const pm=tooManyMonsters.core.players[0];
 pm.monsters.push(monster(take(pm,normalIds[3]),0));
 assert.throws(()=>tag.assertTagDuel(tooManyMonsters),'a quarta Monster Zone deve ser rejeitada');

 const tooManyBackrow=structuredClone(s);
 const pb=tooManyBackrow.core.players[0];
 pb.backrow.push(setBackrow(take(pb,backrowIds[3])));
 assert.throws(()=>tag.assertTagDuel(tooManyBackrow),'a quarta Spell/Trap Zone deve ser rejeitada');
});

test('mão de sete não é descartada no meio do turno; o descarte 6 ocorre na End Phase do dono físico',()=>{
 let s=classic(0,normalIds.slice(0,20));
 assert.equal(s.core.rulesVersion,RULES_VERSION);
 s.core.turn=3;
 s.core.phase='main';
 s.core.resume='main';
 s.core.pending={kind:'none'};
 s.core.priority=s.core.current;
 s.core.passes=0;
 s.core.chain=[];
 const active=s.core.players[0];
 while(active.hand.length<7)active.hand.push(active.deck.shift());
 const inactivePartner=s.reserves[2];
 while(inactivePartner.hand.length<7)inactivePartner.hand.push(inactivePartner.deck.shift());
 const partnerBefore=tag.tagMemberHand(s,'m669-p2').map(c=>c.uid);
 const activeBefore=tag.tagMemberHand(s,'m669-p0').map(c=>c.uid);
 assert.equal(activeBefore.length,7);
 assert.equal(partnerBefore.length,7);
 assert.equal(s.core.phase,'main');
 const publicState=JSON.stringify(tag.publicTagDuel(s));
 for(const uid of [...activeBefore,...partnerBefore])assert.equal(publicState.includes(uid),false,'a mão privada vazou para a projeção pública');

 const turnBefore=s.core.turn;
 s=passResponses(act(s,'end','m669-p0'));
 assert.equal(s.core.phase,'discard');
 assert.equal(s.core.turn,turnBefore);
 assert.equal(tag.tagDecisionMember(s).id,'m669-p0');
 const discard=tag.tagActions(s,'m669-p0').find(a=>a.kind==='discard');
 assert.ok(discard,'o representante ativo deve escolher uma carta para descartar');
 s=tag.stepTagDuel(s,'m669-p0',discard);
 assert.equal(s.core.phase,'main');
 assert.equal(s.core.turn,turnBefore+1);
 assert.equal(tag.tagMemberHand(s,'m669-p0').length,6);
 assert.deepEqual(tag.tagMemberHand(s,'m669-p2').map(c=>c.uid),partnerBefore,'o parceiro não descarta antes da própria End Phase');
 assertUniqueInventory(s);
 tag.assertTagDuel(JSON.parse(JSON.stringify(s)));
});
