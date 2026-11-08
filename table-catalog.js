// The tables the platform runs with: Texas Hold'em at 9, 6, 4 and 2 seats. Each city is one
// stake level, its tables numbered I, II, III… Amounts are cents; the maximum buy-in of a
// table is 100 big blinds (see buyinLimits in game.js). All tables are green.
export const TABLE_GREEN='#1f9d6b';
const LEVELS={'0.01':[1,2],'0.02':[2,5],'0.05':[5,10],'0.10':[10,20],'0.25':[25,50],'0.50':[50,100],'1':[100,200],'2':[200,500],'5':[500,1000],'10':[1000,2000]};
export const CATALOG=[
 {size:9,rows:[['0.01','Porto',3],['0.02','Rotterdam',3],['0.05','Brussels',5],['0.10','Vienna',5],['0.25','Geneva',3],['0.50','Zurich',2],['1','London',2],['2','Dubai',1],['5','Monaco',1]]},
 {size:6,rows:[['0.01','Lisbon',8],['0.02','Madrid',10],['0.05','Milano',12],['0.10','Paris',12],['0.25','Barcelona',10],['0.50','Amsterdam',8],['1','Miami',6],['2','Las Vegas',4],['5','Monte Carlo',2],['10','Abu Dhabi',1]]},
 {size:4,rows:[['0.01','Alicante',4],['0.02','Budapest',5],['0.05','Prague',6],['0.10','Antwerp',6],['0.25','Lyon',5],['0.50','Bordeaux',4],['1','Düsseldorf',3],['2','Doha',2],['5','New York',1]]},
 {size:2,rows:[['0.01','Oxford',3],['0.02','Windsor',4],['0.05','Oslo',5],['0.10','Nice',5],['0.25','Ibiza',4],['0.50','Saint-Tropez',3],['1','Lugano',3],['2','Marbella',2],['5','Boston',1]]},
];
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
export const TABLE_CATALOG=CATALOG.flatMap(({size,rows})=>rows.flatMap(([small,city,count])=>{const [sb,bb]=LEVELS[small];return Array.from({length:count},(_,i)=>({name:`${city} ${ROMAN[i]}`,sb,bb,color:TABLE_GREEN,game:'holdem',size}));}));

// Runs once per database, at startup, when nobody can be seated yet: every table that
// exists is closed and the catalog opens in its place. Ids keep counting up, so the hand
// history of a closed table never mixes with a new one. A table the centre closes later
// does not come back.
export const CATALOG_VERSION=2;
export function seedCatalog(db){
 if((db.tableCatalog||0)>=CATALOG_VERSION)return 0;
 const next=Math.max(Number(db.nextTable)||1,...db.tables.map(t=>Number(t.id)+1||1));
 db.tables=TABLE_CATALOG.map((t,i)=>({id:String(next+i),...t}));
 db.nextTable=next+TABLE_CATALOG.length;db.tableCatalog=CATALOG_VERSION;return TABLE_CATALOG.length;
}
