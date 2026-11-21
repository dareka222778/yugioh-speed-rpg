'use strict';
const fs=require('node:fs'),path=require('node:path');
/** Resolve missing descendants without losing the protected lexical alias. */
function canonical(candidate){let ancestor=path.resolve(candidate);const tail=[];while(!fs.existsSync(ancestor)){tail.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Unresolvable output path');ancestor=parent;}return path.join(fs.realpathSync(ancestor),...tail);}
const inside=(candidate,root)=>{const rel=path.relative(root,candidate);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
function assertStagingOutput(candidate,repo){const lexical=path.resolve(candidate),repository=path.resolve(repo),resolved=canonical(lexical),protectedNames=['src','data','dist','scripts','tests','node_modules','.git'];
 if(lexical===repository||resolved===canonical(repository)||protectedNames.some(name=>{const dir=path.join(repository,name);return inside(lexical,dir)||inside(resolved,canonical(dir));}))throw Error('Protected output path: use separate catalog staging');return resolved;
}
module.exports={canonical,assertStagingOutput};
