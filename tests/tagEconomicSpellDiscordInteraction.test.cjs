'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'m160-tag-discord-'));
process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
const database=require('../dist/database');
const store=require('../dist/tagStore');
const tag=require('../dist/tagDuel');
const {handleTagComponent}=require('../dist/tagInteraction');
const {tagPrivateMessage,tagPublicMessage}=require('../dist/tagUI');
const {validateDiscordPayload}=require('../dist/discordPayload');
const {getPlayableCard}=require('../dist/effectRegistry');
const RED_MEDICINE='38199696',MOOYAN_CURRY='58074572',POISON='08842266';
const normal=[...new Set(tag.tagNormalCardIds)].map(id=>({id,card:getPlayableCard(id)})).filter(x=>x.card&&x.card.kind==='monster'&&Number.isInteger(x.card.atk)&&Number.isInteger(x.card.defense));
assert.ok(normal.length>=7);
const normalIds=normal.slice(0,7).map(x=>x.id);
function member(seat){return 'm160-seat-'+seat;}
function deck(required=[]){const ids=[...new Set([...required,...normalIds])];assert.ok(ids.length>=7);return Array.from({length:20},(_,i)=>ids[i%ids.length]);}
function holder(state,seat){const team=seat%2;return state.active[team]===seat?state.core.players[team]:state.reserves[seat];}
function ensureInHand(state,seat,id){const p=holder(state,seat),held=p.hand.find(c=>c.id===id);if(held)return held;const index=p.deck.findIndex(c=>c.id===id);assert.ok(index>=0,'physical seat '+seat+' Deck must contain '+id);const [card]=p.deck.splice(index,1);p.hand.push(card);return card;}
function takeCard(state,seat,id){const p=holder(state,seat);for(const zone of ['hand','deck']){const index=p[zone].findIndex(c=>c.id===id);if(index>=0)return p[zone].splice(index,1)[0];}throw Error('M160 missing physical card '+id+' from seat '+seat);}
function setup(){
 const ids=[0,1,2,3].map(member);for(const id of ids)database.createPlayer(id,id);
 let lobby=store.createTagLobby(ids,'m160-guild','m160-channel','classic-loan');for(const id of ids.slice(1))lobby=store.acceptTag(lobby.id,id,'m160-guild',lobby.revision);
 const players=ids.map((id,seat)=>({id,name:'M160 Seat '+seat,cards:deck(seat===0?[RED_MEDICINE,MOOYAN_CURRY]:seat===2?[POISON]:[])}));
 const state=tag.createTagDuel(players,{classic:true,first:0,seed:'m160-economic-spell-interaction'});
 const red=ensureInHand(state,0,RED_MEDICINE),mooyan=ensureInHand(state,0,MOOYAN_CURRY),poisonCard=takeCard(state,2,POISON);
 const poison={...poisonCard,setTurn:0,faceUp:false};state.core.players[0].backrow.push(poison);state.core.turn=3;
 assert.match(red.uid,/^m0:/);assert.match(mooyan.uid,/^m0:/);assert.match(poison.uid,/^m2:/);
 assert.doesNotThrow(()=>tag.assertTagDuel(state));
 const revision=7,updated=Date.now();database.db.prepare('UPDATE tag_sessions SET state=?,revision=?,updated=?,status=?,rules=? WHERE id=?').run(JSON.stringify(state),revision,updated,'playing','classic-loan',lobby.id);
 const record=store.getTag(lobby.id);assert.equal(record.revision,revision);assert.equal(record.state.core.phase,'main');
 return {record,red,mooyan,poison,state};
}
function interaction(id,customId,actor,index,expectedRevision){
 const calls=[];return {id,guildId:'m160-guild',user:{id:actor},customId,values:[String(index)],isButton:()=>false,isStringSelectMenu:()=>true,
  deferUpdate:async()=>{assert.equal(store.getTag(id).revision,expectedRevision,'Discord acknowledgement must precede state mutation');calls.push('defer');},
  editReply:async payload=>{calls.push('edit');validateDiscordPayload(payload);},calls};
}
test('Discord action handler commits one selected 2v2 Spell choice and makes duplicate interactions idempotent',async()=>{
 const {record,mooyan,poison}=setup(),actor=member(0),actions=tag.tagActions(record.state,actor);
 const selected=actions.findIndex(action=>action.kind==='spell'&&action.card===mooyan.uid&&action.target==='__choice_1__');
 assert.ok(selected>=0,'the Discord action list must include Mooyan Curry opponent-team choice');
 const originalRevision=record.revision,requestId='m160-discord-request-1';let refreshes=0;
 async function refresh(next){refreshes++;validateDiscordPayload(tagPublicMessage(next));}
 async function submit(){const before=store.getTag(record.id).revision;const i=interaction(requestId,'tag:act:'+record.id+':'+originalRevision+':'+actor,actor,selected,before);await handleTagComponent(i,refresh,()=>{});assert.deepEqual(i.calls,['defer','edit']);const after=store.getTag(record.id).revision;assert.equal(after,before===originalRevision?originalRevision+1:originalRevision,'one Discord delivery may commit at most one revision');}
 await submit();
 let current=store.getTag(record.id);assert.equal(current.revision,originalRevision+1);assert.deepEqual(current.state.core.players.map(p=>p.lp),[4000,4200]);
 assert.ok(current.state.core.players[0].grave.some(card=>card.uid===mooyan.uid),'resolved Spell must retain its physical UID in the shared Graveyard');
 assert.ok(current.state.core.players[0].backrow.some(card=>card.uid===poison.uid&&!card.faceUp),'partner Set Quick-Play Spell must remain hidden and unchanged');
 assert.doesNotThrow(()=>tag.assertTagDuel(current.state));
 const receipt=database.db.prepare('SELECT request_id,committed_revision FROM tag_action_receipts WHERE request_id=?').get(requestId);
 assert.deepEqual(receipt,{request_id:requestId,committed_revision:originalRevision+1});
 await submit();
 current=store.getTag(record.id);assert.equal(current.revision,originalRevision+1,'duplicate Discord delivery must not commit a second revision');
 assert.deepEqual(current.state.core.players.map(p=>p.lp),[4000,4200],'duplicate delivery must not apply the 200 LP choice twice');
 assert.equal(database.db.prepare('SELECT COUNT(*) AS n FROM tag_action_receipts WHERE request_id=?').get(requestId).n,1);
 assert.ok(refreshes>=2,'the public board must refresh after both original and duplicate deliveries');
});
after(()=>{database.db.close();fs.rmSync(dir,{recursive:true,force:true});});
