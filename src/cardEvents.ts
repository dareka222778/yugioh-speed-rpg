import {cardDistributionAllowed} from './cardReleasePolicy';
/** Explicit administrator-only card distributions. Never called by NPC payout. */
import {randomUUID} from 'node:crypto';
import {db,getPlayer} from './database';
import {getPlayableCard} from './effectRegistry';
export type EventOperator={guild:string;actor:string;admin:boolean};
export type EventGrant={id:string;quantity:number};
type CardEvent={id:string;guild:string;creator:string;name:string;status:'draft'|'active'|'closed';expires:number;quota:number;cards:EventGrant[]};
db.exec(`CREATE TABLE IF NOT EXISTS card_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,creator TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL,expires INTEGER NOT NULL,quota INTEGER NOT NULL,cards TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS card_event_receipts(event_id TEXT NOT NULL REFERENCES card_events(id),recipient TEXT NOT NULL REFERENCES players(discord_id),operator TEXT NOT NULL,created INTEGER NOT NULL,cards TEXT NOT NULL,PRIMARY KEY(event_id,recipient));`);
function authorize(op:EventOperator){if(!op.admin||!op.guild||!op.actor)throw new Error('Somente administradores do servidor podem distribuir cartas por evento.');}
export function parseEventCards(text:string):EventGrant[]{
 const parts=text.split(',');if(!text.trim()||parts.length>30)throw new Error('Informe de 1 a 30 entradas no formato ID:quantidade, separadas por vírgula.');
 const values=new Map<string,number>();for(const part of parts){const match=/^\s*(\d{8}):([1-3])\s*$/.exec(part);if(!match||(!getPlayableCard(match[1])||!cardDistributionAllowed(match[1])))throw new Error('Carta não habilitada ou quantidade inválida. Use IDs de 8 dígitos e quantidade de 1 a 3.');values.set(match[1],(values.get(match[1])??0)+Number(match[2]));}
 if([...values.values()].some(n=>n>3))throw new Error('O pacote de evento permite no máximo três cópias de cada carta.');
 return [...values].map(([id,quantity])=>({id,quantity}));
}
function readEvent(op:EventOperator,id:string):CardEvent{
 authorize(op);const row=db.prepare('SELECT * FROM card_events WHERE id=? AND guild=?').get(id,op.guild) as any;
 if(!row)throw new Error('Evento não encontrado neste servidor.');return {...row,cards:JSON.parse(row.cards)};
}
export function createCardEvent(op:EventOperator,name:string,cards:string,quota:number,hours:number,now=Date.now()){
 authorize(op);if(!name.trim()||name.length>80||!Number.isInteger(quota)||quota<1||quota>1000||!Number.isInteger(hours)||hours<1||hours>720)throw new Error('Nome até 80 caracteres; limite de 1 a 1000 participantes; duração de 1 a 720 horas.');
 const event:CardEvent={id:randomUUID(),guild:op.guild,creator:op.actor,name:name.trim(),status:'draft',expires:now+hours*3600000,quota,cards:parseEventCards(cards)};
 db.prepare('INSERT INTO card_events VALUES(?,?,?,?,?,?,?,?)').run(event.id,event.guild,event.creator,event.name,event.status,event.expires,event.quota,JSON.stringify(event.cards));return event;
}
export const activateCardEvent=db.transaction((op:EventOperator,id:string,now=Date.now())=>{
 const event=readEvent(op,id);if(event.creator!==op.actor)throw new Error('A confirmação deve ser feita pelo administrador que criou o evento.');if(event.status==='closed'||event.expires<=now)throw new Error('Este evento está encerrado ou expirado.');db.prepare("UPDATE card_events SET status='active' WHERE id=?").run(id);return {...event,status:'active' as const};
});
export const grantEventCards=db.transaction((op:EventOperator,id:string,recipient:string,now=Date.now())=>{
 const event=readEvent(op,id);const receipt=db.prepare('SELECT cards FROM card_event_receipts WHERE event_id=? AND recipient=?').get(id,recipient) as {cards:string}|undefined;
 if(receipt)return {duplicate:true,cards:JSON.parse(receipt.cards) as EventGrant[]};
 if(event.status!=='active'||event.expires<=now)throw new Error('Evento não está ativo ou expirou.');if(!getPlayer(recipient))throw new Error('O destinatário precisa criar o duelista com /start.');
 const used=(db.prepare('SELECT COUNT(*) AS n FROM card_event_receipts WHERE event_id=?').get(id) as {n:number}).n;if(used>=event.quota)throw new Error('O limite de participantes deste evento foi atingido.');
 const add=db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,?) ON CONFLICT(discord_id,card_key) DO UPDATE SET quantity=quantity+excluded.quantity');for(const c of event.cards){if(!getPlayableCard(c.id)||!cardDistributionAllowed(c.id))throw new Error('Uma carta do evento não está mais habilitada.');add.run(recipient,c.id,c.quantity);}
 db.prepare('INSERT INTO card_event_receipts VALUES(?,?,?,?,?)').run(id,recipient,op.actor,now,JSON.stringify(event.cards));return {duplicate:false,cards:event.cards};
});
export function closeCardEvent(op:EventOperator,id:string){readEvent(op,id);db.prepare("UPDATE card_events SET status='closed' WHERE id=?").run(id);}

export function listCardEvents(op:EventOperator){authorize(op);return db.prepare('SELECT id,name,status,expires,quota,(SELECT COUNT(*) FROM card_event_receipts WHERE event_id=card_events.id) AS delivered FROM card_events WHERE guild=? ORDER BY rowid DESC LIMIT 8').all(op.guild) as {id:string;name:string;status:string;expires:number;quota:number;delivered:number}[];}
