/**
 * Speed RPG — Azure system.
 * Shared accessible visual tokens for Discord command panels, character gallery,
 * card inspection, deck editor and informative embeds. The duel playmat is a
 * separate, original amber renderer and must not inherit this blue layout.
 * No game-state or Discord dependency.
 */
export const azure={
 ink:'#06101F',
 deep:'#07162B',
 navy:'#0A203C',
 surface:'#102D4D',
 surfaceRaised:'#173B60',
 surfaceSelected:'#205580',
 card:'#11253E',
 line:'#4BA5ED',
 lineMuted:'#2B648F',
 primary:'#32B9FF',
 primaryBright:'#A2E8FF',
 text:'#F5FBFF',
 muted:'#BCD5ED',
 tertiary:'#839FB9',
 success:'#65E2BD',
 danger:'#FF858F',
 warning:'#FFCB78',
 field:'#0B2743',
 trap:'#355484',
 spell:'#269DA8'
} as const;

export const duelistAccents={
 joey:'#FFBA58',
 yugi:'#BCADFF',
 kaiba:'#84DBFF'
} as const;

export const duelLayout={
 width:1400,
 boardHeight:1020,
 handHeight:340,
 zoneCount:3,
 mainZoneWidth:196,
 cardWidth:106,
 cardHeight:145
} as const;

/** Relative luminance and contrast allow automated accessible-color checks. */
export function luminance(hex:string):number{
 const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 return values.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
export function contrast(a:string,b:string):number{
 const la=luminance(a),lb=luminance(b);
 return (Math.max(la,lb)+.05)/(Math.min(la,lb)+.05);
}
export const embedColors={
 public:0x1688D8,
 private:0x248FDF,
 npc:0x1688D8,
 deck:0x1688D8
} as const;
