'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {actionLabel}=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');

const RED_MEDICINE='38199696';
const MOOYAN_CURRY='58074572';
const POISON_OF_THE_OLD_MAN='08842266';
for(const id of [RED_MEDICINE,MOOYAN_CURRY,POISON_OF_THE_OLD_MAN]){
  assert.equal(getPlayableCard(id)?.kind,'spell','the Discord fixture requires a certified Spell '+id);
}
const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=7,'the Discord fixture needs seven certified Normal Monsters');
const normalIds=normal.slice(0,7).map(entry=>entry.id);

function member(seat){return 'm159-seat-'+seat;}
function deck(required=[]){const ids=[...new Set([...required,...normalIds])];assert.ok(ids.length>=7);return Array.from({length:20},(_,index)=>ids[index%ids.length]);}
function holder(state,seat){const team=seat%2;return state.active[team]===seat?state.core.players[team]:state.reserves[seat];}
function ensureInHand(state,seat,id){const physical=holder(state,seat);const held=physical.hand.find(card=>card.id===id);if(held)return held;const index=physical.deck.findIndex(card=>card.id===id);assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);const [card]=physical.deck.splice(index,1);physical.hand.push(card);return card;}
function takeCard(state,seat,id){const physical=holder(state,seat);for(const zone of ['hand','deck']){const index=physical[zone].findIndex(card=>card.id===id);if(index>=0)return physical[zone].splice(index,1)[0];}throw new Error('M159 fixture card missing from physical seat '+seat+': '+id);}
function setup(){
  const players=[0,1,2,3].map(seat=>({id:member(seat),name:'M159 Seat '+seat,cards:deck(seat===0?[RED_MEDICINE,MOOYAN_CURRY]:seat===2?[POISON_OF_THE_OLD_MAN]:[])}));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m159-economic-discord-private-menu'});
  const red=ensureInHand(state,0,RED_MEDICINE),mooyan=ensureInHand(state,0,MOOYAN_CURRY);
  const poisonCard=takeCard(state,2,POISON_OF_THE_OLD_MAN),poison={...poisonCard,setTurn:0,faceUp:false};
  state.core.players[0].backrow.push(poison);state.core.turn=3;
  assert.match(red.uid,/^m0:/);assert.match(mooyan.uid,/^m0:/);assert.match(poison.uid,/^m2:/,'the hidden Quick-Play Spell must retain inactive partner seat 2 ownership');
  assert.doesNotThrow(()=>tag.assertTagDuel(state));
  const members=[0,1,2,3].map(seat=>({id:member(seat),name:'M159 Seat '+seat,accepted:true}));
  const record={id:'m159-economic-discord',guild:'m159-guild',channel:'m159-channel',message:'m159-message',revision:7,updated:Date.now(),status:'playing',members,state,rules:'classic-loan'};
  return {state,record,red,mooyan,poison};
}
function rows(payload){return payload.components.map(row=>row.toJSON());}
function actionMenu(payload){return rows(payload).flatMap(row=>row.components).find(component=>component.type===3&&component.custom_id.startsWith('tag:act:'));}

test('2v2 private Discord menu preserves every economic Spell choice and its action index',()=>{
  const {state,record,red,mooyan,poison}=setup(),owner=member(0),actions=tag.tagActions(state,owner);
  assert.ok(actions.length>0,'active physical seat 0 must receive legal actions');
  const pages=Math.max(1,Math.ceil(actions.length/20)),mapped=[];
  for(let page=0;page<pages;page++){
    const payload=tagPrivateMessage(record,owner,page);assert.doesNotThrow(()=>validateDiscordPayload(payload),'private Discord payload must be valid');
    const menu=actionMenu(payload);assert.ok(menu,'each populated action page must render a select menu');
    assert.equal(menu.custom_id,'tag:act:'+record.id+':'+record.revision+':'+owner);
    mapped.push(...menu.options.map(option=>({index:Number(option.value),label:option.label})));
  }
  assert.deepEqual(mapped.map(entry=>entry.index),actions.map((_,index)=>index),'Discord option values must map one-to-one to the current tagActions order');
  for(const source of [red,mooyan,poison]){
    const expected=actions.map((action,index)=>({action,index,label:actionLabel(state.core,'tag-team-0',action).slice(0,100)})).filter(entry=>entry.action.kind==='spell'&&entry.action.card===source.uid);
    const rendered=mapped.filter(entry=>expected.some(item=>item.index===entry.index));
    assert.deepEqual(rendered,expected.map(item=>({index:item.index,label:item.label})),'Discord must preserve exact action labels and indices for physical card '+source.uid);
  }
  const mooyanChoices=actions.filter(action=>action.kind==='spell'&&action.card===mooyan.uid),poisonChoices=actions.filter(action=>action.kind==='spell'&&action.card===poison.uid);
  assert.deepEqual(mooyanChoices.map(action=>action.target).sort(),['__choice_0__','__choice_1__']);
  assert.deepEqual(poisonChoices.map(action=>action.target).sort(),['__choice_0__','__choice_1__']);
  assert.equal(actions.filter(action=>action.kind==='spell'&&action.card===red.uid).length,1);
  for(const id of [RED_MEDICINE,MOOYAN_CURRY,POISON_OF_THE_OLD_MAN])assert.ok(mapped.some(entry=>entry.label.includes(getPlayableCard(id).name)),'Discord menu must name '+id);
});

test('inactive teammates receive no Discord action menu and public panel hides the partner Set Quick-Play Spell',()=>{
  const {state,record,poison}=setup();
  for(const seat of [1,2,3]){const payload=tagPrivateMessage(record,member(seat));assert.doesNotThrow(()=>validateDiscordPayload(payload));const menus=rows(payload).flatMap(row=>row.components);assert.ok(!menus.some(component=>component.type===3&&component.custom_id.startsWith('tag:act:')),'inactive physical seat '+seat+' must not receive a playable-action menu');}
  const publicPayload=tagPublicMessage(record);assert.doesNotThrow(()=>validateDiscordPayload(publicPayload),'public Discord payload must be valid');
  const serialized=JSON.stringify({embeds:publicPayload.embeds.map(embed=>embed.toJSON()),components:rows(publicPayload)});
  assert.ok(!serialized.includes(POISON_OF_THE_OLD_MAN),'public panel must not reveal the Set Quick-Play Spell identity');
  assert.ok(!serialized.includes(poison.uid),'public panel must not reveal the Set Quick-Play Spell UID');
  assert.ok(serialized.includes('Carta oculta'),'public panel should show a hidden-card placeholder');
});
