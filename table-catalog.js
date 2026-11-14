// The tables the platform runs with: Texas Hold'em at 9, 6, 5, 4 and 2 seats. Each city is one
// stake level, its tables numbered I, II, III… Amounts are cents; the maximum buy-in of a
// table is 100 big blinds (see buyinLimits in game.js). All tables are green.
export const TABLE_GREEN='#1f9d6b';
const LEVELS={'0.01':[1,2],'0.02':[2,5],'0.05':[5,10],'0.10':[10,20],'0.25':[25,50],'0.50':[50,100],'1':[100,200],'2':[200,500],'5':[500,1000],'10':[1000,2000],'25':[2500,5000],'30':[3000,6000],'40':[4000,8000],'50':[5000,10000],'100':[10000,20000]};
export const CATALOG=[
 {size:9,rows:[['0.01','Porto',3],['0.02','Rotterdam',3],['0.05','Brussels',5],['0.10','Vienna',5],['0.25','Geneva',3],['0.50','Zurich',2],['1','London',2],['2','Dubai',1],['5','Monaco',1]]},
 {size:6,rows:[['0.01','Lisbon',6],['0.02','Madrid',8],['0.05','Milano',9],['0.10','Paris',9],['0.25','Barcelona',8],['0.50','Amsterdam',6],['1','Miami',6],['2','Las Vegas',4],['5','Monte Carlo',2],['10','Abu Dhabi',1],['40','St. Moritz',1]]},
 {size:5,rows:[['100','Macau',3],['50','Singapore',3],['30','Courchevel',3],['25','Mykonos',3]]},
 {size:4,rows:[['0.01','Alicante',4],['0.02','Budapest',5],['0.05','Prague',6],['0.10','Antwerp',6],['0.25','Lyon',5],['0.50','Bordeaux',4],['1','Düsseldorf',3],['2','Doha',2],['5','New York',1]]},
 {size:2,rows:[['0.01','Oxford',3],['0.02','Windsor',4],['0.05','Oslo',5],['0.10','Nice',5],['0.25','Ibiza',4],['0.50','Saint-Tropez',3],['1','Lugano',3],['2','Marbella',2],['5','Boston',1],['40','Gstaad',1]]},
];
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
export const TABLE_CATALOG=CATALOG.flatMap(({size,rows})=>rows.flatMap(([small,city,count])=>{const [sb,bb]=LEVELS[small];return Array.from({length:count},(_,i)=>({name:`${city} ${ROMAN[i]}`,sb,bb,color:TABLE_GREEN,game:'holdem',size}));}));

// Runs once per database, at startup, when nobody can be seated yet: every table that
// exists is closed and the catalog opens in its place. Ids keep counting up, so the hand
// history of a closed table never mixes with a new one. A table the centre closes later
// does not come back.
//
// Version 3 changes a database that already runs version 2 in place: 14 of the busiest
// low-stakes tables close and the high-stakes tables (5 seats, and €40/€80 at 6 and 2 seats)
// open under new ids. Every other table, and any table the centre made, stays as it is.
export const CATALOG_VERSION=3;
export const RETIRED_V3=['Lisbon VII','Lisbon VIII','Madrid IX','Madrid X','Milano X','Milano XI','Milano XII','Paris X','Paris XI','Paris XII','Barcelona IX','Barcelona X','Amsterdam VII','Amsterdam VIII'];
export const ADDED_V3=TABLE_CATALOG.filter(t=>t.size===5||t.bb===8000);
export function seedCatalog(db){
 const version=db.tableCatalog||0;if(version>=CATALOG_VERSION)return 0;
 const next=Math.max(Number(db.nextTable)||1,...db.tables.map(t=>Number(t.id)+1||1));
 if(version<2){db.tables=TABLE_CATALOG.map((t,i)=>({id:String(next+i),...t}));db.nextTable=next+TABLE_CATALOG.length;db.tableCatalog=CATALOG_VERSION;return TABLE_CATALOG.length;}
 const gone=new Set(RETIRED_V3),have=new Set(db.tables.map(t=>t.name.toLowerCase()));
 const add=ADDED_V3.filter(t=>!have.has(t.name.toLowerCase())).map((t,i)=>({id:String(next+i),...t}));
 db.tables=[...db.tables.filter(t=>!gone.has(t.name)),...add];db.nextTable=next+add.length;db.tableCatalog=CATALOG_VERSION;return add.length;
}
