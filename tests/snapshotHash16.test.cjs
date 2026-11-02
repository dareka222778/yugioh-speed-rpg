const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {hash}=require('../scripts/sqlite-snapshot.cjs');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-hash16-'));try{fn(path.join(dir,'snapshot.sqlite'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('M16 snapshot hash remains SHA-256 compatible for empty, boundary and multi-chunk binary files',()=>fixture(file=>{
 for(const size of [0,1,65535,65536,65537,3*65536+17]){const data=Buffer.alloc(size);for(let i=0;i<size;i++)data[i]=i%251;fs.writeFileSync(file,data);assert.equal(hash(file),crypto.createHash('sha256').update(data).digest('hex'));assert.equal(fs.statSync(file).size,size);}
}));
test('M16 snapshot hashing reads a multi-MiB file in bounded chunks without any whole-file read',()=>fixture(file=>{
 const chunk=Buffer.alloc(65536,0x8f),expected=crypto.createHash('sha256'),fd=fs.openSync(file,'wx');try{for(let i=0;i<128;i++){fs.writeSync(fd,chunk);expected.update(chunk);}}finally{fs.closeSync(fd);}
 const oldRead=fs.readFileSync,oldReadSync=fs.readSync;let reads=0,max=0;
 fs.readFileSync=()=>{throw Error('Whole snapshot allocation forbidden');};fs.readSync=(...args)=>{reads++;max=Math.max(max,args[3]);return oldReadSync(...args);};
 try{assert.equal(hash(file),expected.digest('hex'));assert.ok(reads>128);assert.ok(max<=65536);}finally{fs.readFileSync=oldRead;fs.readSync=oldReadSync;}
}));
test('M16 snapshot hash closes its file after I/O failure and does not create missing source files',()=>fixture(file=>{
 assert.throws(()=>hash(file));assert.equal(fs.existsSync(file),false);fs.writeFileSync(file,'preserved');
 const oldRead=fs.readSync,oldClose=fs.closeSync;let closes=0;fs.readSync=()=>{throw Error('injected read failure');};fs.closeSync=(...args)=>{closes++;return oldClose(...args);};
 try{assert.throws(()=>hash(file),/injected read failure/);assert.equal(closes,1);}finally{fs.readSync=oldRead;fs.closeSync=oldClose;}
 assert.equal(fs.readFileSync(file,'utf8'),'preserved');
}));
