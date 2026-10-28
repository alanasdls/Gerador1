import {ANIMALS,daySP} from './public/methods-data.mjs';
import {project} from './bridge/server.mjs';
export const rows=Array.from({length:25},(_,i)=>({grupo:i+1,ultima_aparicao_data:daySP(),extracoes_sem_sair:Math.floor(i/5)===2?8:i%3,atualizado_em:new Date().toISOString()}));
export const sourceDraw={codigo:'H0001',nome:'Look 00:01',data_resultado:daySP(),horario:'00:01',premios:['5357','7813','4140','4931','0935','3176','854'].map((milhar,i)=>({posicao:i+1,milhar}))};
export const delayHtml=ANIMALS.map((name,i)=>`<p>${i+1}º ${name} saiu a ${i} dias no milhar</p>`).join('');
export function currentAnalysisFixture(){
 const history=project(rows),base={data:daySP(),horario:'00:01',codigo:'H0001',milhar_1_premio:'5572',grupo:18};
 return {...history,modo:'resultados_api',consultado_em:new Date().toISOString(),analise_atual:{resultado_base:base,proxima_extracao:{data:daySP(),horario:'07:20'},linha_mais_atrasada:history.ranking_linhas[0]},ultima_extracao:base,extracoes_disponiveis:[base],avisos:[]};
}
export async function fixtureFetch(input,options={}){
 const url=new URL(input);
 if(url.hostname==='apidelamak.alanasdls.workers.dev')return Response.json({sucesso:true,extracoes:[{...sourceDraw,data_resultado:url.searchParams.get('data')||daySP()}]});
 if(url.hostname==='vip-api.delamarkpalpites.com')return Response.json(currentAnalysisFixture());
 if(url.hostname==='bichocerto.com')return new Response(delayHtml);
 if(url.hostname==='html.duckduckgo.com')return new Response('<a class="result__a" href="https://www.personare.com.br/conteudo/sonhos">Símbolos dos sonhos</a><a class="result__snippet">Caminhos e transformação em uma leitura simbólica.</a>');
 if(url.hostname==='www.astrolink.com.br')return new Response('<title>Áries: iniciativa e coragem</title><meta name="description" content="Símbolos de iniciativa e coragem.">');
 if(url.hostname==='www.personare.com.br')return new Response('<title>Significado dos sonhos de A a Z</title><meta name="description" content="Considere seu contexto pessoal.">');
 throw Error('Unexpected external request: '+url.hostname);
}
