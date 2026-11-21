#!/usr/bin/env node
/** Explicit read-only offline inspection. No app startup, migrations or repairs. */
const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3'),{inspectSerializedSnapshot}=require('../dist/snapshotInspection');
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
if(!args.includes('--db')||!args.includes('--out')||!value('--db')||!value('--out'))throw Error('Usage: inspect-saved-duels.cjs --db explicit.sqlite --out NEW-report.json');
const dbPath=path.resolve(value('--db')),out=path.resolve(value('--out'));if(fs.existsSync(out))throw Error('Report already exists; originals are never overwritten');
const db=new Database(dbPath,{readonly:true,fileMustExist:true});let rows;
try{rows=db.prepare("SELECT id,status,revision,state FROM duels WHERE state IS NOT NULL OR status='playing' ORDER BY id LIMIT 10000").all().map(row=>({id:row.id,revision:row.revision,duelStatus:row.status,...inspectSerializedSnapshot(row.state)}));}finally{db.close();}
fs.writeFileSync(out,JSON.stringify({kind:'read-only-snapshot-audit',databasePath:dbPath,rawStatesIncluded:false,limit:10000,rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({inspected:rows.length,quarantined:rows.filter(r=>r.status==='quarantined').length,report:out}));
