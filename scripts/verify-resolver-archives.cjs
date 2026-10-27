#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
for(const [version,origin,count]of [['v1','7802a737212165c9a0100562e37cd8adc734b960',27],['v2','c02e1cdee7f513e5494c579da660795a02341f49',31]]){
const root=path.resolve(__dirname,'../src/resolvers/'+version),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.originCommit,origin);assert.equal(manifest.files.length,count);
const names=new Set(manifest.files.map(file=>file.path));assert.equal(names.size,count);
for(const file of manifest.files){assert.match(file.path,/^[A-Za-z0-9]+\.ts$/);const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,'Archived implementation changed: '+file.path);
 for(const match of bytes.toString('utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)){const name=match[1];assert.ok(name.startsWith('node:')||name.startsWith('./')&&names.has(name.slice(2)+'.ts'),'Unpinned archive dependency '+name);}
}
console.log('engine-'+version+': '+count+' immutable source modules verified');
}
