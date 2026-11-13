#!/usr/bin/env node
/** Never inherit production data paths or Discord credentials into test workers. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'speed-rpg-tests-')),args=process.argv.slice(2),serial=args.includes('--serial'),requested=args.filter(a=>a!=='--serial');
const files=requested.length?requested:fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).sort().map(f=>path.join('tests',f));
const env={...process.env,DATABASE_PATH:path.join(dir,'game.sqlite')};for(const name of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','NODE_TEST_CONTEXT'])delete env[name];
try{const result=spawnSync(process.execPath,['--test',...serial?['--test-concurrency=1']:[],...files],{env,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;}finally{fs.rmSync(dir,{recursive:true,force:true});}
