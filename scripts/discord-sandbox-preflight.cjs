/** No network, credentials or application modules are accessed by preflight. */
const fs=require('node:fs'),path=require('node:path');
const snowflake=x=>typeof x==='string'&&/^\d{17,20}$/.test(x);
function preflight(configFile,authorizationFile){const config=JSON.parse(fs.readFileSync(configFile,'utf8')),a=JSON.parse(fs.readFileSync(authorizationFile,'utf8'));
 if(a.approved!==true||a.dedicatedTestApplication!==true)throw Error('Explicit dedicated sandbox authorization is missing');
 if(![a.applicationId,a.guildId,a.channelId].every(snowflake)||!Array.isArray(a.consentingUserIds)||new Set(a.consentingUserIds).size!==a.consentingUserIds.length||!a.consentingUserIds.every(snowflake))throw Error('Supply test application, guild, channel and distinct consenting user IDs');
 // Legacy four-player manual acceptance remains supported. Solo tests and invite-only
 // beta are separate, explicitly selected modes; a beta may begin with one tester.
 const mode=a.testMode??'manual-four';
 if(a.consentingUserIds.length>50)throw Error('Sandbox allowlist cannot exceed 50 users');
 if(mode==='manual-four'){
  if(a.consentingUserIds.length<4)throw Error('Manual four-player acceptance requires at least four consenting users');
 }else if(mode==='solo-ai'){
  if(a.aiOnly!==true||a.inviteOnly!==true||a.consentingUserIds.length!==1)throw Error('Solo AI sandbox requires one consenting owner and invite-only access');
 }else if(mode==='closed-beta'){
  if(a.inviteOnly!==true||!Number.isInteger(a.participantCap)||a.participantCap<20||a.participantCap>50||a.consentingUserIds.length<1||a.consentingUserIds.length>a.participantCap)throw Error('Closed beta requires 1–50 invited consenting users with a cap of 20–50');
 }else throw Error('Unknown sandbox test mode');
 if(!/^[a-f0-9]{40}$/.test(a.approvedCandidateSha))throw Error('Exact approved candidate SHA required');
 if(!Array.isArray(a.prohibitedApplicationIds)||!a.prohibitedApplicationIds.length||!a.prohibitedApplicationIds.every(snowflake)||!Array.isArray(a.prohibitedGuildIds)||!a.prohibitedGuildIds.length||!a.prohibitedGuildIds.every(snowflake))throw Error('Production application and guild deny-lists are required');
 if(a.prohibitedApplicationIds.includes(a.applicationId)||a.prohibitedGuildIds.includes(a.guildId))throw Error('Production target is forbidden');
 const root=fs.realpathSync(path.dirname(path.resolve(configFile))),database=path.join(root,'isolated.sqlite');
 if(config.kind!=='offline-discord-homologation-sandbox'||config.productionAllowed!==false||path.resolve(config.root)!==root||path.resolve(config.databasePath)!==database)throw Error('Sandbox database must remain inside its prepared root');
 for(const file of [database,database+'-wal',database+'-shm',path.join(root,'empty.env')])if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Sandbox symlink forbidden');
 if(fs.readFileSync(path.join(root,'empty.env'),'utf8')!=='# Prevent repository .env fallback in the manual sandbox launcher.\n')throw Error('Empty dotenv sentinel changed');
 return {root,databasePath:database,applicationId:a.applicationId,guildId:a.guildId,channelId:a.channelId,approvedCandidateSha:a.approvedCandidateSha,testMode:mode,participantCap:mode==='solo-ai'?1:mode==='closed-beta'?a.participantCap:null,consentingUserIds:[...a.consentingUserIds],eligibleForManualLogin:true,loginExecuted:false};
}
if(require.main===module){try{const [c,a]=process.argv.slice(2);if(!c||!a)throw Error('Use CONFIG AUTHORIZATION; no login is performed');console.log(JSON.stringify(preflight(c,a),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={preflight};
