#!/usr/bin/env node
'use strict';
// Operational diagnostics only. No schema changes, deletes, VACUUM or automatic checkpoint.
const fs=require('node:fs'),path=require('node:path'),{parseArgs}=require('node:util');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
function diskBytes(file){try{return fs.statSync(file).size;}catch(e){if(e.code==='ENOENT')return 0;throw e;}}
function inspectDatabase(db,file,{budgetBytes=8*1024**3,warningRatio=0.8}={}){
 if(!Number.isSafeInteger(budgetBytes)||budgetBytes<=0||!Number.isFinite(warningRatio)||warningRatio<=0||warningRatio>1)throw Error('Invalid disk budget or warning ratio');
 const pragma=name=>Number(Object.values(db.prepare('PRAGMA '+name).get())[0]);
 // One read transaction gives counts and payload estimates a consistent snapshot.
 db.exec('BEGIN');let tables;
 try{
  tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>{
   const columns=db.prepare('PRAGMA table_info('+quote(name)+')').all();
   const sizes=columns.map(c=>'COALESCE(length(CAST('+quote(c.name)+' AS BLOB)),0)').join('+')||'0';
   const row=db.prepare('SELECT count(*) AS rows,COALESCE(sum('+sizes+'),0) AS payloadBytes FROM '+quote(name)).get();
   return {name,rows:Number(row.rows),payloadBytes:Number(row.payloadBytes)};
  });
  let pageUsage;
  try{pageUsage={available:true,objects:db.prepare('SELECT name,sum(pgsize) AS bytes,sum(payload) AS payloadBytes FROM dbstat GROUP BY name ORDER BY bytes DESC').all().map(r=>({name:r.name,bytes:Number(r.bytes),payloadBytes:Number(r.payloadBytes)}))};}
  catch(e){if(!/no such table: dbstat/i.test(e.message))throw e;pageUsage={available:false,reason:'SQLite build does not expose dbstat; row payload estimates are not physical table/index sizes'};}
  const result={pageSize:pragma('page_size'),pageCount:pragma('page_count'),freePages:pragma('freelist_count'),tables,pageUsage};
  db.exec('COMMIT');
  const files={main:diskBytes(file),wal:diskBytes(file+'-wal'),shm:diskBytes(file+'-shm')};
  const totalBytes=Object.values(files).reduce((a,b)=>a+b,0);
  return {...result,files,totalBytes,budgetBytes,warningRatio,budgetExceeded:totalBytes>=budgetBytes,warning:totalBytes>=budgetBytes*warningRatio,
   payloadEstimateOnly:true,capacityScope:'SQLite files only; excludes backups, assets, OS and other processes',
   sampledAt:new Date().toISOString(),retention:'No rows removed. Receipts and unfinished games must remain available for recovery/idempotence.'};
 }catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}
}
function passiveCheckpoint(db){
 // PASSIVE never waits for readers/writers to finish and never truncates the WAL.
 const r=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
 return {mode:'PASSIVE',busy:Number(r.busy),logFrames:Number(r.log),checkpointedFrames:Number(r.checkpointed),
  complete:Number(r.log)>=0&&Number(r.log)===Number(r.checkpointed)};
}
function main(args){
 const {values,positionals}=parseArgs({args,allowPositionals:true,strict:true,options:{'checkpoint-passive':{type:'boolean'},'budget-bytes':{type:'string'},'warning-ratio':{type:'string'}}}),checkpoint=values['checkpoint-passive']===true;
 if(positionals.length!==1||positionals[0].startsWith('--'))throw Error('Usage: node scripts/sqlite-health.cjs <existing.sqlite> [--checkpoint-passive] [--budget-bytes N] [--warning-ratio 0.8]');
 const file=path.resolve(positionals[0]);if(!fs.statSync(file).isFile())throw Error('Expected existing SQLite file');
 // Open read-only by default. Never creates a missing database.
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(file,{readOnly:!checkpoint});
 try{return {health:inspectDatabase(db,file,{...values['budget-bytes']!==undefined?{budgetBytes:Number(values['budget-bytes'])}:{},...values['warning-ratio']!==undefined?{warningRatio:Number(values['warning-ratio'])}:{}}),checkpoint:checkpoint?passiveCheckpoint(db):null};}finally{db.close();}
}
module.exports={inspectDatabase,passiveCheckpoint,main};
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2)),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
