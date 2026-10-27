export function generateNumbers(groups,mode,quantity,random=max=>Math.floor(Math.random()*max)){
 if(!Array.isArray(groups)||!groups.length||groups.length>5||new Set(groups).size!==groups.length||groups.some(n=>!Number.isInteger(n)||n<1||n>25))throw Error('Selecione de 1 a 5 bichos.');
 if(!['normal','dry','closed'].includes(mode)||!Number.isInteger(quantity)||quantity<1||quantity>100)throw Error('Escolha de 1 a 100 milhares.');
 const pool=[];
 for(const group of groups){let tens=Array.from({length:4},(_,i)=>(group*4-3+i)%100);if(mode==='dry')tens=[tens[random(4)]];
  for(let prefix=0;prefix<100;prefix++)for(const ten of tens)pool.push(String(prefix).padStart(2,'0')+String(ten).padStart(2,'0'));
 }
 for(let i=0;i<quantity;i++){const j=i+random(pool.length-i);[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,quantity);
}
