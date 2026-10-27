// Adapted from Delamark's researched dream/sign methods; no admin or cross code.
import {ANIMALS,EMOJI} from './public/methods-data.mjs';
const JB_ANIMALS=ANIMALS.map((name,i)=>[name,EMOJI[i]]),enc=new TextEncoder();
const SIGN_INFO={
  aries:['Áries','♈'],touro:['Touro','♉'],gemeos:['Gêmeos','♊'],cancer:['Câncer','♋'],
  leao:['Leão','♌'],virgem:['Virgem','♍'],libra:['Libra','♎'],escorpiao:['Escorpião','♏'],
  sagitario:['Sagitário','♐'],capricornio:['Capricórnio','♑'],aquario:['Aquário','♒'],peixes:['Peixes','♓']
};
const STOPWORDS=new Set('a o as os um uma uns umas de da do das dos e em no na nos nas por para com sem que quem qual quais como quando onde porque meu minha meus minhas seu sua seus suas eu voce você ele ela eles elas ao aos à às foi era ser estar ter tinha tem tive sonhei sonho sonhos sobre muito mais menos também tambem'.split(/\s+/));
function stripHtml(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()}
function normalizeWords(s){return String(s||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)||[]}
function keywordsFromText(s,limit=5){const out=[];for(const w of normalizeWords(s)){if(w.length<4||STOPWORDS.has(w)||out.includes(w))continue;out.push(w);if(out.length>=limit)break}return out}
function decodeEntities(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#039;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function extractDdUrl(href){try{const u=new URL(decodeEntities(href),'https://duckduckgo.com');const raw=u.searchParams.get('uddg');const final=new URL(raw||u.toString());if(final.protocol!=='https:'||!['personare.com.br','astrolink.com.br','astrocentro.com.br'].some(d=>final.hostname===d||final.hostname.endsWith('.'+d)))return null;return final.toString()}catch{return null}}
async function ddgSearchOne(query,domain){
  const qx=domain?`site:${domain} ${query}`:query;
  const url='https://html.duckduckgo.com/html/?q='+encodeURIComponent(qx);
  const r=await fetch(url,{signal:AbortSignal.timeout(6000),headers:{'accept':'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 REBECA-PALPITES'}});if(!r.ok)throw new Error('PESQUISA_WEB_INDISPONIVEL');
  const html=await r.text();
  const re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)/i;
  const m=html.match(re);if(!m)return null;const finalUrl=extractDdUrl(m[1]);if(!finalUrl)return null;
  return {title:stripHtml(m[2]),snippet:stripHtml(m[3]||m[4]||''),url:finalUrl,source:domain||'web'};
}
async function sourcePage(url){
 const safe=extractDdUrl(url);if(!safe)throw Error('FONTE_INVALIDA');
 const r=await fetch(safe,{signal:AbortSignal.timeout(6000),headers:{accept:'text/html'},cf:{cacheTtl:3600}});if(!r.ok)throw Error('FONTE_INDISPONIVEL');
 const html=(await r.text()).slice(0,1500000),title=stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 if(!title||/captcha|just a moment|access denied/i.test(title))throw Error('FONTE_INDISPONIVEL');
 const description=html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1]||'';
 return {html,ref:{title,snippet:stripHtml(description).split(/\s+/).slice(0,24).join(' '),url:safe,source:new URL(safe).hostname}};
}
async function directResearch(context){
 if(context.sign&&Object.hasOwn(SIGN_INFO,context.sign))return [(await sourcePage('https://www.astrolink.com.br/'+context.sign)).ref];
 if(!context.dream)throw Error('PESQUISA_SEM_RESULTADOS');
 const guide=await sourcePage('https://www.personare.com.br/conteudo/significado-dos-sonhos-de-a-a-z-m237993');
 const words=keywordsFromText(context.dream,5),links=[];
 for(const match of guide.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  const url=extractDdUrl(match[1]);if(!url||!url.startsWith('https://www.personare.com.br/conteudo/'))continue;
  const label=normalizeWords(stripHtml(match[2])+' '+new URL(url).pathname);
  if(words.some(word=>label.includes(word))&&!links.includes(url))links.push(url);
 }
 const pages=await Promise.allSettled(links.slice(0,2).map(sourcePage)),refs=pages.filter(x=>x.status==='fulfilled').map(x=>x.value.ref);
 return refs.length?refs:[{...guide.ref,general:true}];
}
async function researchInternet(queries,limit=3,context={}){
 if(context.sign){try{return await directResearch(context);}catch{}}
 const domains=['personare.com.br','astrolink.com.br','astrocentro.com.br'];
 for(const query of queries.slice(0,2)){
  const attempts=await Promise.allSettled(domains.map(domain=>ddgSearchOne(query,domain)));
  const hits=attempts.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value);
  const unique=[...new Map(hits.map(x=>[x.url,x])).values()];
  if(unique.length)return unique.slice(0,limit);
 }
 return directResearch(context);
}
async function sha256Bytes(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(String(s))))}
function groupForMilhar(milhar){const dez=Number(String(milhar).slice(-2));const n=dez===0?100:dez;return Math.min(25,Math.max(1,Math.ceil(n/4)))}
async function generateThousands(seedBase,count=25){
  const salt=crypto.randomUUID();const seen=new Set(),out=[];
  for(let i=0;out.length<count&&i<400;i++){
    const h=await sha256Bytes(`${seedBase}|${salt}|${i}|${Date.now()}`);const n=((h[0]<<24)>>>0)+(h[1]<<16)+(h[2]<<8)+h[3];const milhar=String(n%10000).padStart(4,'0');if(seen.has(milhar))continue;seen.add(milhar);
    const group=groupForMilhar(milhar),[animal,emoji]=JB_ANIMALS[group-1];out.push({milhar,group,animal,emoji});
  }
  return out;
}
function clipSentence(s,max=180){const t=stripHtml(s);if(t.length<=max)return t;return t.slice(0,max).replace(/\s+\S*$/,'')+'…'}
function pickVariant(seed,arr){let sum=0;for(const c of String(seed||''))sum=(sum+c.charCodeAt(0))>>>0;return arr[sum%arr.length]}
function researchSummary(refs){return refs.slice(0,3).map(r=>r.title).join(' • ')}
function fantasyThemes(refs,extra=''){const words=keywordsFromText(refs.map(r=>`${r.title} ${r.snippet}`).join(' ')+' '+extra,8);const blocked=new Set(['signo','signos','astrologia','horoscopo','horóscopo','sonhos','sonho','significado','personare','astrolink','astrocentro','saiba','veja','entenda']);return words.filter(w=>!blocked.has(w)).slice(0,5)}
function poeticList(words){if(!words.length)return 'intuição, caminhos e transformação';if(words.length===1)return words[0];return words.slice(0,-1).join(', ')+' e '+words.at(-1)}
function horoscopeText(name,signName,refs,picks,userId){
  const themes=fantasyThemes(refs,signName),animals=[...new Set(picks.slice(0,10).map(p=>`${p.emoji} ${p.animal}`))].slice(0,5).join(', '),mood=poeticList(themes);
  const descriptions=[
    `${name}, o céu de ${signName} abriu uma trilha simbólica marcada por ${mood}. A leitura de hoje sugere um momento de perceber sinais sutis, confiar mais na própria intuição e escolher com coragem aquilo que parece vibrar em sintonia com você.`,
    `${name}, nesta leitura de ${signName}, os símbolos pesquisados formaram uma atmosfera de ${mood}. É como se o dia trouxesse pequenas portas se abrindo: algumas pedem movimento, outras silêncio, mas todas convidam você a olhar para o que realmente chama sua atenção.`,
    `${name}, a energia simbólica de ${signName} apareceu cercada por imagens de ${mood}. A sensação desta leitura é de renovação e escolha: ouvir o instinto, perceber coincidências e transformar detalhes simples do dia em pistas para novos caminhos.`
  ];
  const reasons=[
    `As 25 milhares nasceram dessa leitura simbólica e foram combinadas de forma exclusiva para você. Nesta rodada, os bichos que mais apareceram entre as dezenas foram ${animals}; eles entram como símbolos da atmosfera pesquisada, não como uma tabela fixa.`,
    `Transformei os temas encontrados na pesquisa em uma combinação única de 25 milhares para esta consulta. Os símbolos animais que se destacaram foram ${animals}, criando uma leitura diferente a cada nova geração.`,
    `A pesquisa serviu como inspiração para montar uma sequência única de 25 milhares. Entre os símbolos que surgiram nesta rodada estão ${animals}; numa nova consulta, a combinação e a própria leitura mudam novamente.`
  ];
  const key=`${name}|${signName}|${refs.map(r=>r.title).join('|')}|${picks[0]?.milhar}|${userId}`;return {description:pickVariant(key,descriptions),reason:pickVariant(key+'r',reasons)};
}
function dreamText(dream,refs,picks,userId){
  if(refs.every(r=>r.general))return {description:`Esta é uma leitura simbólica geral sobre os temas ${poeticList(keywordsFromText(dream,4))}. A fonte consultada orienta a considerar o contexto pessoal do sonho; não foi localizado um verbete específico para esta descrição.`,reason:'As 25 milhares são combinações aleatórias para esta consulta, sem previsão de resultado.'};
  const kws=keywordsFromText(dream,4),themes=fantasyThemes(refs,dream),mood=poeticList(themes),symbols=poeticList(kws),animals=[...new Set(picks.slice(0,10).map(p=>`${p.emoji} ${p.animal}`))].slice(0,5).join(', ');
  const descriptions=[
    `Seu sonho abre uma porta simbólica em torno de ${symbols}. Nas fontes pesquisadas, essa imagem se aproxima de temas como ${mood}. Na leitura da Rebeca, isso sugere um recado do mundo dos sonhos sobre mudanças, desejos guardados e caminhos que talvez estejam pedindo mais atenção.`,
    `Há algo de misterioso na combinação de ${symbols}. A pesquisa trouxe ecos de ${mood}, e a leitura simbólica transforma isso numa espécie de mapa noturno: sentimentos escondidos, sinais de transformação e escolhas que podem estar amadurecendo por dentro.`,
    `Os elementos ${symbols} aparecem como peças de um cenário onírico. A pesquisa os aproximou de ${mood}; juntos, eles formam uma leitura de intuição, movimento e descoberta, como se o sonho estivesse iluminando detalhes que passam despercebidos durante o dia.`
  ];
  const reasons=[
    `As 25 milhares foram inspiradas nos símbolos encontrados nessa pesquisa e embaralhadas de forma exclusiva para esta consulta. Nesta rodada, apareceram com destaque ${animals}.`,
    `A leitura transformou os símbolos do sonho em 25 milhares únicas. Os bichos ${animals} surgiram nesta combinação como parte do cenário simbólico desta geração.`,
    `Cada nova leitura muda. Desta vez, os temas do sonho levaram a 25 milhares exclusivas e aos símbolos ${animals}; outra consulta pode revelar uma sequência completamente diferente.`
  ];
  const key=`${dream}|${refs.map(r=>r.title).join('|')}|${picks[0]?.milhar}|${userId}`;return {description:pickVariant(key,descriptions),reason:pickVariant(key+'r',reasons)};
}




export {SIGN_INFO,keywordsFromText,researchInternet,generateThousands,horoscopeText,dreamText};
