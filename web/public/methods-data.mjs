export const ANIMALS=['Avestruz','Águia','Burro','Borboleta','Cachorro','Cabra','Carneiro','Camelo','Cobra','Coelho','Cavalo','Elefante','Galo','Gato','Jacaré','Leão','Macaco','Porco','Pavão','Peru','Touro','Tigre','Urso','Veado','Vaca'];
export const EMOJI=['🦤','🦅','🫏','🦋','🐶','🐐','🐏','🐪','🐍','🐇','🐎','🐘','🐓','🐱','🐊','🦁','🐒','🐷','🦚','🦃','🐂','🐅','🐻','🦌','🐄'];
export const BANKS={
 'look-goias':{name:'Look Goiás',api:'look-goias',state:'look-goias',delay:'lk'},
 rio:{name:'PT Rio',api:'rio-federal',state:'rio-federal',delay:'rj'},
 bahia:{name:'Bahia',api:'bahia',state:'bahia',delay:'ba'},
 'sao-paulo':{name:'São Paulo',api:'sao-paulo',state:'sao-paulo',delay:'sp'},
 nacional:{name:'Nacional',api:'nacional',state:'nacional',delay:'ln'},
 lotep:{name:'Lotep',api:'lotep',state:'lotep',delay:'pb'},
 federal:{name:'Federal',api:'rio-federal',state:'federal-caixa',delay:'fd'}
};
export const SIGNS=[['aries','Áries','♈'],['touro','Touro','♉'],['gemeos','Gêmeos','♊'],['cancer','Câncer','♋'],['leao','Leão','♌'],['virgem','Virgem','♍'],['libra','Libra','♎'],['escorpiao','Escorpião','♏'],['sagitario','Sagitário','♐'],['capricornio','Capricórnio','♑'],['aquario','Aquário','♒'],['peixes','Peixes','♓']];
// Associations transcribed from the owner's Delamark table; presentation is Rebeca's.
export const PULLS=[[25,2,13,19,20],[10,1,13,19,20],[11,12,21,24,10,9],[6,12,14,16,5,13],[13,14,8,17,18,19],[7,17,12,21,22,23],[6,10,25],[5,12,23],[15,18,3,14],[7,2,3],[3,6,21],[6,23,22,16,3],[5,2,1,19,20],[5,21,9,16],[4,17,18],[12,14,17,23],[5,6,20,15],[10,15,20,9],[1,2,13,20],[1,2,13,19,24],[25,3,6],[14,16,6],[16,12,8,6],[20,3,6],[21,1,7]];
export const pad=n=>String(n).padStart(2,'0');
export const daySP=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function animal(number){const last=Number(String(number).slice(-2)),group=last===0?25:Math.ceil(last/4);return {group,name:ANIMALS[group-1],emoji:EMOJI[group-1]};}
export function sums(number,year){if(!/^\d{4}$/.test(number)||!Number.isInteger(year))throw Error('Resultado inválido.');return Array.from({length:4},(_,i)=>{const milhar=String((year+Number(number)*(i+1))%10000).padStart(4,'0');return {milhar,...animal(milhar)};});}
