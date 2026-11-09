import type {CardRef} from './duelEngine';
/** Search never draws; only the number is a decision, and only at resolution. */
export function copySearchOptions(deck:readonly CardRef[],id:string):string[]{
 const available=deck.reduce((n,c)=>n+Number(c.id===id),0);
 return available>=2?['__copies_2__','__copies_1__']:available===1?['__copies_1__']:[];
}
export function takeCopies(deck:CardRef[],id:string,choice:string):CardRef[]{
 if(!copySearchOptions(deck,id).includes(choice))throw Error('Quantidade de cópias indisponível.');
 const count=choice==='__copies_2__'?2:1,found:CardRef[]=[];
 for(let i=0;i<count;i++)found.push(...deck.splice(deck.findIndex(c=>c.id===id),1));
 return found;
}
