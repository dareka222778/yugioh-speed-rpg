const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const Module=require('node:module');const {EventEmitter}=require('node:events');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'discord-interactions-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
process.env.DISCORD_TOKEN='test-token';process.env.DISCORD_CLIENT_ID='123';
const discord=require('discord.js');let client;let registered;
let signal;const ready=new Promise(r=>{signal=r;});
class TestClient extends EventEmitter{constructor(){super();client=this;}async login(){this.loggedIn=true;signal();}}
class TestREST{setToken(){return this;}async put(route,payload){assert.equal(client.loggedIn,true,'login must not wait for command synchronization');registered=payload.body;}}
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='discord.js')return {...discord,Client:TestClient,REST:TestREST};
 if(name==='./cardArt'&&parent.filename.endsWith('/dist/index.js'))return {getCardArt:async()=>null};
 return original.apply(this,arguments);
};
require('../dist/index');Module._load=original;
const db=require('../dist/database');
function interaction(kind,commandName,extra={}){
 const calls=[];
 const i={type:kind==='autocomplete'?4:kind==='command'?2:3,commandName,user:{id:'101',username:'Kise',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'},
 isAutocomplete:()=>kind==='autocomplete',isChatInputCommand:()=>kind==='command',isButton:()=>kind==='button',isModalSubmit:()=>false,isStringSelectMenu:()=>false,
 options:{getFocused:()=> 'guardiao',getInteger:()=>null,getString:()=> '91152256'},
 async deferReply(p){calls.push(['defer',p]);i.deferred=true;},async editReply(p){calls.push(['edit',p]);},async reply(p){calls.push(['reply',p]);i.replied=true;},
 async respond(p){calls.push(['suggestions',p]);},async update(p){calls.push(['update',p]);},async deferUpdate(){calls.push(['deferUpdate']);i.deferred=true;},...extra};
 return {i,calls};
}
async function dispatch(i){await ready;await client.listeners(discord.Events.InteractionCreate)[0](i);}
test('registered collection command acknowledges and returns the real inventory',async()=>{
 await ready;await Promise.resolve();assert.ok(registered.some(c=>c.name==='colecao'));assert.ok(registered.some(c=>c.name==='carta'));
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
after(()=>{db.db.close();fs.rmSync(temp,{recursive:true,force:true});});
