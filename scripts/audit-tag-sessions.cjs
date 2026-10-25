#!/usr/bin/env node
/** Exercises persisted four-member games through the exact component adapter. No Discord credentials/network. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const folder=fs.mkdtempSync(path.join(os.tmpdir(),'tag-session-audit-'));process.env.DATABASE_PATH=path.join(folder,'game.sqlite');
const {db,createPlayer}=require('../dist/database'),store=require('../dist/tagStore'),tag=require('../dist/tagDuel'),{chooseNPC}=require('../dist/duelStore'),{decisionPlayer}=require('../dist/duelEngine'),{handleTagComponent}=require('../dist/tagInteraction'),{validateDiscordPayload}=require('../dist/discordPayload'),ui=require('../dist/tagUI');
(async()=>{let decisions=0,reloads=0,publications=0;const reasons={};try{
 for(let game=0;game<100;game++){
  const ids=[0,1,2,3].map(n=>`audit-${game}-${n}`);ids.forEach(id=>createPlayer(id,id));let r=store.createTagLobby(ids,'audit-guild','audit-channel');for(const id of ids.slice(1))r=store.acceptTag(r.id,id,r.guild,r.revision);
  const initial=new Map(tag.tagInventory(r.state).map(c=>[c.uid,c.id]));let moves=0;
  while(r.status==='playing'){
   const owner=tag.tagDecisionMember(r.state).id,action=chooseNPC(r.state.core,r.state.core.players[decisionPlayer(r.state.core)].id);if(!action)throw Error('No legal action');const index=tag.tagActions(r.state,owner).findIndex(a=>JSON.stringify(a)===JSON.stringify(action));if(index<0)throw Error('Action not exposed');let ack=false;
   await handleTagComponent({guildId:r.guild,user:{id:owner},customId:`tag:act:${r.id}:${r.revision}:${owner}`,values:[String(index)],deferUpdate:async()=>{ack=true;},editReply:async p=>{if(!ack)throw Error('Missing acknowledgement');validateDiscordPayload(p);}},async next=>{validateDiscordPayload(ui.tagPublicMessage(next));publications++;},()=>{});
   r=store.getTag(r.id);reloads++;if(++moves>2000)throw Error('Decision budget');decisions++;
   const inventory=tag.tagInventory(r.state);if(inventory.length!==120||inventory.some(c=>initial.get(c.uid)!==c.id))throw Error('Card loss/duplication');
  }
  for(const id of ids)if(store.currentTag(id))throw Error('Seat lock leaked');reasons[r.state.core.reason]=(reasons[r.state.core.reason]??0)+1;
 }
 if(db.prepare('SELECT COUNT(*) AS n FROM player_cards').get().n||db.prepare('SELECT 1 FROM players WHERE dp<>1000 OR xp<>0').get())throw Error('Economy changed');
 const result={scope:'100 persisted 2v2 Normal-monster matches, four simulated human transports; no real Discord clients',completed:100,decisions,reloads,publications,physicalCardsPerGame:120,cardConservation:true,economyUnchanged:true,releasedSeats:400,reasons,humanDiscordAcceptance:'not certified'};fs.mkdirSync('validation',{recursive:true});fs.writeFileSync('validation/tag-session-audit.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{db.close();fs.rmSync(folder,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
