const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('../scripts/prepare-discord-sandbox.cjs');
const {preflight}=require('../scripts/discord-sandbox-preflight.cjs');
const {launch}=require('../scripts/start-discord-sandbox.cjs');
const {parseSandboxGate,sandboxInteractionDecision,sandboxParticipantAllowed}=require('../scripts/sandbox-access.cjs');

const parent=fs.mkdtempSync(path.join(os.tmpdir(),'test-sandbox-access-'));
const config=prepare(parent);
const configFile=path.join(config.root,'sandbox.json');
const authFile=path.join(config.root,'authorization.example.json');
const owner='44444444444444444',second='55555555555555555';
const base={approved:true,dedicatedTestApplication:true,testMode:'solo-ai',aiOnly:true,inviteOnly:true,
 applicationId:'11111111111111111',guildId:'22222222222222222',channelId:'33333333333333333',
 consentingUserIds:[owner],prohibitedApplicationIds:['88888888888888888'],
 prohibitedGuildIds:['99999999999999999'],approvedCandidateSha:'a'.repeat(40)};
const pre=x=>{fs.writeFileSync(authFile,JSON.stringify(x));return preflight(configFile,authFile);};
const gateFrom=r=>parseSandboxGate(JSON.stringify({mode:r.testMode,applicationId:r.applicationId,guildId:r.guildId,channelId:r.channelId,consentingUserIds:r.consentingUserIds}));
const scope=(id=owner,guildId=base.guildId,channelId=base.channelId)=>({user:{id},guildId,channelId});
const command=(name,sub,ids)=>({...scope(),commandName:name,isChatInputCommand:()=>true,
 options:{getSubcommand:()=>sub,getUser:k=>ids[k]?{id:ids[k]}:null}});

test('solo AI sandbox accepts a single consenting owner without requiring four users',()=>{
 const result=pre(base);
 assert.equal(result.testMode,'solo-ai');assert.equal(result.participantCap,1);
 assert.deepEqual(result.consentingUserIds,[owner]);
 assert.equal(launch(configFile,authFile).loginExecuted,false);
 assert.equal(fs.existsSync(config.databasePath),false);
});
test('solo AI preflight refuses absent approval, absent owner, extra humans and not-AI mode',()=>{
 for(const x of [
  {...base,approved:false},
  {...base,consentingUserIds:[]},
  {...base,consentingUserIds:[owner,second]},
  {...base,aiOnly:false},
  {...base,inviteOnly:false},
  {...base,applicationId:base.prohibitedApplicationIds[0]},
  {...base,approvedCandidateSha:''}
 ])assert.throws(()=>pre(x));
});
test('closed beta is invite-only and can start with one tester before 20–50 slots are filled',()=>{
 const beta={...base,testMode:'closed-beta',aiOnly:false,participantCap:40};
 const r=pre(beta);
 assert.equal(r.testMode,'closed-beta');assert.equal(r.participantCap,40);
 assert.equal(gateFrom(r).consentingUserIds.length,1);
 assert.equal(sandboxInteractionDecision(gateFrom(r),scope()).allowed,true);
 assert.equal(sandboxInteractionDecision(gateFrom(r),scope(second)).allowed,false);
 const full=Array.from({length:40},(_,i)=>String(10000000000000000n+BigInt(i)));
 assert.equal(pre({...beta,consentingUserIds:full}).consentingUserIds.length,40);
 for(const x of [
  {...beta,participantCap:19}, {...beta,participantCap:51},
  {...beta,consentingUserIds:[]}, {...beta,inviteOnly:false},
  {...beta,consentingUserIds:[owner,owner]},
  {...beta,participantCap:20,consentingUserIds:full}
 ])assert.throws(()=>pre(x));
});
test('sandbox runtime gate forbids unlisted user, different guild, channel and DM before command dispatch',()=>{
 const g=gateFrom(pre(base));
 assert.equal(sandboxInteractionDecision(g,scope()).allowed,true);
 assert.equal(sandboxInteractionDecision(g,scope(second)).allowed,false);
 assert.equal(sandboxInteractionDecision(g,scope(owner,base.prohibitedGuildIds[0])).allowed,false);
 assert.equal(sandboxInteractionDecision(g,scope(owner,base.guildId,'55555555555555555')).allowed,false);
 assert.equal(sandboxInteractionDecision(g,scope(owner,null,null)).allowed,false);
 assert.equal(sandboxParticipantAllowed(g,owner),true);
 assert.equal(sandboxParticipantAllowed(g,second),false);
});
test('solo AI refuses human challenges; closed beta allows only consenting targets',()=>{
 const solo=gateFrom(pre(base));
 const duel=command('duelo','desafiar',{oponente:second});
 const team=command('dupla','convidar',{parceiro:second,oponente1:owner,oponente2:second});
 const event=command('evento','entregar',{jogador:second});
 for(const c of [duel,team,event])assert.equal(sandboxInteractionDecision(solo,c).allowed,false);
 const beta=gateFrom(pre({...base,testMode:'closed-beta',aiOnly:false,participantCap:20,consentingUserIds:[owner,second]}));
 for(const c of [duel,team,event])assert.equal(sandboxInteractionDecision(beta,c).allowed,true);
 assert.equal(sandboxInteractionDecision(gateFrom(pre({...base,testMode:'closed-beta',aiOnly:false,participantCap:20,consentingUserIds:[owner]})),duel).allowed,false);
});
test('manual sandbox preloader rejects interactions before app event handler sees them',async()=>{
 const {installSandboxInteractionGuard}=require('../scripts/sandbox-interaction-preload.cjs');
 const {Client,Events,MessageFlags}=require('discord.js');
 process.env.DISCORD_CLIENT_ID=base.applicationId;
 process.env.DISCORD_GUILD_ID=base.guildId;
 installSandboxInteractionGuard(JSON.stringify(gateFrom(pre(base))));
 const client=Object.create(Client.prototype);
 let dispatched=0,denied=null,autocomplete=null;
 client.on(Events.InteractionCreate,()=>dispatched++);
 const scopeMethods={isAutocomplete:()=>false,isRepliable:()=>true,reply:async payload=>{denied=payload;}};
 client.emit(Events.InteractionCreate,{...scope(),...scopeMethods});
 client.emit(Events.InteractionCreate,{...scope(second),...scopeMethods});
 assert.equal(dispatched,1);assert.equal(denied.flags,MessageFlags.Ephemeral);
 client.emit(Events.InteractionCreate,{...scope(second),isAutocomplete:()=>true,respond:async a=>{autocomplete=a;}});
 assert.equal(dispatched,1);assert.deepEqual(autocomplete,[]);
});
test('sandbox runtime gate fails closed for corrupted, duplicate and exaggerated allowlists',()=>{
 const good={mode:'solo-ai',applicationId:base.applicationId,guildId:base.guildId,channelId:base.channelId,consentingUserIds:[owner]};
 assert.throws(()=>parseSandboxGate(undefined));
 for(const x of ['{',JSON.stringify({}),JSON.stringify({...good,consentingUserIds:[owner,second]}),JSON.stringify({...good,consentingUserIds:[owner,owner]}),JSON.stringify({...good,mode:'unknown'}),JSON.stringify({...good,guildId:'n/a'})])assert.throws(()=>parseSandboxGate(x));
});
test('four-player legacy sandbox retains four-user minimum',()=>{
 const legacy={...base,testMode:'manual-four',consentingUserIds:[owner,second,'66666666666666666','77777777777777777']};
 assert.equal(pre(legacy).testMode,'manual-four');
 assert.throws(()=>pre({...legacy,consentingUserIds:legacy.consentingUserIds.slice(0,3)}));
});
after(()=>fs.rmSync(parent,{recursive:true,force:true}));
