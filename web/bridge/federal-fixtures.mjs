export function federalContests(){
 return Array.from({length:26},(_,i)=>{
  const date=new Date(Date.parse('2026-10-24T12:00:00Z')-i*3*86400000).toISOString().slice(0,10).split('-').reverse().join('/');
  return {tipoJogo:'LOTERIA_FEDERAL',numero:6112-i,numeroConcursoAnterior:6111-i,numeroConcursoProximo:6113-i,dataApuracao:date,dataProximoConcurso:'',listaDezenas:[i===0?'064383':String(i*4%100).padStart(6,'0'),'000001','012345','099999','000000']};
 });
}
export function federalStore(contests=federalContests()){
 let value={version:1,contests:structuredClone(contests)};
 return {writes:0,get:async()=>structuredClone(value),async put(_key,raw){value=JSON.parse(raw);this.writes++;}};
}
