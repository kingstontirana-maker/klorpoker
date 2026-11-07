// The tables the platform opens with. Each name has six tables in a row, I to VI:
// two stake levels, each at 2, 4 and 6 seats. Amounts are cents; the maximum buy-in
// of a table is 100 big blinds (see buyinLimits in game.js).
export const TABLE_GREEN='#1f9d6b';
export const CATALOG_NAMES=[
 {name:'Imperium',stakes:[[1,2],[2,5]]},
 {name:'Monaco',stakes:[[5,10],[10,25]]},
 {name:'Black Diamond',stakes:[[25,50],[50,100]]},
 {name:'Grand Palace',stakes:[[100,200],[200,500]]},
 {name:'Supreme',stakes:[[500,1000],[1000,2000]]},
 {name:'The Billionaire',stakes:[[2500,5000],[5000,10000]]},
];
const ROMAN=['I','II','III','IV','V','VI'],SIZES=[2,4,6];

export const TABLE_CATALOG=CATALOG_NAMES.flatMap(({name,stakes})=>stakes.flatMap(([sb,bb],level)=>SIZES.map((size,i)=>({name:`${name} ${ROMAN[level*3+i]}`,sb,bb,color:TABLE_GREEN,game:'holdem',size}))));

// Runs once per database. A table the centre closes later does not come back, and a
// table with a catalog name already taken is left alone. Every table turns green once.
export function seedCatalog(db){
 if(db.tableCatalog)return 0;
 for(const t of db.tables)t.color=TABLE_GREEN;
 const taken=new Set(db.tables.map(t=>t.name.toLowerCase()));
 let next=Math.max(Number(db.nextTable)||1,...db.tables.map(t=>Number(t.id)+1||1)),added=0;
 for(const t of TABLE_CATALOG){if(taken.has(t.name.toLowerCase()))continue;db.tables.push({id:String(next++),...t});added++;}
 db.nextTable=next;db.tableCatalog=1;return added;
}
