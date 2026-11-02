import {db} from './database';
export type ActionReceipt={requestId:string;committedRevision:number;replayed:boolean};
export type ActionRequest={id:string;actor:string;guild:string;expected:number;action:unknown;requestId?:string};
type Scope='duel'|'tag';
const tables:Record<Scope,string>={duel:'duel_action_receipts',tag:'tag_action_receipts'};
/** Call inside the same SQLite transaction as state, rewards and events. The
 * table names are closed constants; payload and identity are bound parameters. */
export function findActionReceipt(scope:Scope,request:ActionRequest):ActionReceipt|undefined{
 const {id,actor,guild,expected,action,requestId}=request;
 if(requestId!==undefined&&(typeof requestId!=='string'||!requestId.trim()||requestId.length>128))throw new Error('Identificador de ação inválido.');
 if(!requestId)return;
 const row=db.prepare(`SELECT * FROM ${tables[scope]} WHERE request_id=?`).get(requestId) as {duel_id:string;actor:string;guild_id:string;expected_revision:number;action_json:string;committed_revision:number}|undefined;
 if(!row)return;
 if(row.duel_id!==id||row.actor!==actor||row.guild_id!==guild||row.expected_revision!==expected||row.action_json!==JSON.stringify(action))throw new Error('Identificador de ação já utilizado por outra solicitação.');
 return {requestId,committedRevision:row.committed_revision,replayed:true};
}
export function saveActionReceipt(scope:Scope,request:ActionRequest,revision:number):ActionReceipt|undefined{
 const {id,actor,guild,expected,action,requestId}=request;if(!requestId)return;
 db.prepare(`INSERT INTO ${tables[scope]} VALUES(?,?,?,?,?,?,?)`).run(requestId,id,actor,guild,expected,JSON.stringify(action),revision);
 return {requestId,committedRevision:revision,replayed:false};
}
