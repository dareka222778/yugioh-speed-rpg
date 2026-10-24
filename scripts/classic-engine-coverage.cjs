// Reports the currently executable first historical batch; fails the readiness gate until complete.
const {classicCoverage}=require('../dist/effectRegistry');
const coverage=classicCoverage(),enabled=coverage.filter(c=>c.enabled),blocked=coverage.filter(c=>c.status==='pending'),incompatible=coverage.filter(c=>c.status==='format-incompatible');
console.log(JSON.stringify({batch:'SDY / SDK / SDJ',total:coverage.length,enabled:enabled.length,blocked:blocked.length,incompatible:incompatible.length,complete:blocked.length===0,cards:coverage},null,2));
if(process.argv.includes('--require-complete')&&blocked.length)process.exitCode=1;
