/** Synthetic bounded hash allocation comparison, never an application/Discord benchmark. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hash-bench16-')),file=path.join(dir,'snapshot.sqlite');
try{
 const fd=fs.openSync(file,'wx'),chunk=Buffer.alloc(65536,0x7b);try{for(let i=0;i<1024;i++)fs.writeSync(fd,chunk);}finally{fs.closeSync(fd);}
 const worker=`const fs=require('fs'),crypto=require('crypto'),{performance}=require('perf_hooks');
 if(global.gc)global.gc();const before=process.memoryUsage(),start=performance.now(),cpu=process.cpuUsage();let digest,buffer;
 if(process.argv[1]==='bulk'){buffer=fs.readFileSync(process.argv[2]);digest=crypto.createHash('sha256').update(buffer).digest('hex');}
 else digest=require('./scripts/sqlite-snapshot.cjs').hash(process.argv[2]);
 console.log(JSON.stringify({mode:process.argv[1],node:process.version,bytes:fs.statSync(process.argv[2]).size,digest,elapsedMs:performance.now()-start,cpuMicros:process.cpuUsage(cpu),before,after:process.memoryUsage(),resource:process.resourceUsage()}));`;
 const runs=[];for(const mode of ['bulk','stream','stream','bulk']){const r=spawnSync(process.execPath,['--expose-gc','-e',worker,mode,file],{encoding:'utf8'});if(r.status)throw Error(r.stderr);runs.push(JSON.parse(r.stdout));}
 if(new Set(runs.map(r=>r.digest)).size!==1)throw Error('Hash mismatch');
 const report={scope:'Synthetic 64 MiB binary snapshot in isolated child processes. Cache and order can affect timing; not a full backup benchmark.',runs};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/mission16-hash-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
