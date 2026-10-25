#!/usr/bin/env node
/** Reproducible acceptance for the enabled 1v1 scope, never a full-TCG claim. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');process.chdir(root);
const suites=['discordFlow','interactions','handFlow','duelIntegrity','classicCounterTraps','classicContinuousEffects','classicQuickMonsters','classicGraveTriggers','classicSummonTriggers','cardEvents','cardText'].map(n=>'tests/'+n+'.test.cjs');for(const file of suites)if(!fs.existsSync(file))throw Error('Missing critical suite: '+file);
const tap=execFileSync(process.execPath,['--test',...suites],{encoding:'utf8',maxBuffer:8*1024*1024});const tests=Number(/# pass (\d+)/.exec(tap)?.[1]);if(!tests||!tap.includes('# fail 0'))throw Error('Acceptance tests did not complete.');
const audit=JSON.parse(execFileSync(process.execPath,['scripts/audit-duel-engine.cjs','--games','1000'],{encoding:'utf8',maxBuffer:1024*1024}));
const files=['duelEngine','duelIntegrity','handFlow','chainEngine','duelInteraction','discordPayload','effectDefinitions','monsterEffects'].map(n=>'src/'+n+'.ts');const fingerprint=createHash('sha256');for(const file of files)fingerprint.update(file).update(fs.readFileSync(file));
const {enabledCardIds}=require('../dist/effectRegistry');
const result={release:require('../package.json').version,scope:'enabled 1v1 Speed RPG; not every anime/TCG card',enabledCards:enabledCardIds.length,criticalSuites:suites,criticalTests:tests,coreFingerprint:fingerprint.digest('hex'),completeGames:audit.completed,decisions:audit.moves,serializedRestores:audit.serializedRestores,cardConservation:audit.cardIntegrity,technicalGate:'passed',readyForCommandUI:true,liveDiscordHumanAcceptance:'not certified by automation',phase6:'2v2 is a separate engine and does not inherit this acceptance'};
fs.mkdirSync('validation',{recursive:true});fs.writeFileSync('validation/engine-acceptance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
