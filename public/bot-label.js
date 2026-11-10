// A display label only: account names and IDs remain stable.
export function botDisplayName(name,isBot=true){
 const text=String(name??'');
 return isBot?text.replace(/(?:\s+TESTING)+$/i,'')+' TESTING':text;
}
