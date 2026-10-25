const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'discord-flow-'));process.env.DATABASE_PATH=path.join(dir,'game.sqlite');
const db=require('../dist/database'),decks=require('../dist/decks'),store=require('../dist/duelStore'),e=require('../dist/duelEngine'),ui=require('../dist/duelUI'),{handleDuelComponent}=require('../dist/duelInteraction'),{validateDiscordPayload:check}=require('../dist/discordPayload');
for(const id of ['101','102','103']){db.createPlayer(id,'Duelista '+id);db.chooseStarterDeck(id,'warrior');decks.openDeck(id);decks.activateDeck(id,1);}
function interaction(id,customId,values){const out=[];return {user:{id},customId,guildId:'guild',values,out,isButton:()=>!values,isStringSelectMenu:()=>!!values,deferUpdate:async()=>out.push({ack:'update'}),deferReply:async payload=>out.push({ack:'reply',...payload}),editReply:async payload=>{check(payload);out.push(payload);},reply:async payload=>{check(payload);out.push(payload);},followUp:async payload=>{check(payload);out.push(payload);}};}
const arena=[];const delivery={refreshArena:async r=>arena.push(check(ui.duelPublicMessage(r))),privatePayload:async(r,id,page)=>ui.duelPrivateMessage(r,id,page),cardPayload:async(r,id,index)=>ui.duelCardMessage(r,id,index),zonePayload:async(r,id,index)=>ui.duelZoneCardMessage(r,id,index)};
let r;
test('live component route accepts a PvP invitation, opens private hands, and never returns a rival hand',async()=>{
 r=store.challenge('101','102','guild','channel');const accept=interaction('102',`duel:accept:${r.id}:${r.revision}`);await handleDuelComponent(accept,delivery);r=store.getDuel(r.id);assert.equal(r.status,'playing');
 const open=interaction('101',`duel:open:${r.id}:${r.revision}`);await handleDuelComponent(open,delivery);assert.equal(open.out[0].ack,'reply');assert.ok(open.out[0].flags);assert.ok(open.out.at(-1).embeds[0].toJSON().fields.some(f=>f.name==='Sua mão'));
 const intruder=interaction('103',`duel:open:${r.id}:${r.revision}`);await assert.rejects(()=>handleDuelComponent(intruder,delivery),/participantes/);assert.equal(intruder.out.length,0);
 const wrong=interaction('101',`duel:open:${r.id}:${r.revision}`);wrong.guildId='another';await assert.rejects(()=>handleDuelComponent(wrong,delivery),/servidor/);
});
test('same production route inspects Hane-Hane/Sogen with one/two hand cards and navigates zones',async()=>{
 r=store.getDuel(r.id);r.state.players[0].hand=[{uid:'hane-ui',id:'07089711'},{uid:'sogen-ui',id:'86318356'}];r.state.players[0].field={uid:'field-ui',id:'86318356',faceUp:true,setTurn:0,resolved:true};db.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(r.state),r.id);
 for(const index of [0,1]){const i=interaction('101',`duel:card:${r.id}:${r.revision}:${index}`);await handleDuelComponent(i,delivery);assert.ok(i.out.at(-1).cardId);}
 const zones=interaction('101',`duel:zones:${r.id}:${r.revision}`);await handleDuelComponent(zones,delivery);const menu=zones.out.at(-1).components[0].toJSON().components[0];const field=menu.options.find(o=>o.label.startsWith('Campo'));assert.ok(field);
 const select=interaction('101',menu.custom_id,[field.value]);await handleDuelComponent(select,delivery);assert.equal(select.out.at(-1).cardId,'86318356');
});
test('component action commits once and rejects a repeated revision',async()=>{
 r=store.getDuel(r.id);const actor=r.state.players[e.decisionPlayer(r.state)].id,actions=e.legalActions(r.state,actor),ix=actions.findIndex(a=>a.kind==='summon'||a.kind==='end');assert.ok(ix>=0);const key=`duel:act:${r.id}:${r.revision}:1`;
 await handleDuelComponent(interaction(actor,key,[String(ix)]),delivery);const revision=store.getDuel(r.id).revision;await assert.rejects(()=>handleDuelComponent(interaction(actor,key,[String(ix)]),delivery),/antigo|mudou|atualiz/i);assert.equal(store.getDuel(r.id).revision,revision);
});
test('a failed private delivery after a committed move still refreshes the public arena; recovery does not replay the move',async()=>{
 r=store.getDuel(r.id);const actor=r.state.players[e.decisionPlayer(r.state)].id,ix=e.legalActions(r.state,actor).findIndex(a=>a.kind==='pass'||a.kind==='end');assert.ok(ix>=0);const i=interaction(actor,`duel:act:${r.id}:${r.revision}:1`,[String(ix)]);i.editReply=async()=>{throw Error('network unavailable');};let refreshed=0;
 await assert.rejects(()=>handleDuelComponent(i,{...delivery,refreshArena:async()=>{refreshed++;}}),/network/);assert.equal(refreshed,1);const saved=store.getDuel(r.id);assert.ok(saved.revision>r.revision);
 const recover=interaction(actor,`duel:open:${r.id}:${saved.revision}`);await handleDuelComponent(recover,delivery);assert.equal(store.getDuel(r.id).revision,saved.revision);
});
test('hand-limit decisions go through the Discord route and resume persisted draw before another action',async()=>{
 const prior=store.getDuel(r.id);store.performDuelAction(r.id,'101','guild',prior.revision,{kind:'concede'});r=store.challenge('101','102','guild','channel');r=store.acceptChallenge(r.id,'102','guild',r.revision);let s=r.state;s.current=0;s.phase='main';s.chain=[];s.pending={kind:'none'};s.players[1].hand=Array.from({length:7},(_,n)=>({uid:'seven-'+n,id:'91152256'}));s=e.step(s,'101',{kind:'end'});db.db.prepare('UPDATE duels SET state=? WHERE id=?').run(JSON.stringify(s),r.id);
 assert.equal(s.phase,'discard');const actor='102';await handleDuelComponent(interaction(actor,`duel:act:${r.id}:${r.revision}:1`,['0']),delivery);const next=store.getDuel(r.id);assert.equal(next.state.phase,'main');assert.equal(next.state.players[1].hand.length,7);
});
test('surrender closes controls; expired sessions reject further actions and remove all decision controls',async()=>{
 r=store.getDuel(r.id);await handleDuelComponent(interaction('101',`duel:confirm:${r.id}:${r.revision}`),delivery);const closed=interaction('102',`duel:act:${r.id}:${r.revision}:1`,['0']);await handleDuelComponent(closed,delivery);assert.equal(closed.out.at(-1).components.length,0);assert.equal(store.getDuel(r.id).status,'finished');
});
test('payload validation catches duplicates across rows and invalid menu limits, before a Discord API call',()=>{
 const button=id=>({type:2,style:1,label:'x',custom_id:id}),row=components=>({type:1,components});assert.throws(()=>check({components:[row([button('same')]),row([button('same')])]}),/identificador/);assert.throws(()=>check({content:'x'.repeat(2001)}),/limite/);assert.throws(()=>check({components:[row([{type:3,custom_id:'menu',options:[]}])]}),/Menu/);
});
after(()=>{db.db.close();fs.rmSync(dir,{recursive:true,force:true});});
