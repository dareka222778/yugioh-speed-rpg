/** Isolated launcher preloader: guards the existing bot without modifying historical sources. */
const {parseSandboxGate,sandboxInteractionDecision}=require('./sandbox-access.cjs');
function installSandboxInteractionGuard(raw=process.env.SPEED_RPG_SANDBOX_GATE){
 const gate=parseSandboxGate(raw);
 if(process.env.DISCORD_CLIENT_ID!==gate.applicationId||process.env.DISCORD_GUILD_ID!==gate.guildId)throw Error('Sandbox gate differs from test application or guild');
 const {Client,Events,MessageFlags}=require('discord.js');
 const originalEmit=Client.prototype.emit;
 if(typeof originalEmit!=='function')throw Error('Discord client event dispatcher missing');
 Client.prototype.emit=function(event,...args){
  if(event===Events.InteractionCreate){
   const i=args[0],decision=sandboxInteractionDecision(gate,i);
   if(!decision.allowed){
    // Discord must receive a timely, private acknowledgement even when denied.
    try{
     const response=i?.isAutocomplete?.()?i.respond([]):i?.isRepliable?.()?i.reply({content:'Este bot de testes está disponível apenas aos participantes e ao canal autorizados.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}}):null;
     Promise.resolve(response).catch(()=>console.warn('Sandbox: não foi possível confirmar uma interação negada.'));
    }catch{console.warn('Sandbox: não foi possível negar uma interação recebida.');}
    return false;
   }
  }
  return originalEmit.call(this,event,...args);
 };
 return {mode:gate.mode,allowedUsers:gate.consentingUserIds.length};
}
if(process.env.SPEED_RPG_SANDBOX_GATE)installSandboxInteractionGuard();
module.exports={installSandboxInteractionGuard};
