#!/usr/bin/env node
/** Prepares an empty, credential-free sandbox; does not start the bot or log in. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function prepare(parent=os.tmpdir()){
 const folder=fs.mkdtempSync(path.join(path.resolve(parent),'speed-rpg-homologation-')),database=path.join(folder,'isolated.sqlite');
 const config={kind:'offline-discord-homologation-sandbox',root:folder,databasePath:database,discordLoginAuthorized:false,productionAllowed:false,credentialsProvided:false,offlineCommand:'node scripts/run-tests-isolated.cjs --serial tests/discordHomologation.test.cjs tests/discordFullMatches.test.cjs',notes:['The runner uses its own temporary SQLite and strips inherited Discord credentials.','No bot client is started by this preparation.','Real Discord credentials/environment require separate authorization.']};
 fs.writeFileSync(path.join(folder,'sandbox.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(folder,'.env.example'),'DATABASE_PATH='+database.replaceAll('\\','/')+'\nDISCORD_TOKEN=\nDISCORD_CLIENT_ID=\nDISCORD_GUILD_ID=\n',{flag:'wx'});
 fs.writeFileSync(path.join(folder,'empty.env'),'# Prevent repository .env fallback in the manual sandbox launcher.\n',{flag:'wx'});
 fs.writeFileSync(path.join(folder,'authorization.example.json'),JSON.stringify({approved:false,dedicatedTestApplication:false,applicationId:'',guildId:'',channelId:'',consentingUserIds:[],prohibitedApplicationIds:[],prohibitedGuildIds:[],approvedCandidateSha:'',notes:'Explicit authorization required. No tokens belong in this file. Production IDs are deny-list identifiers, not credentials.'},null,2)+'\n',{flag:'wx'});return config;
}
if(require.main===module)console.log(JSON.stringify(prepare(),null,2));module.exports={prepare};
