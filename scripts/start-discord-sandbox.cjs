/** Manual authorized entry point only. Never called by CI or sandbox preparation. */
const path=require('node:path'),{spawnSync}=require('node:child_process'),{preflight}=require('./discord-sandbox-preflight.cjs'),{verifyBuild}=require('./verify-candidate-build.cjs');
function launch(config,authorization,run=false){const result=preflight(config,authorization);if(!run)return result;
 // Authorization is checked before inspecting credentials. Never print them.
 if(process.env.DISCORD_CLIENT_ID!==result.applicationId||process.env.DISCORD_GUILD_ID!==result.guildId||!process.env.DISCORD_TOKEN)throw Error('Explicit test credentials must match authorized application and guild');
 const root=path.resolve(__dirname,'..'),revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});if(revision.status!==0||revision.stdout.trim()!==result.approvedCandidateSha)throw Error('Checkout differs from approved SHA');
 const changes=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'});if(changes.status!==0||changes.stdout.trim())throw Error('Clean audited checkout required');
 verifyBuild(root,result.approvedCandidateSha);
 // The bot enforces the approved user/channel allowlist on every interaction.
 // Never inherit an arbitrary parent allowlist into the isolated process.
 const gate={mode:result.testMode,applicationId:result.applicationId,guildId:result.guildId,channelId:result.channelId,consentingUserIds:result.consentingUserIds};
 const env={...process.env,DATABASE_PATH:result.databasePath,DOTENV_CONFIG_PATH:path.join(result.root,'empty.env'),SPEED_RPG_SANDBOX_GATE:JSON.stringify(gate)};
 const child=spawnSync(process.execPath,[path.join(root,'dist/index.js')],{cwd:result.root,env,stdio:'inherit'});if(child.error)throw child.error;return {exitCode:child.status,signal:child.signal};
}
if(require.main===module){try{const [c,a,flag]=process.argv.slice(2);const r=launch(c,a,flag==='--run');if(!flag)console.log(JSON.stringify(r,null,2));else process.exitCode=r.exitCode??1;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={launch};
