import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFederal,federalAnalysis,federalResults,loadFederal} from './federal.mjs';
import {federalContests,federalStore} from './federal-fixtures.mjs';
const now=new Date('2026-10-28T18:00:00Z'),rows=federalContests();
const source=async n=>structuredClone(rows.find(r=>r.numero===(n??6112)));
test('Federal identity and original contest date are required; six-digit tickets preserve their last four digits',()=>{
 const d=normalizeFederal(rows[0],6112,now);assert.equal(d.milhar_1_premio,'4383');assert.equal(d.grupo,21);assert.equal(d.premios[4].milhar,'0000');assert.equal(d.concurso,6112);assert.equal(d.data,'2026-10-24');assert.equal(d.horario,'');assert.equal(d.proximo.data,null);
 for(const patch of [{tipoJogo:'RIO'},{numero:6111},{dataApuracao:'29/10/2026'},{dataApuracao:'30/02/2026'},{listaDezenas:['00001']},{numeroConcursoAnterior:6112}])assert.throws(()=>normalizeFederal({...rows[0],...patch},6112,now));
});
test('all five line delays use consecutive contests from the first prize, independent of weekdays or elapsed days',async()=>{
 const store=federalStore(),data=await federalAnalysis(store,now,source);assert.equal(data.ranking_linhas.length,5);assert.equal(data.ranking_linhas[0].linha,4);assert.equal(data.ranking_linhas[0].atraso_extracoes,16);
 assert.equal(data.analise_atual.resultado_base.concurso,6112);assert.deepEqual(data.analise_atual.proxima_extracao,{concurso:6113,data:null,horario:null});assert.ok(data.avisos.includes('SEM_EXTRACAO_DE_HOJE'));assert.equal(store.writes,0);
 const repeat=await federalAnalysis(store,now,source);assert.deepEqual(repeat.ranking_linhas,data.ranking_linhas);assert.equal(store.writes,0);
});
test('a new official contest and correction recompute delays once and persist records for both sites',async()=>{
 const store=federalStore(),next={...rows[0],numero:6113,numeroConcursoAnterior:6112,numeroConcursoProximo:6114,dataApuracao:'28/10/2026',listaDezenas:['000001',...rows[0].listaDezenas.slice(1)]};
 const fetch=async n=>n===null?next:source(n);
 const data=await federalAnalysis(store,now,fetch);assert.equal(data.ranking_linhas[0].atraso_extracoes,17);assert.equal(store.writes,1);assert.deepEqual((await federalAnalysis(store,now,fetch)).ranking_linhas,data.ranking_linhas);assert.equal(store.writes,1);
 next.listaDezenas[0]='000064';const corrected=await federalAnalysis(store,now,fetch);assert.equal(corrected.ranking_linhas.find(l=>l.linha===4).atraso_extracoes,0);assert.equal(store.writes,2);
 await assert.rejects(federalAnalysis(store,now,source),/DESATUALIZADA/);
});
test('missing contests are backfilled by actual previous contest ID; a bounded incomplete history never creates a false ranking',async()=>{
 const store=federalStore(rows.filter(r=>r.numero<6102||r.numero===6112));
 const first=await federalAnalysis(store,now,source);assert.equal(first.ranking_linhas.length,0);assert.equal(first.ultima_extracao.concurso,6112);
 const recovered=await federalAnalysis(store,now,source);assert.equal(recovered.ranking_linhas.length,5);assert.equal(recovered.ranking_linhas[0].atraso_extracoes,16);
 const missing=federalStore(rows.filter(r=>r.numero!==6111));const incomplete=await federalAnalysis(missing,now,async n=>{if(n===6111)throw Error('offline');return source(n)});assert.equal(incomplete.ranking_linhas.length,0);
});
test('results expose only the requested official contest date, and outages do not silently reuse stale latest data',async()=>{
 const store=federalStore(),data=await federalResults(store,'2026-10-24',now,source);assert.equal(data.extracoes.length,1);assert.equal(data.extracoes[0].premios.length,5);assert.equal(data.extracoes[0].premios[0].milhar,'4383');
 assert.equal((await federalResults(store,'2026-10-28',now,source)).extracoes.length,0);await assert.rejects(federalResults(store,'2026-02-30',now,source),/DATA_INVALIDA/);
 await assert.rejects(loadFederal(store,now,async()=>{throw Error('offline')}),/offline/);await assert.rejects(loadFederal(null,now,source),/NAO_CONFIGURADO/);
});
