'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTagDuel,assertTagDuel,tagInventory,tagNormalCardIds}=require('../dist/tagDuel');
const {createStandbyLPSession,applyStandbyLPGains}=require('../dist/standbyLPGainTagAdapter');

const HANE_HANE='07089711';
const MAN_EATER_BUG='54652250';
const FIXTURE_IDS={cureMermaidId:HANE_HANE,spiritOfTheBreezeId:MAN_EATER_BUG};
const deckIds=[HANE_HANE,MAN_EATER_BUG,...tagNormalCardIds.filter(id=>id!==HANE_HANE&&id!==MAN_EATER_BUG).slice(0,18)];
function duelFixture(){
 const players=[0,1,2,3].map(i=>({id:'m636-p'+i,name:'M636 P'+i,cards:[...deckIds]}));
 const duel=createTagDuel(players,{seed:'m636-standby-lp',first:0,classic:true});
 assertTagDuel(duel);
 return duel;
}
function moveToMonster(duel,team,id,position='atk',faceUp=true){
 const player=duel.core.players[team];
 let cardIndex=player.hand.findIndex(card=>card.id===id),card;
 if(cardIndex>=0)card=player.hand.splice(cardIndex,1)[0];
 else{cardIndex=player.deck.findIndex(item=>item.id===id);assert.notEqual(cardIndex,-1,'fixture card must be in hand or deck');card=player.deck.splice(cardIndex,1)[0];}
 player.monsters.push({...card,position,faceUp,entered:duel.core.turn,changed:duel.core.turn,attacked:0,atkBoost:0,defBoost:0,owner:duel.active[team]});
 return card.uid;
}
function snapshot(duel){return tagInventory(duel).filter(card=>card.entityKind!=='token').map(card=>[card.uid,card.id]).sort((a,b)=>a[0].localeCompare(b[0]));}
function apply(duel,team=0){return applyStandbyLPGains(createStandbyLPSession(duel),team,FIXTURE_IDS);}

test('Cure Mermaid recupera 800 LP mesmo em Defesa face-up',()=>{
 const duel=duelFixture();const uid=moveToMonster(duel,0,HANE_HANE,'def',true);const before=duel.core.players[0].lp;
 const {result}=apply(duel,0);
 assert.equal(result.gain,800);assert.equal(result.lpBefore,before);assert.equal(result.lpAfter,before+800);
 assert.equal(result.sources[0].uid,uid);assert.equal(result.sources[0].physicalOwnerSeat,0);
});

test('Spirit of the Breeze recupera 1000 LP somente em Ataque face-up',()=>{
 const duel=duelFixture();const uid=moveToMonster(duel,0,MAN_EATER_BUG,'atk',true);
 const {result}=apply(duel,0);
 assert.equal(result.gain,1000);assert.equal(result.sources[0].uid,uid);assert.equal(result.sources[0].condition,'face-up-attack');
});

test('Spirit of the Breeze em Defesa face-up não recupera LP',()=>{
 const duel=duelFixture();moveToMonster(duel,0,MAN_EATER_BUG,'def',true);
 const {result}=apply(duel,0);
 assert.equal(result.gain,0);assert.deepEqual(result.sources,[]);
});

test('Cure Mermaid e Spirit of the Breeze acumulam no LP compartilhado da equipe',()=>{
 const duel=duelFixture();moveToMonster(duel,0,HANE_HANE,'def',true);moveToMonster(duel,0,MAN_EATER_BUG,'atk',true);
 const team0Before=duel.core.players[0].lp,team1Before=duel.core.players[1].lp;
 const {result}=apply(duel,0);
 assert.equal(result.gain,1800);assert.equal(duel.core.players[1].lp,team1Before);
 assert.equal(result.lpAfter,team0Before+1800);assert.equal(result.sharedTeamLP,true);
});

test('efeito controlado pela equipe adversária não recupera LP da equipe ativa',()=>{
 const duel=duelFixture();moveToMonster(duel,1,HANE_HANE,'atk',true);
 const before=duel.core.players[0].lp;const {result}=apply(duel,0);
 assert.equal(result.gain,0);assert.equal(result.lpAfter,before);
});

test('monstro face-down não gera recuperação',()=>{
 const duel=duelFixture();moveToMonster(duel,0,HANE_HANE,'def',false);
 const {result}=apply(duel,0);assert.equal(result.gain,0);
});

test('recuperação não pode ser aplicada duas vezes na mesma Standby da equipe',()=>{
 const duel=duelFixture();moveToMonster(duel,0,HANE_HANE,'atk',true);
 const first=applyStandbyLPGains(createStandbyLPSession(duel),0,FIXTURE_IDS);
 assert.throws(()=>applyStandbyLPGains(first.session,0,FIXTURE_IDS),/já aplicada/);
});

test('a próxima Standby da mesma equipe pode recuperar novamente',()=>{
 const duel=duelFixture();moveToMonster(duel,0,HANE_HANE,'atk',true);
 const first=applyStandbyLPGains(createStandbyLPSession(duel),0,FIXTURE_IDS);
 first.session.duel.core.turn+=2;
 const second=applyStandbyLPGains(first.session,0,FIXTURE_IDS);
 assert.equal(second.result.gain,800);assert.equal(second.result.lpAfter,first.result.lpAfter+800);
});

test('não aplica quando a equipe não é a equipe ativa',()=>{
 const duel=duelFixture();
 assert.throws(()=>apply(duel,1),/equipe não está na janela/);
});

test('aguarda a fila de tarefas da Standby terminar',()=>{
 const duel=duelFixture();
 duel.core.standby={version:1,tasks:[{id:'m636-pending',turn:duel.core.turn,actor:0,optional:false,options:[{id:'gain',label:'Ganho pendente',operations:[{kind:'gainLP',player:'self',amount:1}]}]}],completed:[]};
 assert.throws(()=>apply(duel,0),/fila de efeitos da Standby/);
});

test('conserva UID, identidade física, mãos, decks e zonas 3+3',()=>{
 const duel=duelFixture();moveToMonster(duel,0,HANE_HANE,'atk',true);moveToMonster(duel,0,MAN_EATER_BUG,'atk',true);
 const before=snapshot(duel),hands=duel.core.players.map(p=>p.hand.length),decks=duel.core.players.map(p=>p.deck.length);
 const monsters=duel.core.players.map(p=>p.monsters.length),backrow=duel.core.players.map(p=>p.backrow.length);
 const {session}=applyStandbyLPGains(createStandbyLPSession(duel),0,FIXTURE_IDS);
 assert.deepEqual(snapshot(session.duel),before);assert.deepEqual(session.duel.core.players.map(p=>p.hand.length),hands);
 assert.deepEqual(session.duel.core.players.map(p=>p.deck.length),decks);assert.deepEqual(session.duel.core.players.map(p=>p.monsters.length),monsters);
 assert.deepEqual(session.duel.core.players.map(p=>p.backrow.length),backrow);
});
