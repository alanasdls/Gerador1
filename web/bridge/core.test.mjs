import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectResults,analysis,readHistory,dateSP} from './core.mjs';
import {normalizeResults} from './source.mjs';
const date='2026-10-28',now=new Date(date+'T17:30:00Z');
const marker={id:'draw-1120',data_resultado:date,horario:'11:20',processado_em:date+'T14:26:02Z'};
const states=()=>Array.from({length:25},(_,i)=>({grupo:i+1,extracoes_sem_sair:i===5?0:10-Math.floor(i/5)*2,ultima_aparicao_data:i===5?date:'2026-10-27',ultima_aparicao_horario:i===5?'11:20':'21:20',atualizado_em:date+'T14:26:01Z'}));
const draw=(horario='11:20',milhar='0024',data=date)=>({data,horario,codigo:'H'+horario.replace(':',''),milhar_1_premio:milhar,grupo:Math.ceil((Number(milhar.slice(-2))||100)/4)});
const reader=(rows=states())=>async table=>{
 if(table==='delayed_animal_state')return rows;
 if(table==='delayed_processed_draws')return [marker];
 if(table==='result_lottery_times')return ['07:20','11:20','14:20','16:20','23:20'].map(horario=>({horario}));
 throw Error('Unexpected table: '+table);
};
test('new API result updates the Rebeca line without a WhatsApp query or database write',async()=>{
 const rows=states(),before=structuredClone(rows);
 const data=await analysis('look-goias',reader(rows),async()=>[draw(),draw('14:20','0001')],now);
 assert.equal(data.analise_atual.linha_mais_atrasada.linha,3);assert.equal(data.analise_atual.linha_mais_atrasada.atraso_extracoes,7);
 assert.equal(data.analise_atual.proxima_extracao.horario,'16:20');assert.deepEqual(rows,before);
});
test('polling, duplicate draws and the collector catching up never count a draw twice',()=>{
 const fresh=draw('14:20','0001'),expected=projectResults(states(),marker,[draw(),fresh]);
 assert.deepEqual(projectResults(states(),marker,[fresh,draw(),fresh]),expected);
 const advanced=states().map(s=>({...s,extracoes_sem_sair:s.grupo===1?0:s.extracoes_sem_sair+1}));
 assert.deepEqual(projectResults(advanced,{...marker,horario:'14:20'},[draw(),fresh]),expected);
});
test('partial history updates, source lag and baseline conflicts suppress a wrong ranking',async()=>{
 const partial=states();partial[0].atualizado_em=date+'T14:26:03Z';
 await assert.rejects(readHistory(reader(partial),'look-goias'),/ATUALIZACAO/);
 assert.throws(()=>projectResults(states(),marker,[draw('09:20')]),/ANTERIOR/);
 assert.throws(()=>projectResults(states(),marker,[draw('11:20','0001')]),/ATUALIZACAO/);
});
test('calendar rollover keeps historical dates and applies new-day results independently',async()=>{
 const nextDay='2026-10-29',data=await analysis('look-goias',reader(),async(_l,day)=>day===nextDay?[draw('07:20','0001',nextDay)]:[draw()],new Date(nextDay+'T11:00:00Z'));
 assert.equal(data.data_referencia,nextDay);assert.equal(data.analise_atual.resultado_base.data,nextDay);
 assert.equal(dateSP(new Date(nextDay+'T02:59:59Z')),date);
});
test('canonical results use only the first prize and reject future, wrong-date or conflicting draws',()=>{
 const base={data_resultado:date,loteria_id:23,premios:[{posicao:1,milhar:'0001',grupo:1}]};
 assert.equal(normalizeResults({ok:true,extracoes:[base]},'look-goias',date,now)[0].horario,'14:20');
 for(const change of [{data_resultado:'2026-10-27'},{loteria_id:24},{premios:[{posicao:2,milhar:'0001'}]}])assert.deepEqual(normalizeResults({ok:true,extracoes:[{...base,...change}]},'look-goias',date,now),[]);
 assert.throws(()=>normalizeResults({ok:true,extracoes:[base,{...base,premios:[{posicao:1,milhar:'0005',grupo:2}]}]},'look-goias',date,now),/CONFLITANTE/);
});
