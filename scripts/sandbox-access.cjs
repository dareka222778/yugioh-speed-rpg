/** Shared manual-sandbox access policy. Never loaded by the normal bot entrypoint. */
const snowflake=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
function parseSandboxGate(raw){
 if(raw===undefined)throw Error('The isolated Discord launcher requires an approved sandbox gate');
 let g;
 try{g=JSON.parse(raw);}catch{throw Error('Invalid isolated Discord sandbox gate JSON');}
 if(!g||typeof g!=='object'||!['manual-four','solo-ai','closed-beta'].includes(g.mode)||
  ![g.applicationId,g.guildId,g.channelId].every(snowflake)||
  !Array.isArray(g.consentingUserIds)||g.consentingUserIds.length===0||g.consentingUserIds.length>50||
  !g.consentingUserIds.every(snowflake)||new Set(g.consentingUserIds).size!==g.consentingUserIds.length||
  (g.mode==='solo-ai'&&g.consentingUserIds.length!==1)||
  (g.mode==='manual-four'&&g.consentingUserIds.length<4))throw Error('Invalid isolated Discord sandbox gate allowlist');
 return g;
}
function sandboxParticipantAllowed(gate,id){return gate.consentingUserIds.includes(id);}

/** Decision is taken before the real bot receives a Discord interaction. */
function sandboxInteractionDecision(gate,i){
 if(!i||!i.user||i.guildId!==gate.guildId||i.channelId!==gate.channelId||!sandboxParticipantAllowed(gate,i.user.id))return {allowed:false,reason:'origin'};
 if(!i.isChatInputCommand?.())return {allowed:true};
 let targetOptions=[];
 try{
  const sub=i.options?.getSubcommand?.(false);
  if(i.commandName==='duelo'&&sub==='desafiar')targetOptions=['oponente'];
  if(i.commandName==='dupla'&&sub==='convidar')targetOptions=['parceiro','oponente1','oponente2'];
  if(i.commandName==='evento'&&sub==='entregar')targetOptions=['jogador'];
  if(targetOptions.length&&gate.mode==='solo-ai')return {allowed:false,reason:'solo-ai'};
  if(targetOptions.some(name=>!sandboxParticipantAllowed(gate,i.options.getUser(name,true)?.id)))return {allowed:false,reason:'uninvited-target'};
 }catch{return {allowed:false,reason:'invalid-target'};}
 return {allowed:true};
}
module.exports={parseSandboxGate,sandboxParticipantAllowed,sandboxInteractionDecision};
