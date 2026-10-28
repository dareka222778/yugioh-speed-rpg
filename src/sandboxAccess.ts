/** A sandbox-only interaction allowlist. A normal bot run has no sandbox gate. */
export type SandboxGate={
  mode:'manual-four'|'solo-ai'|'closed-beta';
  applicationId:string;
  guildId:string;
  channelId:string;
  consentingUserIds:string[];
};
type InteractionScope={user:{id:string};guildId:string|null;channelId:string|null};
const snowflake=(s:unknown):s is string=>typeof s==='string'&&/^\d{17,20}$/.test(s);

export function parseSandboxGate(raw:string|undefined):SandboxGate|null{
  if(raw===undefined)return null;
  let gate:unknown;
  try{gate=JSON.parse(raw);}catch{throw Error('Invalid isolated Discord sandbox gate JSON');}
  if(!gate||typeof gate!=='object')throw Error('Invalid isolated Discord sandbox gate');
  const g=gate as Record<string,unknown>;
  if(!['manual-four','solo-ai','closed-beta'].includes(String(g.mode))||
     ![g.applicationId,g.guildId,g.channelId].every(snowflake)||
     !Array.isArray(g.consentingUserIds)||g.consentingUserIds.length===0||
     g.consentingUserIds.length>50||!g.consentingUserIds.every(snowflake)||
     new Set(g.consentingUserIds).size!==g.consentingUserIds.length||
     (g.mode==='solo-ai'&&g.consentingUserIds.length!==1)||
     (g.mode==='manual-four'&&g.consentingUserIds.length<4)){
    throw Error('Invalid isolated Discord sandbox gate allowlist');
  }
  return g as SandboxGate;
}

export function sandboxInteractionAllowed(gate:SandboxGate|null,i:InteractionScope):boolean{
  if(!gate)return true;
  return i.guildId===gate.guildId&&i.channelId===gate.channelId&&sandboxParticipantAllowed(gate,i.user.id);
}

/** Prevent even an approved user from targeting uninvited people inside an isolated beta. */
export function sandboxParticipantAllowed(gate:SandboxGate|null,userId:string):boolean{
 return !gate||gate.consentingUserIds.includes(userId);
}
