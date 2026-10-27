#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..'),manifest=require('../docs/evidence/mission3-preserved-files.json');
assert.equal(manifest.baselineCommit,'d185c098ec90a69967b92527a1afe3a3c0e50d21');assert.equal(manifest.historicalSourceModules,58);
assert.equal(new Set(manifest.files.map(f=>f.path)).size,manifest.files.length);
assert.equal(manifest.files.filter(f=>/^src\/resolvers\/v[12]\/.*\.ts$/.test(f.path)).length,58);
for(const file of manifest.files){assert.ok(!file.path.includes('..')&&!path.isAbsolute(file.path));const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(bytes.length,file.bytes,file.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,'Protected Mission 2 bytes changed: '+file.path);}
console.log(JSON.stringify({protectedFiles:manifest.files.length,historicalSourceModules:58,preserved:true}));
