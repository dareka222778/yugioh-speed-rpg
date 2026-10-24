const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const Module=require('node:module');const {EventEmitter}=require('node:events');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'discord-interactions-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
process.env.DISCORD_TOKEN='test-token';process.env.DISCORD_CLIENT_ID='123';
const discord=require('discord.js');let client;let registered;
let signal;const ready=new Promise(r=>{signal=r;});let registrationSignal;const registrationReady=new Promise(r=>{registrationSignal=r;});let registrationAttempts=0;
const publicUpdates=[];let loginAttempts=0;const clientInstances=[];
class TestClient extends EventEmitter{constructor(){super();client=this;clientInstances.push(this);this.channels={fetch:async()=>({messages:{fetch:async()=>({edit:async payload=>publicUpdates.push(payload)})}})};}async login(){if(++loginAttempts===1)throw Object.assign(new Error('DNS test'),{code:'ENOTFOUND'});this.loggedIn=true;signal();}}
class TestREST{setToken(){return this;}async put(route,payload){assert.equal(client.loggedIn,true,'login must not wait for command synchronization');if(++registrationAttempts===1)throw Object.assign(new Error('REST DNS test'),{code:'EAI_AGAIN'});registered=payload.body;registrationSignal();}}
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='discord.js')return {...discord,Client:TestClient,REST:TestREST};
 if(name==='./duelUI'&&parent.filename.endsWith('/dist/index.js')){const ui=original.apply(this,arguments);return {...ui,visualDuelPublic:async(...args)=>ui.duelPublicMessage(...args),visualDuelPrivate:async(...args)=>ui.duelPrivateMessage(...args)};}
 if(name==='./deckUI'&&parent.filename.endsWith('/dist/index.js')){const ui=original.apply(this,arguments);return {...ui,visualDeckMessage:async(...args)=>ui.deckMessage(...args)};}
 if(name==='./npcUI'&&parent.filename.endsWith('/dist/index.js')){const ui=original.apply(this,arguments);return {...ui,visualNPCLobby:async(...args)=>ui.npcLobby(...args)};}
 if(name==='./networkRetry'&&parent.filename.endsWith('/dist/index.js')){const network=original.apply(this,arguments);return {...network,retryNetwork:(work,label)=>network.retryNetwork(work,label,{sleep:async()=>{},log:()=>{}})};}
 if(name==='./cardArt'&&parent.filename.endsWith('/dist/index.js'))return {getCardArt:async()=>null};
 return original.apply(this,arguments);
};
require('../dist/index');Module._load=original;
const db=require('../dist/database');
function interaction(kind,commandName,extra={}){
 const calls=[];
 const i={type:kind==='autocomplete'?4:kind==='command'?2:3,commandName,guildId:'g',channelId:'c',user:{id:'101',username:'Kise',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'},
 isAutocomplete:()=>kind==='autocomplete',isChatInputCommand:()=>kind==='command',isButton:()=>kind==='button',isModalSubmit:()=>false,isStringSelectMenu:()=>false,
 options:{getFocused:()=> 'guardiao',getInteger:()=>null,getString:()=> '91152256'},
 async deferReply(p){calls.push(['defer',p]);i.deferred=true;},async editReply(p){calls.push(['edit',p]);return {id:'public-message',channelId:'c'};},async followUp(p){calls.push(['followUp',p]);},async reply(p){calls.push(['reply',p]);i.replied=true;},
 async respond(p){calls.push(['suggestions',p]);},async update(p){calls.push(['update',p]);},async deferUpdate(){calls.push(['deferUpdate']);i.deferred=true;},...extra};
 return {i,calls};
}
async function dispatch(i){await ready;await client.listeners(discord.Events.InteractionCreate)[0](i);}
test('registered collection command acknowledges and returns the real inventory',async()=>{
 await ready;await registrationReady;assert.equal(registrationAttempts,2);assert.equal(loginAttempts,2);assert.equal(clientInstances.length,2);assert.notStrictEqual(clientInstances[0],clientInstances[1]);assert.ok(registered.some(c=>c.name==='colecao'));assert.ok(registered.some(c=>c.name==='carta'));
 db.createPlayer('101','Kise');db.chooseStarterDeck('101','spellcaster');
 const {i,calls}=interaction('command','colecao');await dispatch(i);
 assert.deepEqual(calls.map(c=>c[0]),['defer','edit']);
 assert.match(calls[1][1].embeds[0].toJSON().description,/20 cartas/);
});
test('autocomplete and card command run through the actual event listener',async()=>{
 const a=interaction('autocomplete','carta');await dispatch(a.i);
 assert.equal(a.calls[0][0],'suggestions');assert.ok(a.calls[0][1].some(c=>c.value==='91152256'));
 const c=interaction('command','carta');await dispatch(c.i);
 assert.deepEqual(c.calls.map(x=>x[0]),['defer','edit']);assert.equal(c.calls[1][1].embeds[0].toJSON().title,'Guardião Celta');
});
test('profile collection button opens the collection through the actual event listener',async()=>{
 const b=interaction('button',undefined,{customId:'collection:page:101:1'});await dispatch(b.i);
 assert.equal(b.calls[0][0],'update');assert.match(b.calls[0][1].embeds[0].toJSON().description,/20 cartas/);
});
test('deck command and private controls edit real inventory-backed drafts, block strangers and stale panels',async()=>{
 const options={getSubcommand:()=> 'ver',getInteger:()=>null};
 const d=interaction('command','deck',{options});await dispatch(d.i);assert.deepEqual(d.calls.map(c=>c[0]),['defer','edit']);
 const payload=d.calls[1][1];assert.match(payload.embeds[0].toJSON().description,/20\/30/);
 const minus=payload.components[2].toJSON().components[0].custom_id;
 const outsider=interaction('button',undefined,{customId:minus,user:{id:'999',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'}});await dispatch(outsider.i);assert.equal(outsider.calls[0][0],'reply');assert.match(outsider.calls[0][1].content,/próprio/);
 const edit=interaction('button',undefined,{customId:minus});await dispatch(edit.i);assert.deepEqual(edit.calls.map(c=>c[0]),['deferUpdate','edit']);assert.match(edit.calls[1][1].embeds[0].toJSON().description,/19\/30/);
 const stale=interaction('button',undefined,{customId:minus});await dispatch(stale.i);assert.match(stale.calls.at(-1)[1].content,/antigo/);
 assert.equal(db.getCollection('101').reduce((s,c)=>s+c.quantity,0),20);
});
test('duel listener creates training, keeps hands private, rejects strangers and stale clicks, and confirms surrender',async()=>{
 const decks=require('../dist/decks'),store=require('../dist/duelStore'),engine=require('../dist/duelEngine');
 const user={id:'104',username:'Teste',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 db.createPlayer('104','Treino');db.chooseStarterDeck('104','warrior');decks.openDeck('104');decks.activateDeck('104',1);
 const train=interaction('command','duelo',{user,options:{getSubcommand:()=> 'treino'}});await dispatch(train.i);assert.deepEqual(train.calls.map(x=>x[0]),['defer','edit']);assert.equal(train.calls[0][1].flags,undefined);
 let r=store.currentDuel('104');assert.ok(r);assert.ok(train.calls[1][1].components[0].toJSON().components[0].custom_id.includes('duel:open:'));
 const privatePanel=interaction('button',undefined,{user,customId:`duel:open:${r.id}:${r.revision}`});await dispatch(privatePanel.i);assert.equal(privatePanel.calls[0][1].flags,64);assert.ok(privatePanel.calls[1][1].embeds[0].toJSON().fields.some(f=>f.name==='Sua mão'));
 const stranger=interaction('button',undefined,{customId:`duel:open:${r.id}:${r.revision}`});await dispatch(stranger.i);assert.equal(stranger.calls[0][0],'reply');assert.match(stranger.calls[0][1].content,/participantes/);
 const action=interaction('button',undefined,{user,customId:`duel:act:${r.id}:${r.revision}:1`,isButton:()=>false,isStringSelectMenu:()=>true,values:['0']});await dispatch(action.i);assert.equal(action.calls[0][0],'deferUpdate');assert.equal(store.getDuel(r.id).revision,r.revision+1);assert.ok(publicUpdates.length);
 const stale=interaction('button',undefined,{user,customId:`duel:act:${r.id}:${r.revision}:1`,isButton:()=>false,isStringSelectMenu:()=>true,values:['0']});await dispatch(stale.i);assert.equal(stale.calls.at(-1)[0],'followUp');assert.match(stale.calls.at(-1)[1].content,/antigo/);
 r=store.getDuel(r.id);const quit=interaction('button',undefined,{user,customId:`duel:quit:${r.id}:${r.revision}`});await dispatch(quit.i);assert.match(quit.calls[0][1].content,/Confirma/);assert.equal(store.getDuel(r.id).status,'playing');
 const confirm=interaction('button',undefined,{user,customId:`duel:confirm:${r.id}:${r.revision}`});await dispatch(confirm.i);assert.equal(store.getDuel(r.id).status,'finished');
});
test('laboratory slash command creates a six-effect trial duel without awarding inventory',async()=>{
 await registrationReady;
 const duel=registered.find(c=>c.name==='duelo');
 assert.ok(duel.options.some(o=>o.name==='laboratorio'));
 const user={id:'109',username:'Laboratório',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 db.createPlayer('109','Laboratório');
 const before=db.getCollection('109');
 const command=interaction('command','duelo',{user,options:{getSubcommand:()=> 'laboratorio'}});
 await dispatch(command.i);
 assert.deepEqual(command.calls.map(x=>x[0]),['defer','edit']);
 const record=require('../dist/duelStore').currentDuel('109');
 assert.ok(record);assert.ok(record.state.fixedOpening);
 const ids=new Set([...record.state.players[0].hand,...record.state.players[0].deck].map(c=>c.id));
 for(const id of ['54652250','07089711','31560081','28933734','60694662','11384280'])assert.ok(ids.has(id),`Missing test card ${id}`);
 assert.deepEqual(db.getCollection('109'),before);
});
test('duel invitation is accepted only by its intended opponent without overwriting the public invitation on error',async()=>{
 const decks=require('../dist/decks'),store=require('../dist/duelStore');for(const id of ['105','106']){db.createPlayer(id,'PvP '+id);db.chooseStarterDeck(id,'dragon');decks.openDeck(id);decks.activateDeck(id,1);}
 const user=id=>({id,username:'PvP',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'});
 const invite=interaction('command','duelo',{user:user('105'),options:{getSubcommand:()=> 'desafiar',getUser:()=>({id:'106',bot:false})}});await dispatch(invite.i);const r=store.currentDuel('105');assert.equal(r.status,'pending');const count=publicUpdates.length;
 const wrong=interaction('button',undefined,{user:user('104'),customId:`duel:accept:${r.id}:${r.revision}`});await dispatch(wrong.i);assert.equal(wrong.calls.at(-1)[0],'followUp');assert.equal(publicUpdates.length,count);assert.equal(store.getDuel(r.id).status,'pending');
 const accept=interaction('button',undefined,{user:user('106'),customId:`duel:accept:${r.id}:${r.revision}`});await dispatch(accept.i);assert.equal(store.getDuel(r.id).status,'playing');assert.equal(accept.calls.at(-1)[0],'followUp');
});
test('automatic timeout sweep announces W.O. without a player click and stale private controls become terminal',async()=>{
 const decks=require('../dist/decks'),store=require('../dist/duelStore');db.createPlayer('107','Relógio');db.chooseStarterDeck('107','warrior');decks.openDeck('107');decks.activateDeck('107',1);
 const r=store.createTraining('107','g','c');store.setDuelMessage(r.id,'c','timeout-arena');const originalUpdated=r.updated;assert.equal(store.getDuel(r.id).updated,originalUpdated);
 db.db.prepare('UPDATE duels SET updated=0 WHERE id=?').run(r.id);assert.equal(store.getDuel(r.id).status,'finished');const count=publicUpdates.length;await require('../dist/index').sweepDuelTimeouts();const ended=store.getDuel(r.id);assert.equal(ended.status,'finished');assert.match(ended.state.reason,/W.O./);assert.ok(publicUpdates.length>count);assert.equal(publicUpdates.at(-1).components.length,0);
 const user={id:'107',username:'Relógio',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};const old=interaction('button',undefined,{user,customId:`duel:act:${r.id}:${r.revision}:1`,isButton:()=>false,isStringSelectMenu:()=>true,values:['0']});await dispatch(old.i);assert.equal(old.calls[0][0],'deferUpdate');assert.equal(old.calls[1][1].components.length,0);assert.equal(store.getDuel(r.id).revision,ended.revision);
});
test('quick action buttons execute through the real listener and reject repeat clicks',async()=>{
 const store=require('../dist/duelStore');db.createPlayer('108','Atalho');const r=store.createTraining('108','g','c',true);assert.equal(r.state.fixedOpening,true);
 const ui=require('../dist/duelUI');const button=ui.duelPrivateMessage(r,'108').components.flatMap(row=>row.toJSON().components).find(c=>c.custom_id?.startsWith('duel:quick:'));
 assert.ok(button);const user={id:'108',username:'Atalho',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};const click=interaction('button',undefined,{user,customId:button.custom_id});await dispatch(click.i);assert.equal(click.calls[0][0],'deferUpdate');assert.equal(store.getDuel(r.id).revision,r.revision+1);
 const repeat=interaction('button',undefined,{user,customId:button.custom_id});await dispatch(repeat.i);assert.match(repeat.calls.at(-1)[1].content,/antigo/);
});
test('NPC slash command and owner-bound buttons start real challenges, preserve inventory and block double starts',async()=>{
 assert.ok(registered.some(c=>c.name==='npc'));const deck=require('../dist/decks'),store=require('../dist/duelStore');db.createPlayer('109','Lendário');db.chooseStarterDeck('109','warrior');deck.openDeck('109');deck.activateDeck('109',1);const inventory=db.getCollection('109');const user={id:'109',username:'Lendário',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 const lobby=interaction('command','npc',{user,options:{getSubcommand:()=> 'ver'}});await dispatch(lobby.i);assert.equal(lobby.calls[0][1].flags,64);const button=lobby.calls[1][1].components[0].toJSON().components[1].custom_id;
 const stranger=interaction('button',undefined,{customId:button});await dispatch(stranger.i);assert.match(stranger.calls.at(-1)[1].content,/próprios/);
 const start=interaction('button',undefined,{user,customId:button});await dispatch(start.i);assert.equal(start.calls[0][0],'defer');let r=store.currentDuel('109');assert.equal(r.state.encounter.npcId,'joey');assert.deepEqual(db.getCollection('109'),inventory);
 const duplicate=interaction('button',undefined,{user,customId:button});await dispatch(duplicate.i);assert.equal(duplicate.calls.at(-1)[0],'reply');assert.match(duplicate.calls.at(-1)[1].content,/já tem/);store.performDuelAction(r.id,'109','g',r.revision,{kind:'concede'});
 const daily=interaction('command','npc',{user,options:{getSubcommand:()=> 'diario'}});await dispatch(daily.i);r=store.currentDuel('109');assert.ok(r.state.encounter.eventDay);store.performDuelAction(r.id,'109','g',r.revision,{kind:'concede'});
});
test('NPC gallery buttons and card selection use the real handler, acknowledge first, and preserve the current duel',async()=>{
 const user={id:'109',username:'Lendário',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 const next=interaction('button',undefined,{user,customId:'npc:gallery:109:yugi:hero:0'});await dispatch(next.i);assert.deepEqual(next.calls.map(c=>c[0]),['deferUpdate','edit']);assert.match(next.calls[1][1].embeds[0].toJSON().title,/Yugi/);
 const deck=interaction('button',undefined,{user,customId:'npc:gallery:109:joey:deck:2'});await dispatch(deck.i);const menu=deck.calls[1][1].components[1].toJSON().components[0];assert.equal(menu.options[2].value,'22');
 const select=interaction('select',undefined,{user,customId:menu.custom_id,isStringSelectMenu:()=>true,values:['22']});await dispatch(select.i);assert.deepEqual(select.calls.map(c=>c[0]),['deferUpdate','edit']);assert.match(select.calls[1][1].embeds[0].toJSON().fields[0].name,/23\/50/);
 const stranger=interaction('button',undefined,{customId:'npc:gallery:109:kaiba:hero:0'});await dispatch(stranger.i);assert.equal(stranger.calls[0][0],'reply');assert.match(stranger.calls[0][1].content,/próprios/);
 const invalid=interaction('button',undefined,{user,customId:'npc:gallery:109:yugi:card:50'});await dispatch(invalid.i);assert.equal(invalid.calls[0][0],'deferUpdate');assert.equal(invalid.calls.at(-1)[0],'followUp');assert.match(invalid.calls.at(-1)[1].content,/inexistente/);
});
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
