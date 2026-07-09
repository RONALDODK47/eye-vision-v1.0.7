// cleanExtratoOcrRowForImport -> Ut
function Ut(e){var n;const t=qd({...e}),a=It(t.data);a&&(t.data=a);for(const r of["valorDebito","valorCredito","valorMisto","valor"]){const s=t[r];if(!(s!=null&&s.trim()))continue;const i=xt(s);i&&(t[r]=i)}const o=(n=t.natureza)==null?void 0:n.trim();return o&&/^[DCdc]$/.test(o)&&(t.natureza=o.toUpperCase()),zC(t)}

// consolidarColunasValorExtratoRow -> qd
function qd(e){const t={...e},a=_(t.valorDebito??""),o=_(t.valorCredito??""),n=_(t.valorMisto??"");return n>1e-4&&(a>1e-4&&Math.abs(n-a)<.011||o>1e-4&&Math.abs(n-o)<.011)&&(t.valorMisto=""),a>1e-4&&o>1e-4&&Math.abs(a-o)<.011&&(t.valorCredito=""),t}

// enrichExtratoHistoricoLinhaOcrFromPageItems -> n1
function n1(e,t,a,o){if(!e.length||!t.length)return t;const n=o??si(void 0,a),r=WC(e),s=e.map(i=>i.str).join(" ").replace(/\s+/g," ").trim();return t.map(i=>{const c=ae(i).trim();if(c&&H(c))return i;const l=String(i._linhaOcr??"").replace(/\s+/g," ").trim();if(l){const p=xe(l,i);if(p&&H(p)&&(ve(p)||p.length>=4))return _s(i,l,p)}let u=_(String(i.valorMisto??""))||_(String(i.valorDebito??""))||_(String(i.valorCredito??""))||0;if(u<=1e-4&&l){const p=Ie(l);p.length===1&&(u=p[0].value)}if(u<=1e-4)return i;const f=String(i.data??"").trim();for(let p=0;p<r.length;p++){const b=r[p];if(!o1(b,n,a,u))continue;let x=a1(r,p,f);if(x||(x=Yd(b)),f&&!Kd(x,f))continue;if(_e(x)){const v=Vc(s,f,u);if(v&&/\bSISPAG\b/i.test(v))x=`${v} ${x}`.replace(/\s+/g," ").trim();else{const C=t1(r,p,f),N=u.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}),S=C&&/\bTED\s*RECEB/i.test(C)&&u>=50&&!C.includes(N)&&!C.replace(/\./g,"").includes(N.replace(/\./g,""));C&&!S&&(x=`${C} ${x}`.replace(/\s+/g," ").trim())}}if(x.length<=l.length+4&&_e(x))continue;const g=xe(x,{...i});if(g&&H(g)){if(/\bTED\s*RECEB/i.test(g)){const v=Vc(s,f,u);if(v&&/\bSISPAG\b/i.test(v))return _s(i,x,v)}return _s(i,x,g)}if(!_e(x))return{...i,_linhaOcr:x}}const m=Vc(s,f,u);if(m&&H(m)){const p=l||`${f} ${m}`.trim();return _s(i,p,m)}return i})}

// extratoAnexarOrfaosSaldoColadoComHistoricoRaw -> e0
function e0(e,t){const a=e.map(n=>an({...n})),o=new Set;for(let n=0;n<a.length;n++){if(o.has(n))continue;const r=a[n],s=String(r._linhaOcr??"").replace(/\s+/g," ").trim();let i=Ve(r);if(i<=1e-4&&_e(s)){const m=Ie(s).filter(p=>p.value>1e-4);m.length===1&&(i=m[0].value)}if(i<=1e-4)continue;const c=Ne(r);if(nt(r)||Ae(s)||Le(r)>=50&&Na(r)||!(r._valorRecuperadoSaldo==="1"||_e(s)))continue;if(Aa(i,c,a,n)){o.add(n);continue}const u=wo(t,c,i,{allowGeneric:!1});if(!u)continue;let f=!1;for(let m=0;m<a.length;m++){if(m===n||o.has(m))continue;const p=Wh(a[m],t);if(a[m]=p,!(c&&!Be(p,c))&&!(Le(p)<50)&&!fo(p,i)){Lo(p,r),f=!0,o.add(n);break}}f||(a[n]=Ut(_t({...r,descricao:u,valorMisto:Xe(i,"C"),valorDebito:"",valorCredito:""})))}return a.filter((n,r)=>!o.has(r))}

// extratoConsolidarExtratoRowsParaImportacao -> tu
function tu(e,t,a=[]){const o=e.filter(x=>!nt(x)),n=o.reduce((x,g)=>x+_o(g),0);if(o.length>0&&n>1e-4&&!e.some(x=>nt(x)))return Ks(o,a);const s=e.filter(x=>!nt(x)&&_o(x)>1e-4);if(s.length>0&&!e.some(x=>nt(x))&&s.every(x=>{const g=Na(x);return!!g&&H(g)||Le(x)>=50}))return Ks(e,a);const c=Zh(e,t),l=Jh(c,t),u=t.filter(x=>{const g=Gt(x).replace(/\s+/g," ").trim();return!g||nt(x)?!1:ea({...x,_linhaOcr:g})?!0:_e(g)&&Ve(x)>1e-4}),f=kn([...l,...u]),m=eu(f,t),p=e0(m,t),h=t0(a0(p)).map(x=>{var v;if(ae(x).trim()||!((v=x._linhaOcr)!=null&&v.trim()))return x;const g=xe(x._linhaOcr,x);return g&&H(g)?{...x,descricao:Re(g)}:x});return Ks(h,a)}

// extratoCorrigirRowNaturezaValorDesalinhado -> Ho
function Ho(e){const t=String(e._linhaOcr??"").replace(/\s+/g," ").trim();let a={...e};const o=ae(a).trim(),n=[o,String(a.historicoOperacao??""),t].filter(Boolean).join(" ").replace(/\s+/g," ").trim();gr(o)?(a.descricao="",a.historicoOperacao="",gr(a.natureza)&&(a.natureza="")):/\s+[DC]\s*$/i.test(o)&&Mr(o.replace(/\s+[DC]\s*$/i,"").trim())&&(a.descricao=o.replace(/\s+[DC]\s*$/i,"").trim(),a.historicoOperacao="",/^[DCdc]$/.test(String(a.natureza??"").trim())&&(a.natureza=""));const r=String(a.valorDebito??"").trim(),s=String(a.valorCredito??"").trim(),i=String(a.valorMisto??"").trim(),c=_(r),l=_(s),u=_(i),f=Mr(n)||gr(o)||/\s+[DC]\s*$/i.test(n);if(/^[DCdc]$/.test(String(a.natureza??"").trim())&&f&&!jo(n)&&(a.natureza=""),c>0&&l<=0&&Pe(r,c)==="C"&&f&&!jo(n)?(a.valorMisto=Xe(c,"C"),a.valorCredito="",a.valorDebito="",a.natureza="C"):u>0&&c<=0&&l<=0&&/^[-−(]/.test(i)&&f&&!jo(n)?(a.valorMisto=Xe(u,"C"),a.valorDebito="",a.valorCredito="",a.natureza="C"):u>0&&c<=0&&l<=0&&/^[-−(]/.test(i)?(a.valorMisto=Xe(u,"D"),a.valorDebito="",a.valorCredito="",a.natureza="D"):u>0&&c<=0&&l<=0&&!/^[-−(]/.test(i)&&Pe(i,u)==="C"&&f&&!jo(n)&&(a.valorMisto=Xe(u,"C"),a.valorDebito="",a.valorCredito="",a.natureza="C"),!ae(a).trim()&&t){const m=xe(t,a).trim();m&&H(m)&&(a.descricao=m,a.historicoOperacao="")}return a}

// extratoDescricaoFallbackCreditoOrfao -> wo
function wo(e,t,a,o){if(a>0&&a<1){for(const c of e){const l=String(c._linhaOcr??"").replace(/\s+/g," ").trim();if(!l||t&&!Be(c,t)||!/\bRENDIMENTOS\b|\bREND\s+PAGO\b|\bAUT\s+MAIS\b/i.test(l))continue;const u=Re(xe(l,c));if(u&&H(u))return u}return"RENDIMENTOS"}if(a>1e-4)for(const c of e){const l=String(c._linhaOcr??"").replace(/\s+/g," ").trim();if(!l||/PAGAMENTOS?\s*TRIB|TRIBCOD|SISPAG/i.test(l)||!/\b(TED|RECEBIMENTOS|VEREADORES|CAMARA|041\.0310)/i.test(l)||!Ie(l).filter(m=>m.value>1e-4).some(m=>Math.abs(m.value-a)<.06))continue;const f=Re(xe(l,c));if(f&&H(f)&&!/PAGAMENTOS?\s*TRIB/i.test(f))return f}const n=Hh(e,-1,t);if(n&&!/PAGAMENTOS?\s*TRIB/i.test(n)&&a<=1e-4)return n;const r=e.map(c=>String(c._linhaOcr??"").replace(/\s+/g," ").trim()).filter(Boolean),s=It(t)||t.trim(),i=/^\d{2}\/\d{2}/.test(s)?s.slice(0,5):"";for(const c of r){if(i&&!c.includes(i)||!/TED|SISPAG|PIXRECEB|RECEBIMENTOS|RIBEIRAO|OURINHOS|PINHAL/i.test(c))continue;const l=Re(xe(c,{}));if(l&&H(l))return l}for(const c of r){if(!/TED\s*RECEB|TEDRECEB|RIBEIRAO|OURINHOS|PINHAL/i.test(c))continue;const l=Ie(c).filter(f=>f.value>1e-4);if(l.length>0&&a>1e-4&&!l.some(f=>Math.abs(f.value-a)<.06))continue;const u=Re(xe(c,{}));if(u&&H(u))return u}return o!=null&&o.allowGeneric&&a>=50?"TED RECEBIDA — LANCAMENTO OCR":""}

// extratoDescricaoIgnorarIndicadorDc -> $r
function $r(e){return gr(e)?"":String(e??"").trim()}

// extratoExtrairCabecalhoHistoricoOperacional -> Qt
function Qt(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t)return"";const a=t.match(Od);if(!a)return"";const o=a.index??0,n=a[0],r=t.slice(o+n.length),s=r.search(/\b(?:FAV\.?:|Pagamento\s+Pix|Transfer[eê]ncia\s+Pix|DOC\.:|CNPJ\b)/i),i=s>=0?r.slice(0,s):r.slice(0,48);return`${n}${i}`.replace(/\s+/g," ").trim()}

// extratoExtrairDocumentoFiscalDaLinha -> Yi
function Yi(e){const t=String(e??"").match(Al);return(t==null?void 0:t[0])??""}

// extratoExtrairHistoricoItauOperacionalDaLinha -> kd
function kd(e){var o,n;const t=String(e??"").replace(/\s+/g," ").trim();if(!t)return"";if(/\bSISPAG\b/i.test(t)&&/\bTED\s*RECEB|TEDRECEB/i.test(t)){const r=t.match(/\bSISPAG[\w\s./-]{0,48}/i);if((o=r==null?void 0:r[0])!=null&&o.trim()){let s=r[0].trim();if(/\bSANEAGO\b/i.test(t)&&!/\bSANEAGO\b/i.test(s)&&(s=`${s} SANEAGO`.replace(/\s+/g," ").trim()),H(s))return s.replace(/\s+/g," ").trim()}}const a=[/TED\s*RECEB(?:IDA)?\d{3}\.\d{4}\.[\wÀ-ú0-9.-]*(?:\s+[\wÀ-ú][\wÀ-ú0-9./-]*){0,14}/i,/TEDRECEBIDA?\d{3}\.\d{4}\.[\wÀ-ú0-9.-]*(?:\s+[\wÀ-ú][\wÀ-ú0-9./-]*){0,12}/i,/TED\s*RECEB(?:IDA)?\s+\d{3}\.\d{4}\.[\wÀ-ú0-9.-]*(?:\s+[\wÀ-ú][\wÀ-ú0-9./-]*){0,14}/i,/\bTED\s+\d{3}\.\d{4}\.[\wÀ-ú0-9.-]*(?:\s+[\wÀ-ú][\wÀ-ú0-9./-]*){0,12}/i,/TAR\s*PLANO\s*ADAPT\s*\d{2,3}\/\d{2}/i,/TARPLANOADAPT\d{2,3}\/\d{2}/i,/RECEBIMENTOS\s+[\wÀ-ú]+(?:\s+[\wÀ-ú]+){0,8}/i,/AUT\s+MAIS\s+RENDIMENTOS[\w\s./-]{0,32}/i,/RENDIMENTOS(?:\s+[\wÀ-ú]+){0,6}/i,/SISPAG[\w\s./-]{0,40}/i,/PAGAMENTOS?\s*TRIB[\w\s./-]{0,40}/i,/PIX\s*RECEB[\w\s./-]{0,40}/i,/\bIOF\b/i,/\bCODE\b[\w\s./-]{0,12}/i];for(const r of a){const s=t.match(r);if(!((n=s==null?void 0:s[0])!=null&&n.trim()))continue;let i=s[0].trim();if(i=i.replace(/TARPLANOADAPT(\d{2,3}\/\d{2})/gi,"TAR PLANO ADAPT $1"),i=i.replace(/TEDRECEBIDA?(\d{3}\.)/gi,"TED RECEBIDA $1"),i=i.replace(/TED\s*RECEBIDA?(\d{3}\.)/gi,"TED RECEBIDA $1"),H(i))return i.replace(/\s+/g," ").trim()}return""}

// extratoExtrairSaldoDisponivelDiaDeLinha -> Mh
function Mh(e){var c;const t=String(e??"").replace(/\s+/g," ").trim();if(!/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL/i.test(t))return;const a=tt(t).filter(l=>l.value>1e-4);if(a.length===0)return;if(a.length===1)return a[0].value;const o=[...a].sort((l,u)=>l.start-u.start);if(o.filter(l=>et(t,l)).length>0&&o.length>=2){const l=[...o].reverse().find(u=>!et(t,u));if(l)return l.value}if(o.length>=2){const l=o[0],u=o[o.length-1];if(l.value>500&&u.value<l.value*.5&&u.value<1e4&&u.start>l.start)return u.value}const r=Xo(t,a);if(r){const l=o.find(f=>f.start>r.start+1);if(l)return l.value;const u=o[o.length-1];if(Math.abs(u.start-r.start)>=1&&u.value!==r.value)return u.value}const i=[...(((c=t.split(/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/i).pop())==null?void 0:c.trim())??"").matchAll(/(?:^|\s)(-?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/g)].map(l=>Math.abs(_(l[1]))).filter(l=>l>1e-4);return i.length>=2?i[i.length-1]:o[o.length-1].value}

// extratoFinalizarRowsParaImportacao -> Ks
function Ks(e,t=[]){const a=e.filter(n=>!nt(n)&&!ea(n)),o=t.length>0?Za(a,t):a;return Ah(Ml(o))}

// extratoHistoricoEhPlausivel -> H
function H(e){const t=String(e??"").replace(/\s+/g," ").trim();return!t||Go(t)||Fe(t)||/^[\d\s.,]+$/.test(t)&&t.replace(/\D/g,"").length<=3||/^[A-Za-zÀ-ú]$/.test(t)||/^[DCdc]$/.test(t)||t.length<3&&!rt.test(t)||uo.test(t)?!1:Ln.test(t)&&/[A-Za-zÀ-ú]{3,}/.test(t)&&!/^[\d\s.,]+$/.test(t)&&!/(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/.test(t)?!0:na(t)?!1:/[A-Za-zÀ-ú]{2,}/.test(t)||rt.test(t)}

// extratoHistoricoEhSomenteDocumentoFiscal -> Go
function Go(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t)return!1;const a=t.replace(/\s/g,"");return Al.test(a)?a.replace(Al,"").replace(/[^\w]/g,"").length===0:!1}

// extratoHistoricoEhSomenteSaldoInformativo -> Fe
function Fe(e){const t=zt(Bt(String(e??""))).replace(/\s+/g," ").trim();if(!t)return!1;if(Xi(t))return!0;const a=t.toUpperCase(),o=_d(t);return/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/i.test(a)||Dh(o)?!ve(t):/^SALDO\s+(?:ANTERIOR|BLOQ)/i.test(a)||/^SALDO\s+DO\s+DIA$/i.test(a)||o==="SALDODODIA"?!0:ve(t)?!1:va(t)?a.replace(/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/gi,"").replace(/SALDO\s+DO\s+DIA/gi,"").replace(/[-–—\s]+/g,"").trim().length<3:!1}

// extratoHistoricoPreferidoDaLinhaOcr -> To
function To(e){var s;const t=ae(e).trim();if(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(t)&&H(t))return br(t,String(e._linhaOcr??""));const a=String(e._linhaOcr??"").replace(/\s+/g," ").trim();if(!a||_e(a)||!(ve(a)||Ln.test(a)))return"";const n=br(xe(a,e),a).trim();if(n&&H(n)&&!Fe(n)&&(Ln.test(n)||ve(n)))return n;const r=a.match(/\b(SISPAG[\w\s./-]+|TAR(?:\.|\s+[\w./-]+)|PAGAMENTOS?\s*TRIB[\w\s./-]*|TED\s*RECEB[\w\s./-]*|TEDRECEBIDA[\w\s./-]*|(?:E|PP|O)\s+RECEB[\w\s./-]*|TED[\w\s./-]*|PIX\s*RECEB[\w\s./-]*|RECEBIMENTOS[\w\s./-]+|\bCODE\b|\bIOF\b)/i);if((s=r==null?void 0:r[0])!=null&&s.trim()){const i=br(r[0].trim(),a);if(H(i)&&!Fe(i))return i}return""}

// extratoInferirHistoricoDeLinhasAnteriores -> Uh
function Uh(e,t,a,o=15,n=0){let r=null;for(let s=t-1;s>=0&&t-s<=o;s--){const i=e[s];if(Ne(i),a&&!Be(i,a)||zd(i)||n>0&&n<1&&/\bIOF\b/i.test(String(i._linhaOcr??"")))continue;const c=Le(i);if(c<=0)continue;let l="";const u=ae(i).trim();if(u&&H(u)&&!Fe(u))l=u;else{const f=Qt(String(i._linhaOcr??""));f&&H(f)&&(l=f)}l&&(!r||c>r.score)&&(r={hist:l,score:c})}return(r==null?void 0:r.hist)??""}

// extratoInferirHistoricoDeLinhasPosteriores -> qh
function qh(e,t,a,o=5,n=0){let r=null;for(let s=t+1;s<e.length&&s-t<=o;s++){const i=e[s];if(Ne(i),a&&!Be(i,a)||Ve(i)>1e-4&&!cs(i)||n>0&&n<1&&/\bIOF\b/i.test(String(i._linhaOcr??"")))continue;const c=Le(i);if(c<50)continue;let l="";const u=ae(i).trim();if(u&&H(u)&&!Fe(u))l=u;else{const f=Qt(String(i._linhaOcr??""));f&&H(f)?l=f:/TEDRECEBIDA|TED\s*RECEB|PIXRECEBIDO|PIX\s*RECEB/i.test(String(i._linhaOcr??""))&&(l=xe(String(i._linhaOcr??""),i))}l&&(!r||c>r.score)&&(r={hist:l,score:c})}return(r==null?void 0:r.hist)??""}

// extratoInferirHistoricoItauPorDocumentoValorNoRaw -> wr
function wr(e,t,a,o,n=-1){if(!a||o<=1e-4)return"";const r=(s,i)=>{let c=null;for(let l=0;l<e.length;l++){const u=e[l];if(l===n)continue;const f=String(u._linhaOcr??"").replace(/\s+/g," ").trim();if(!f||!f.includes(a)||s&&t&&!Be(u,t)||/SISPAG/i.test(f)&&!/TED|RECEBIDA|RECEBIMENTOS/i.test(f)||!/RECEB|TED|MUNICIPIO|PIX/i.test(f))continue;const m=Ie(f).filter(h=>h.value>1e-4);if(i&&!m.some(h=>Math.abs(h.value-o)<.06))continue;let p=Le({...u,_linhaOcr:f});m.some(h=>Math.abs(h.value-o)<.06)&&(p+=50),s&&(p+=30),/TED|RECEBIDA/i.test(f)&&(p+=40);const b=Re(kd(f)||xe(f,u)).replace(/\s+\d{1,3}(?:\.\d{3})*,\d{2}\s*$/g,"").trim();!b||!H(b)||Go(b)||/SISPAG/i.test(b)&&!/TED|RECEBIDA/i.test(b)||(!c||p>c.score)&&(c={hist:b,score:p})}return c};for(const[s,i]of[[!0,!0],[!0,!1],[!1,!1]]){const c=r(s,i);if(c)return c.hist}return""}

// extratoInferirHistoricoMesmoDiaNosRows -> Hh
function Hh(e,t,a){const o=It(a)||a.trim();let n=null;for(let r=0;r<e.length;r++){if(r===t)continue;const s=e[r];if(o&&!Be(s,o))continue;const i=Le(s);if(i<50)continue;const c=Na(s);c&&(!n||i>n.score)&&(n={hist:c,score:i})}return(n==null?void 0:n.hist)??""}

// extratoInferirHistoricoParaValorOrfao -> Gh
function Gh(e,t,a){const o=Vh(e[t]??{});if(o>0&&o<1){const n=ZC(e,t,a,o);if(n)return n}return Uh(e,t,a,2,o)||qh(e,t,a,2,o)}

// extratoInferirHistoricoParaValorOrfaoComRaw -> fr
function fr(e,t,a,o){const n=e[a],r=n?Vh(n):0,s=String((n==null?void 0:n._linhaOcr)??"").replace(/\s+/g," ").trim(),i=ae(n??{}).trim(),c=(Go(i)?i:"")||Yi(s);if(c&&r>1e-4){const l=wr(t,o,c,r,a)||wr(e,o,c,r,a);if(l)return l}return Gh(e,a,o)||wo(t,o,r)}

// extratoInjetarHistoricoOperacionalFaltanteDoRaw -> Zh
function Zh(e,t){const a=[...e];for(const o of t){const n=String(o._linhaOcr??"").replace(/\s+/g," ").trim();if(!n||_e(n)||Ae(n)||nt(o)||Le(o)<50)continue;const r=Ne(o),s=an({...o}),i=Na(s);!i||a.some(u=>{if(r&&!Be(u,r)||Le(u)<50)return!1;const f=Na(u);return f&&f.slice(0,20)===i.slice(0,20)?!0:String(u._linhaOcr??"").replace(/\s+/g," ").trim().slice(0,48)===n.slice(0,48)})||!t.some(u=>{const f=String(u._linhaOcr??"").replace(/\s+/g," ").trim();return!f||r&&!Be(u,r)?!1:_e(f)||u._valorRecuperadoSaldo==="1"||Ae(f)})||a.push(Ut(_t({...s,descricao:i,valorMisto:"",valorDebito:"",valorCredito:""})))}return a}

// extratoLancamentoBlocosFromItems -> Md
function Md(e,t,a=.48,o=[]){return e.length===0?[]:gh(as(e,t,a),o)}

// extratoLancamentoTemHistoricoNaPropriaLinhaOcr -> Qd
function Qd(e){const t=String(e._linhaOcr??"").replace(/\s+/g," ").trim();if(!t||_e(t))return!1;if(To(e))return!0;const a=xe(t,e).trim();return!!(a&&H(a)&&ve(a))}

// extratoLimparRowHistoricoSaldoDesalinhado -> wd
function wd(e){if(!rs(e))return e;const t=pt(String(e._linhaOcr??"")),a=xe(t,e).trim();return a&&H(a)&&!Fe(a)?{...e,descricao:Re(a),historicoOperacao:""}:{...e,descricao:"",historicoOperacao:"",historico:""}}

// extratoLinhaBbIniciaNovoLancamento -> os
function os(e,t=!1){const a=String(e??"").replace(/\s+/g," ").trim();return a?!!(/^\d{2}\/\d{2}\/\d{4}\s/.test(a)&&/\b0000\b/.test(a)||/^\d{2}\/\d{2}\/\d{4}\s/.test(a)&&rt.test(a)&&t||Ge(a)&&/^\d{2}\/\d{2}\/\d{4}\s/.test(a)&&t):!1}

// extratoLinhaDeveSerDescartadaNoSplit -> Js
function Js(e,t){const a=String(e??"").replace(/\s+/g," ").trim(),o=String(t??e??"").replace(/\s+/g," ").trim();if(va(a)&&!ve(a))return!0;if(a!==o&&va(o)&&!ve(a))return!(!va(a)&&Ie(a).length>0);const n=tt(a).filter(r=>r.value>1e-4);return n.some(r=>ut(a,r))?!0:!(!ls(a)||n.length>0&&!va(a)&&!ve(a)&&(n.length===1||n.some(r=>r.hasNature)))}

// extratoLinhaEhSomenteDataEValor -> _e
function _e(e){let t=String(e??"").replace(/\s+/g," ").trim();for(let a=0;a<4;a++)if(t=zt(Bt(t)).trim(),!t||/^[-–—\s]+$/.test(t))return!0;return!t||/^[-–—\s]+$/.test(t)}

// extratoLinhaFisicaEhSoContinuacaoHistorico -> Pd
function Pd(e){const t=Da(e),a=t.trim();if(/^\d{1,2}\s*[\/\-.]\s*\d{1,2}(?:\s|[\/\-.]\s*\d{2,4})?\b/.test(a))return!1;const o=Qa(t);return/^(DOC\.?|FAV\.?|NR\.?\s*DOC|CNPJ|TRANSF\.?|PIX\s)/i.test(o)?!0:ts(o)}

// extratoLinhaIndicaCreditoOperacionalItau -> Pr
function Pr(e){const t=String(e??"");return!!(/\b(TED\s*RECEB|TEDRECEB|TEDRECEBIDA|\bRECEBIDA\b|PIX\s*RECEB(?:IDO)?|PIXRECEB|RENDIMENTOS|\bREND\b|RECEBIMENTOS)\b/i.test(t)||/\b(?:E|PP|O)\s+RECEB(?:IDA)?\b/i.test(t)||/\bMUNICIPIO\b.*\bRECEB(?:IDA)?\b/i.test(t)||/\b(?:OURINHOS|RIBEIRAO|PINHAL|FOZDOIGUACU|FOZ\s+DO\s+IGUACU)\b/i.test(t)&&/\bRECEB/i.test(t)||/\bOURINHOS\b/i.test(t)&&/\bCAMARA\b/i.test(t)||/\b(?:VEREADORES|DEVEREADORES|CAMARA)\b/i.test(t)&&/\b(TED|RECEB|MUNICIPIO)/i.test(t)||/RECEBIDA\d{3}\.\d{4}/i.test(t))}

// extratoLinhaIndicaCreditoRecebidoItau -> Mr
function Mr(e){const t=String(e??"");return!!(/\b(TED\s*RECEB|TEDRECEB|TEDRECEBIDA|PIX\s*RECEB(?:IDO)?|PIXRECEB|RENDIMENTOS|\bREND\b|RECEBIMENTOS)\b/i.test(t)||/\b(?:E|PP|O)\s+RECEB(?:IDA)?\b/i.test(t)||/RECEBIDA\d{3}\.\d{4}/i.test(t)||/\bMUNICIPIO\b.*\bRECEB(?:IDA)?\b/i.test(t)||/\bRECEBIDA\b.*\bMUNICIPIO\b/i.test(t))}

// extratoLinhaIndicaDebitoOperacionalItau -> jo
function jo(e){const t=String(e??"").toUpperCase();return/\b(SISPAG|TAR(?:\.|\s)|PAGAMENTOS?\s*TRIB|TRIBCOD|IOF\b)\b/.test(t)||/\bCODE\b/.test(t)?!0:/\bTED\b/.test(t)?!/\b(TED\s*RECEB|TEDRECEB|TEDRECEBIDA|\bRECEBIDA\b|\bRECEBIMENTOS\b|CAMARA|MUNICIPIO|OURINHOS|RIBEIRAO|PINHAL|VEREADORES|DEVEREADORES)\b/i.test(t):!1}

// extratoLinhaIniciaNovoLancamento -> jr
function jr(e){if(!e.hasValor||Io(e))return!1;const t=Da(e);if(os(t,!0))return!0;const a=Qa(t).trim();return/^(DOC\.?|FAV\.?|NR\.?\s*DOC)/i.test(a)?!1:/^CODE\b/i.test(a)&&Ie(t).some(o=>o.value>50)||a.length>=6&&/[A-Za-zÀ-ú]{3,}/.test(a)&&!fh.test(a)?!0:!Pd(e)}

// extratoLinhaSaldoTemValorLancamentoColado -> Ae
function Ae(e){var o;const t=pt(e);if(!/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA/i.test(t))return!1;const a=(o=t.split(/[\s\-–—]+(?:SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA)(?=[\s\-–—]|$)/i).pop())==null?void 0:o.trim();if(a){const n=tt(a).filter(s=>s.value>1e-4),r=Ie(a);if(r.length>=1&&n.length>=2||r.length>=1&&n.length>=1&&ve(a))return!0;if(r.length===1&&n.length===1&&n[0].hasNature)return!1}return Wi(Zn(t)).some(n=>/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA/i.test(n)||ve(n)?!1:Ie(n).length>0&&!!Zi(n))}

// extratoLinhaTemLancamentoOperacionalRecuperavel -> Rt
function Rt(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t)return!1;if(Ae(t)||Wi(Zn(t)).some(r=>!ls(r)&&di(r)&&Ie(r).length>0))return!0;if(!/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA|SALDO\s+ANTERIOR|SALDO\s+BLOQ\.?(?:\s*ANTERIOR)?/i.test(t))return!1;const n=t.replace(/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA|SALDO\s+ANTERIOR|SALDO\s+BLOQ\.?(?:\s*ANTERIOR)?/gi," ").replace(/\s+/g," ").trim();return n.length>=8&&di(n)&&Ie(n).length>0}

// extratoLinhaYContemPalavraIgnorada -> Ch
function Ch(e,t,a,o){if(o.length===0)return!1;const n=Ld(e,t,a);return xo(n,o)}

// extratoLinhasSaldoInformativoDoTextoOcr -> jh
function jh(e){return String(e??"").split(/\r?\n/).map(t=>t.replace(/\s+/g," ").trim()).filter(t=>Ua.test(t)||/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL|BLOQ/i.test(t)||/lan[cç]amentos/i.test(t)&&Ua.test(t)).map(t=>({_linhaOcr:t}))}

// extratoMergedRowSalvouLancamentos -> Dn
function Dn(e,t,a=[]){const o=pt(String(e._linhaOcr??""));if(o&&ea({...e,_linhaOcr:o})){const r=_(o);if(r>1e-4&&Aa(r,"",t))return!0}if(o&&ve(o)&&Ve(e)<=1e-4&&Le(e)>=50){const r=Ne(e);return t.some(s=>Be(s,r)&&_o(s)>1e-4&&Le(s)>=50)}if(o&&_e(o)){const r=Ie(o).filter(s=>s.value>1e-4);if(r.length>0&&r.every(s=>Aa(s.value,String(e.data??""),t)))return!0}if(!o||!Rt(o))return!1;const n=Za(_r([{...e,_linhaOcr:o}]),a).filter(r=>!nt(r));return n.length===0?!1:n.some(r=>{var i;const s=_(r.valorMisto??"")||_(r.valorDebito??"")||_(r.valorCredito??"")||((i=Ie(String(r._linhaOcr??""))[0])==null?void 0:i.value)||0;return s<=.001?!1:t.some(c=>{const l=pt(String(c._linhaOcr??""));if(l&&l===o||l&&Ae(l))return!1;const u=_(c.valorMisto??"")||_(c.valorDebito??"")||_(c.valorCredito??"")||0;if(u<=.001||Math.abs(s-u)>=.06)return!1;const f=ae(c).trim();return!(!f||!H(f)||Fe(f))})})}

// extratoMesclarHistoricoMultilinhaSemValorAnterior -> Th
function Th(e){const t=[];for(const a of e){let o={...a};const n=Ve(o),r=String(o._linhaOcr??"").replace(/\s+/g," ").trim();if(n>1e-4&&t.length>0){const s=t[t.length-1],i=Ve(s),c=String(s._linhaOcr??"").replace(/\s+/g," ").trim();if(i<=1e-4&&Be(s,Ne(o))&&Le(s)>=50&&Le(o)>=50&&!Ae(c)){const l=ae(s).trim()||xe(c,s).trim(),u=ae(o).trim()||xe(r,o).trim(),f=/\bSISPAG\b|PIX\s*QR/i.test(`${l} ${c}`),m=/^CODE\b/i.test(u)||/\bCODE\b/i.test(r);f&&m?(o={...o,descricao:`${l} ${u}`.replace(/\s+/g," ").trim(),historicoOperacao:`${l} ${u}`.replace(/\s+/g," ").trim(),_linhaOcr:`${c} ${r}`.replace(/\s+/g," ").trim().slice(0,480)},t.pop()):l&&u&&l.slice(0,16)!==u.slice(0,16)&&(o={...o,descricao:`${l} ${u}`.trim(),historicoOperacao:`${l} ${u}`.trim(),_linhaOcr:`${c} ${r}`.slice(0,480)},t.pop())}}t.push(o)}return t}

// extratoOrfaoVeioDeSaldoColadoNoRaw -> Zd
function Zd(e,t,a,o=""){if(o&&Ae(o))return!0;const n=It(t)||t.trim(),r=/^\d{2}\/\d{2}/.test(n)?n.slice(0,5):"";return e.some(s=>{const i=String(s._linhaOcr??"").replace(/\s+/g," ").trim();return!i||!Ae(i)||r&&!i.includes(r)?!1:la(i).filter(l=>l.value>1e-4).some(l=>Math.abs(l.value-a)<.06)})}

// extratoParearValoresDeSaldoColadoComHistoricoRaw -> eu
function eu(e,t){var o;let a=e.map(n=>an({...n}));for(const n of t){const r=String(n._linhaOcr??"").replace(/\s+/g," ").trim();if(!r||!Ae(r))continue;const s=Ne(n)||Zi(r)||((o=n.data)==null?void 0:o.trim())||"",i=_l(r);if(i.length!==0)for(const c of i){const l=c.value;if(Aa(l,s,a,-1))continue;const u=c1(r),f=wl(r,l),m=(f&&H(f)?f:"")||(u&&H(u)?u:"")||wo(t,s,l,{allowGeneric:!1});if(!m)continue;let p=!1;for(let h=0;h<a.length;h++){const x=Wh(a[h],t);if(a[h]=x,!(s&&!Be(x,s))&&!(Le(x)<50)&&!fo(x,l)){Lo(x,{...n,valorMisto:Xe(l,"C"),_valorRecuperadoSaldo:"1",_linhaOcrSaldoOrigem:r}),p=!0;break}}if(p)continue;const b=l1(t,s,m);a.push(Ut(_t({...n,_linhaOcr:b||r,data:s||n.data,descricao:m,valorMisto:Xe(l,"C"),valorDebito:"",valorCredito:""})))}}return a=a.filter(n=>{const r=String(n._linhaOcr??"").replace(/\s+/g," ").trim();if(!Ae(r))return!0;const s=Ne(n),i=_l(r);return i.length===0?!1:!i.every(c=>Aa(c.value,s,a,-1))}),a}

// extratoPhysicalLinesFromItems -> as
function as(e,t,a=.48){return qi(e,{yTolFactor:a}).map(n=>{const r=Math.min(...n.map(i=>i.y)),s=Math.max(...n.map(i=>i.y+i.h));return{yTop:r,yBottom:s,centerY:(r+s)/2,items:n,hasValor:fC(n,t)}}).sort((n,r)=>n.yTop-r.yTop)}

// extratoRawBbLancamentoRecuperadoNoMap -> Yh
function Yh(e,t){const a=Gt(e).replace(/\s+/g," ").trim();if(!a||!Ge(a))return!1;const o=Yn(a),n=Ne(e);let r=la(o).filter(s=>s.value>1e-4&&!ut(o,s));if(r.length===0){const s=Wn(o);s&&(r=[s])}return r.length===0?!1:r.some(s=>s1(s.value,n,t))}

// extratoRawItauLancamentoRecuperadoNoMap -> Kh
function Kh(e,t){const a=Gt(e).replace(/\s+/g," ").trim();if(!a||Ge(a))return!1;if(ea({...e,_linhaOcr:a})){const s=_(a);if(s>1e-4)return Uc(s,"",t)||Uc(s,Ne(e),t)||Aa(s,"",t)}if(!(is(a)||ve(a)||_e(a)))return!1;const n=Ne(e),r=i1(a);return r.length===0?!1:r.some(s=>Uc(s,n,t))}

// extratoRawLancamentoRecuperadoNoMap -> Ll
function Ll(e,t){return Yh(e,t)||Kh(e,t)}

// extratoRecuperarLancamentosFaltantesDoRaw -> Jh
function Jh(e,t){const a=[...e];for(const o of t){const n=Gt(o).replace(/\s+/g," ").trim();if(!n||nt(o)||Fe(n)||ea({...o,_linhaOcr:n})||!(ve(n)||Ln.test(n)))continue;const s=Ge(n);let i=Jd([an({...o,_linhaOcr:n})])[0];i=Yt(i);const c=_o(i),l=Ne(i),u=Na(i);if(c>1e-4){const f=/RENDE|OUROCAP/i.test(n);if(Aa(c,l,a,-1,u)){s&&f&&(a.find(h=>Be(h,l)&&Math.abs(_o(h)-c)<.06&&/RENDE|OUROCAP/i.test(ae(h)))||a.push(Ut(_t(i))));continue}if(!s&&Le(i)>=50&&cs(i)||!!u&&a.some(b=>{var h;return Be(b,l)&&Le(b)>=50&&((h=Na(b))==null?void 0:h.slice(0,24))===u.slice(0,24)&&_o(b)>1e-4}))continue;a.push(Ut(_t(i)));continue}u&&Le(i)>=50&&(a.some(m=>{var p;return Be(m,l)&&Le(m)>=50&&((p=Na(m))==null?void 0:p.slice(0,24))===u.slice(0,24)})||a.push(Ut(_t(i))))}return a}

// extratoRecuperarValoresOrfaosAposMarcadorSaldo -> Fl
function Fl(e,t){const a=String(e??"").replace(/\s+/g," ").trim();if(!a||!t)return[];if(di(a))return[];if(tt(a).filter(r=>r.value>1e-4).length<=1)return[];const n=Ie(a);return n.length===0?[]:n.map(r=>{const s=a.slice(r.start,r.end).trim();return`${t} ${s}`.replace(/\s+/g," ").trim()})}

// extratoRepararRowsHistoricoSomenteDocumentoItau -> Qh
function Qh(e,t=e){return e.map((a,o)=>{const n=ae(a).trim(),r=String(a._linhaOcr??"").replace(/\s+/g," ").trim(),s=Go(n),i=Yi(r),c=!!i&&!ve(r)&&/\d{2}\/\d{2}\/\d{4}/.test(r);if(!s&&!c)return a;const l=s?n:i;if(n&&!s&&H(n))return a;const u=Ve(a);if(u<=1e-4)return a;const f=Ne(a),m=wr(t,f,l,u,o)||wr(e,f,l,u,o);return m?Ho({...a,descricao:m,historicoOperacao:""}):Go(n)?Ho({...a,descricao:"",historicoOperacao:""}):a})}

// extratoRowContemPalavraIgnorada -> Qn
function Qn(e,t){if(t.length===0||rs(e))return!1;const a=pt(String(e._linhaOcr??""));if(a&&(/SALDO\s+ANTERIOR/i.test(a)||e._informativoSaldo==="1"&&/SALDO/i.test(a)))return!!zf(a,t);if(a&&Ae(a))return!1;const o=!!a&&Rt(a),r=[!!a&&zf(a,t)?a:"",e.data];if(o)for(const s of[e.descricao,e.historicoOperacao,e.historico])s&&!GC(s,t)&&r.push(s);else r.push(e.descricao,e.historicoOperacao,e.historico);r.push(e.valorDebito,e.valorCredito,e.valorMisto);for(const s of r){const i=String(s??"").trim();if(i&&xo(i,t))return!0}return!1}

// extratoRowDataNormalizada -> Ne
function Ne(e){const t=String(e.data??"").trim();if(t&&!tn(t)){const n=It(e.data);if(n&&!Jt(t))return n}const o=String(e._linhaOcr??"").replace(/\s+/g," ").trim().match(/^(\d{1,2}\s*[\/\-.]\s*\d{1,2}(?:\s*[\/\-.]\s*\d{2,4})?)/);if(o){const n=It(o[1]);if(n)return n}return String(e.data??"").trim()}

// extratoRowEhFantasmaValorSemHistorico -> ea
function ea(e){const a=String(e._linhaOcr??"").replace(/\s+/g," ").trim().replace(/\s/g,"");return!!/^[-−]?\d[\d.,]+$/.test(a)}

// extratoRowEhResumoPeriodoItau -> Hd
function Hd(e){const t=String(e._linhaOcr??"").replace(/\s+/g," ").trim(),a=ae(e).replace(/\s+/g," ").trim(),o=`${t} ${a}`.trim();return!!(/lan[cç]amentos\s+do\s+per[ií]odo\b/i.test(o)||/lan[cç]amentos\s+do\s+per[ií]odo\s*:/i.test(o)||/saldo\s+total\s+\d{2}\/\d{2}\s+at[eé]\s+\d{2}\/\d{2}/i.test(o)||/raz[aã]o\s+social\s+cnpj\/cpf\s+valor\s*\(r\$\)/i.test(o))}

// extratoRowEhSaldoInformativo -> nt
function nt(e){if(e._informativoSaldo==="1")return!0;const t=ae(e).trim(),a=t.toUpperCase(),o=String(e._linhaOcr??"").replace(/\s+/g," ").trim().toUpperCase(),n=pt(String(e._linhaOcr??""));if(Fe(t))return!(rs(e)||Rt(n||o)||Ae(n||o));if(ri.test(o)||ri.test(a)){const i=(o||a).split(/0800|WWW\.|HTTPS?:\/\/|FALE CONOSCO|24 HORAS/i)[0]??(o||a);if(Pr(i))return!1;const c=ae(e).replace(/\s+/g," ").trim();return!(c&&H(c)&&!Fe(c)&&(Pr(c)||ve(c))&&(_(e.valorDebito??"")||_(e.valorCredito??"")||_(e.valorMisto??"")||0)>1e-4)}if($f(n||o||a)&&!Ae(n||o||a)&&!Rt(n||o||a))return!0;const r=n||a;if(r&&$f(r)&&!Rt(r)&&!UC(r))return!0;if(/\bSISPAG\b/i.test(`${a} ${o}`)&&/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/i.test(`${a} ${o}`)){const i=xt(String(e.valorMisto??"").trim());if(!/^[-−]/.test(i)){const c=_(e.valorDebito??"")||_(e.valorCredito??"")||_(i)||0;if(c>0&&c<2500)return!0}}if(Ls(a)||Ls(o)||uo.test(a)||uo.test(o))return!0;if(/SALDO\s+DISPON[IÍ]VEL|CHEQUE\s+ESPECIAL|CUSTO\s+EFETIVO|TARIFAS\s+VENCIDAS|\(\+\)\s*CHEQUE|\(-\)\s*TARIFAS/i.test(o||a)){const i=n||o||a;return!(i&&Ae(i)||i&&Rt(i))}const s=_(e.valorDebito??"")||_(e.valorCredito??"")||_(e.valorMisto??"")||0;if(s>1e-4){if(Ls(a)||Ls(o)||Ua.test(o||a)||/SALDO\s+BLOQ|BLOQ\.?\s*ANTERIOR/i.test(o||a))return!0;if(/SALDO\s+DO\s+DIA/i.test(o||a)&&Bf(o||a)){const i=la(o||a);if(i.length===1&&ut(o||a,i[0]))return!0}return!!(s>=1e4&&/^[\d\s]{1,4}$/.test(a.trim()))}if(!H(a)){if(/SALDO\s+DO\s+DIA/i.test(o||a))return!0;if(Bf(o||a)){const c=la(o||a);if(c.length===1&&ut(o||a,c[0]))return!0}if(Ua.test(o||a)||/SALDO\s+BLOQ|BLOQ\.?\s*ANTERIOR/i.test(o||a)||!!!It(e.data)&&!a.trim()&&!rt.test(o||a))return!0}return!1}

// extratoRowEhValorColunaSemHistorico -> zh
function zh(e){if((_(e.valorDebito??"")||_(e.valorCredito??"")||_(e.valorMisto??"")||0)<=1e-4)return!1;const a=(e.descricao??e.historicoOperacao??"").trim();if(a&&Go(a))return!0;if(a&&H(a))return!1;const o=String(e._linhaOcr??"").trim();return o&&ve(o)?!1:!!(!o&&!a||o&&_e(o)&&!a&&e._extratoPosProcessado!=="1")}

// extratoRowHistoricoColunaSaldoDesalinhado -> rs
function rs(e){const t=ae(e).trim();if(!Fe(t))return!1;const a=_(e.valorDebito??"")||_(e.valorCredito??"")||_(e.valorMisto??"")||0;if(a<=1e-4)return!1;const o=pt(String(e._linhaOcr??""));if(Ae(o))return!1;if(Rt(o))return!0;const n=String(e.valorMisto??e.valorDebito??e.valorCredito??"").trim();if(/^[-−(]/.test(n))return!0;const r=o?Ie(o).filter(s=>Math.abs(s.value-a)<.06):[];return r.length===1&&ut(o,r[0])?!1:!!(r.length===1&&ve(o))}

// extratoRowTextoCompleto -> Vd
function Vd(e){return[e.data,e.descricao,e.historicoOperacao,e.historico,e._linhaOcr,e.valorDebito,e.valorCredito,e.valorMisto,e.natureza].filter(Boolean).join(" ")}

// extratoRowTextoLinhaFiel -> Gt
function Gt(e){return String(e._linhaOcr??"").replace(/\n+/g," ").replace(/\s+/g," ").trim()||Vd(e)}

// extratoTextoContemPalavraIgnorada -> xo
function xo(e,t){if(t.length===0)return!1;const a=Lr(e),o=TC(e);if(!a&&!o)return!1;if(t.some(n=>/saldo/i.test(n))&&Xi(e)&&!ve(e))return!0;for(const n of t){const r=Lr(n);if(!r)continue;if(a.includes(r))return!0;const s=r.replace(/[^A-Z0-9]/g,"");if(s.length>=4&&o.includes(s))return!0}return!1}

// extratoTextoEhContinuacaoHistorico -> ts
function ts(e){const t=String(e??"").replace(/\s+/g," ").trim();return!t||Et(t)||uo.test(t)||t.length>120?!1:!!(fh.test(t)||/^(FAV\.?|DOC\.?|CNPJ|TRANSFER[EÊ]NCIA|TRANSF\.?)/i.test(t)||/\d{2}\.\d{3}\.\d{3}[\/\s]\d{4}-\d{2}/.test(t)||rt.test(t)&&t.length<=120||t.length<=72&&!/\d{4,}/.test(t.replace(/\D/g,""))||t.length>=8&&t.length<=120&&/[A-Za-zÀ-ú]{4,}/.test(t)&&!na(t)&&!Ui.test(t))}

// extratoTextoEhMarcadorSaldoInformativoOcr -> Xi
function Xi(e){const t=String(e??"").trim();if(!t||ve(t))return!1;const a=Lr(t);if(/^SALDO\s*$/i.test(a)||/SALDO\s+ANTERIOR/i.test(a)||/SALDO\s+BLOQ/i.test(a)||/SALDO\s+DO\s+DIA/i.test(a)||/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/i.test(a))return!0;const o=_d(t);return Dh(o)}

// extratoTextoEhNovoLancamento -> hh
function hh(e){const t=String(e??"").replace(/\s+/g," ").trim();return!t||Et(t)?!1:!!(os(t,/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/.test(t))||rt.test(t)&&t.length<=80)}

// extratoTextoEhRodape -> Et
function Et(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t||Ge(t)&&/\b(PIX|PAGAMENTO|BOLETO|COBRANCA|RENDE|ENVIADO|RECEBIDO)\b/i.test(t))return!1;const a=ie(t);return a?ri.test(a)||uo.test(a)?!0:/\b\d{3,5}\s+\d{3,5}\s+\d{3,5}\b/.test(a)&&a.length>40?!(Ge(t)&&/\b0000\b/.test(t)):a.length>100&&!rt.test(a)?!(Od.test(a)||/\bFAV\.?:/i.test(a)):!1:!1}

// extratoTextoLinhaY -> Ld
function Ld(e,t,a){return e.filter(o=>Math.abs(o.y+o.h/2-t)<=a).sort((o,n)=>o.x-n.x||o.y-n.y).map(o=>o.str).join(" ").replace(/\s+/g," ").trim()}

// extratoTrechoLinhaEhSaldoInformativo -> ls
function ls(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t)return!0;const a=zt(Bt(t)).trim();return Ie(t).length>0&&ui(t)&&(!a||/^[-–—\s]+$/.test(a))?!1:va(t)&&!ve(t)||/^SALDO\s+(?:ANTERIOR|BLOQ)/i.test(t)?!0:VC(t)?!ve(t):!1}

// extratoTrechoTemHistoricoOperacional -> ve
function ve(e){const t=String(e??"").replace(/\s+/g," ").trim();return Ge(t)&&/RENDE|OUROCAP|PAGAMENTO\s+DE\s+BOLETO|COBRANCA/i.test(t)?!0:rt.test(t)||Ln.test(t)}

// extratoValorLancamentoPreferidoDaLinha -> Wn
function Wn(e){const t=String(e??"").replace(/\n+/g," ").replace(/\s+/g," ").trim();if(!t)return null;const a=Ie(t).filter(i=>i.value>1e-4);if(a.length===1)return a[0];if(a.length>1){const i=[...a].sort((c,l)=>c.start-l.start);return i.find(c=>c.hasNature)??i[i.length-1]}const o=la(t);if(o.length===0)return null;if(o.length===1)return o[0];const n=[...o].sort((i,c)=>i.start-c.start),r=n[n.length-2],s=n[n.length-1];if(r&&s){const i=t.slice(r.end,s.start).trim();if((!i||/^[\s\-–—]*$/.test(i))&&r.hasNature)return r}return n.find(i=>i.hasNature)??r??o[0]}

// extratoValorOperacionalJaResolvidoNasRows -> Aa
function Aa(e,t,a,o=-1,n=""){if(e<=1e-4)return!1;const r=It(t)||t.trim(),s=String(n??"").replace(/\s+/g," ").trim().toUpperCase().slice(0,28);return a.some((i,c)=>{if(c===o||(Ne(i),r&&!Be(i,r)))return!1;const l=_o(i);if(Math.abs(l-e)>=.06)return!1;const u=Na(i);if(s&&u){const f=u.replace(/\s+/g," ").trim().toUpperCase().slice(0,28);return f===s||f.startsWith(s.slice(0,12))||s.startsWith(f.slice(0,12))}return u?!0:Le(i)>=50&&l>1e-4})}

// extratoValorTextoEhSaldoDoDia -> ut
function ut(e,t){const o=e.slice(Math.max(0,t.start-64),t.start).trim();return/SALDO\s+DO\s+DIA\s*$/i.test(o)||/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?\s*$/i.test(o)}

// inferDescricaoFromLinhaOcr -> xe
function xe(e,t){var c,l;if(!(e!=null&&e.trim()))return"";const a=kd(e);if(a&&H(a))return zt(a).replace(/\s+/g," ").trim();let o=Bt(e,t.data);o=zt(o),o=o.replace(/\s+/g," ").trim();const n=(c=o.split(/\b(?:Pagamento\s+Pix|Transfer[eê]ncia\s+Pix|FAV\.:|DOC\.:)/i)[0])==null?void 0:c.trim();if(n&&n.length>=5&&H(n))return n;let s=(Qt(o)||o).replace(/^[\s—–-]+/,"").trim();s=zt(s).replace(/\s+/g," ").trim();const i=s.match(/\b(?:TEDRECEBIDA?\d{3}\.\d{4}|TED\s*RECEB(?:IDA)?\d{3}\.\d{4}|TEDRECEBIDA?|TED\s*RECEB[\w\s./-]*|(?:E|PP|O)\s+RECEB[\w\s./-]*|SISPAG[\w\s./-]+|TAR(?:PLANOADAPT)?[\w\s./-]+|PAGAMENTOS?\s*TRIB[\w\s./-]*|PIXRECEB[\w\s./-]*|RECEBIMENTOS[\w\s./-]+|Pagamento\s+Pix[\w\s./-]*)(?:\s+[\wÀ-ú0-9./-]+){0,16}/i);if((l=i==null?void 0:i[0])!=null&&l.trim()){const u=zt(i[0]).replace(/\s+/g," ").trim();if(u&&H(u))return u}return s&&H(s),s}

// inferExtratoDescricaoFromCluster -> Ys
function Ys(e,t,a,o){const n=new Set;for(const g of a.values())for(const v of g)n.add(v);const r=Math.max(4,o*.008),s=["valorDebito","valorCredito","valorMisto","valor"];let i=o*.52;for(const g of s){const v=t[g];v&&v.start!==v.end&&(i=Math.min(i,v.start-r))}const c=t.data;let l=o*.14;c&&c.start!==c.end&&(l=c.end+r);const u=t.descricao,f=[],m=new Set,p=g=>{const v=g.str.replace(/\s+/g," ").trim();if(!yl(v))return;const C=ie(v);m.has(C)||(m.add(C),f.push(g))};for(const g of["descricao","historicoOperacao"])for(const v of a.get(g)??[])p(v);for(const g of e){const v=g.x+g.w/2;v<l&&ns.test(ie(g.str))||v>=i||n.has(g)||p(g)}if(u&&u.start!==u.end)for(const g of e){const v=g.x+g.w/2;v>=u.start-r*2&&v<=u.end+r*2&&p(g)}if(f.length===0)for(const g of e){const v=g.x+g.w/2;v>=l&&v<i&&p(g)}const h=Jn(e).length>1?[...f].sort((g,v)=>g.y-v.y||g.x-v.x):Ad(f,e);h.sort((g,v)=>g.y-v.y||g.x-v.x);const x=h.map(g=>g.str.replace(/\s+/g," ").trim()).join(" ").replace(/\s+/g," ").trim();return Re(x)}

// inferirNaturezaValorExtratoHit -> qo
function qo(e,t){const a=e.slice(t.start,t.end).trim().replace(/\s+[DCdc]\s*$/i,"").trim();if(et(e,t))return"D";if(t.value>1e-4&&!/^[-−]/.test(a)){const o=tt(e);if(o.length>=2){const n=[...o].sort((s,i)=>s.start-i.start),r=n.findIndex(s=>s.start===t.start&&s.end===t.end&&Math.abs(s.value-t.value)<.02);if(r>=0){const s=n.slice(r+1).find(c=>et(e,c));if(s&&!ec(e,t,s))return"D";const i=n[r+1];if(i&&!et(e,i)&&/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?/i.test(e)&&ve(e.slice(0,t.start))){const c=e.slice(0,t.start);return Mr(c)?"C":"D"}}}}return Pe(a,t.value)}

// mergeExtratoDescricaoContinuacao -> Tl
function Tl(e,t=[]){var o;const a=[];for(const n of e){const r=_(n.valorDebito??"")||_(n.valorCredito??"")||_(n.valorMisto??"")||0;if(t.length>0&&r<=1e-4&&Qn(n,t))continue;const s=_(n.valorDebito??"")||_(n.valorCredito??"")||_(n.valorMisto??"")||0,i=(n.descricao??"").trim(),c=(n.historicoOperacao??"").trim();if(s<=1e-4&&(Et(i)||Et(c)))continue;const l=Ge(String(n._linhaOcr??"")),u=l&&i&&H(i)?i.trim():Re(i),f=l&&c&&H(c)?c.trim():Re(c);let m=u||f;if(m&&!H(m)&&((o=n._linhaOcr)!=null&&o.trim())){const h=xe(n._linhaOcr,n);H(h)&&(m=h)}if(n._splitLanc==="1"){a.push({...n,descricao:u||n.descricao,historicoOperacao:f||n.historicoOperacao});continue}const p=String(n._linhaOcr??"").trim();if(p&&Ie(p).length>0&&s<=1e-4){a.push({...n,descricao:u,historicoOperacao:f});continue}if(s<=1e-4&&m&&a.length>0){if(Et(m))continue;if(hh(m)){a.push({...n,descricao:u,historicoOperacao:f});continue}if(!ts(m))continue;const h=a[a.length-1];if((_(h.valorDebito??"")||_(h.valorCredito??"")||_(h.valorMisto??"")||0)<=1e-4)continue;if(u){const g=(h.descricao??"").trim();h.descricao=g?`${g} ${u}`:u}if(f){const g=(h.historicoOperacao??"").trim();h.historicoOperacao=g?`${g} ${f}`:f}continue}if(s<=1e-4&&!m){if(p&&ve(p)){a.push({...n,descricao:u,historicoOperacao:f});continue}continue}const b={...n};u&&(b.descricao=u),f&&(b.historicoOperacao=f),b.descricao&&(b.descricao=Re(b.descricao)),a.push(b)}return a}

// mergeExtratoValorOrfao -> Fr
function Fr(e){const t=[];for(let a=0;a<e.length;a++){const o=e[a];if(zd(o)){t.push({...o});continue}let n=Ve(o);const r=ae(o).trim(),s=Ne(o),i=String(o._linhaOcr??"").replace(/\s+/g," ").trim(),c=Fe(r),l=!!i&&Ae(i);if(n<=1e-4&&l&&i){const f=tt(i),m=Xo(i,f);m&&(n=m.value)}if(n>1e-4&&(!r||c||l||!s||Jt(o.data??"")||_e(i)||o._valorRecuperadoSaldo==="1")&&n<5e5){const f=PC(t,s,n),m=Ve(o)>1e-4?o:an({...o,...l&&i?{_valorRecuperadoSaldo:"1",_linhaOcrSaldoOrigem:i}:{}});if(f){if(!fo(f,n)){Lo(f,m);continue}if(Math.abs(Ve(f)-n)<.011)continue}const p=jC(e,a,s);if(p&&!fo(p,n)){Lo(p,m);continue}if(c||l){t.push({...o,descricao:"",historicoOperacao:"",_valorRecuperadoSaldo:"1",_linhaOcrSaldoOrigem:l?i:o._linhaOcrSaldoOrigem??i});continue}}t.push({...o})}return t}

// normalizeLinhaOcrParaSplit -> pt
function pt(e){return String(e??"").replace(/[\u2013\u2014\u2212]/g," — ").replace(/\s+/g," ").trim()}

// parearValoresOrfaosComHistoricoSemValor -> kn
function kn(e){const t=e.map(o=>{let n=an({...o});const r=String(n._linhaOcr??"").replace(/\s+/g," ").trim();return Ge(r)&&/RENDE|OUROCAP|PAGAMENTO\s+DE\s+BOLETO|COBRANCA/i.test(r)&&(n=Yt(n)),n}),a=new Set;for(let o=0;o<t.length;o++){if(a.has(o))continue;const n=t[o];if(zd(n))continue;let r=Ve(n);const s=String(n._linhaOcr??"").replace(/\s+/g," ").trim();if(r<=1e-4&&_e(s)){const l=Ie(s);l.length===1&&(r=l[0].value)}if(r<=1e-4||!(_e(s)||ea(n))||Ge(s)&&/RENDE|OUROCAP/i.test(s))continue;const c=Ne(n);for(let l=o-1;l>=0&&o-l<=15;l--){if(a.has(l))continue;const u=t[l];if(Ne(u),!(c&&!Be(u,c))&&!fo(u,r)&&!(Le(u)<50)){Lo(u,n),a.add(o);break}}if(!a.has(o)){for(let l=o+1;l<t.length&&l-o<=5;l++){if(a.has(l))continue;const u=t[l];if(Ne(u),!(c&&!Be(u,c))&&!fo(u,r)&&!(Le(u)<50)){Lo(u,n),a.add(o);break}}if(!a.has(o)){const l=MC(t,c,r,o);l&&(Lo(l,n),a.add(o))}}}return t.filter((o,n)=>!a.has(n))}

// parseOcrIgnoreLineWords -> Ki
function Ki(e){if(!(e!=null&&e.trim()))return[];const t=new Set,a=[];for(const o of e.split(/[,;\n]+/)){const n=o.trim().replace(/\s+/g," ");if(n.length<2)continue;const r=n.toLocaleUpperCase("pt-BR");t.has(r)||(t.add(r),a.push(n))}return a}

// postProcessExtratoOcrRows -> Xd
function Xd(e,t,a){if(a!=null&&a.preserveSegmentRows){const v=Xs(e,t),C=(a==null?void 0:a.ignoreLineWords)??[],N=Za(v,C,{preservarLinhasComValor:!0}),S=Th(N),E=Tl(S,C),O=QC(E),y=kn(O),M=JC(Bh(y)),A=xr(M),I=wh(A),R=kn(xr(I)),V=eu(R,v).map(wd),K=Qh(V,[...v,...e]),re=Ah(Ml(K)),q=Jd(kh(re)).filter(J=>!ea(J)).filter(J=>!nt(J));return Za(q,C).map(J=>Ut(ra(Yt(_t(J)))))}const o=Ud(e),n=Xs(o,t),r=a!=null&&a.preserveSegmentRows?n:Fr(n),s=_r(r),i=(a==null?void 0:a.ignoreLineWords)??[],c=Za(s,i),l=a!=null&&a.preserveSegmentRows?c:Tl(c,i),u=Za(l,i),f=_r(u),m=Ml(f),p=a!=null&&a.preserveSegmentRows?m:Fr(m),x=Xs(p,t).map(v=>{var N;const C=_t(v);if(!ae(C)&&((N=C._linhaOcr)!=null&&N.trim())){const S=xe(C._linhaOcr,C);S&&!na(S)&&(C.descricao=S)}return C}).filter(v=>{if(v._valorRecuperadoSaldo==="1"||Ve(v)<=1e-4)return!0;const N=ae(v).trim();if(N&&H(N))return!0;const S=String(v._linhaOcr??"").replace(/\s+/g," ").trim();if(S&&ve(S))return!0;const E=String(v._linhaOcrSaldoOrigem??"").replace(/\s+/g," ").trim();if(E&&ve(E))return!0;const O=E||S;return!(/SALDO\s+(?:TOTAL\s+)?DISPON[IÍ]VEL(?:\s+DIA)?|SALDO\s+DO\s+DIA/i.test(O)&&_e(S)&&!Ae(O))});return xr(x).map(v=>Ut(v))}

// prepararExtratoOcrRowsParaRevisao -> r1
function r1(e,t){return Xd(e,t==null?void 0:t.statementYear,{ignoreLineWords:t==null?void 0:t.ignoreLineWords,preserveSegmentRows:(t==null?void 0:t.preserveSegmentRows)??!0}).map(a=>({...a,_extratoPosProcessado:"1"}))}

// reconciliarPartesLinhaOcrAposSplitSaldo -> Wi
function Wi(e){return Ph(e)}

// removerLinhasComPalavrasIgnoradas -> Za
function Za(e,t,a){return t.length===0?e:e.filter(o=>{if(nt(o)||Fe(ae(o)))return!1;if(!Qn(o,t))return!0;if(a!=null&&a.preservarLinhasComValor){const r=pt(String(o._linhaOcr??""));if(r&&Rt(r)||r&&Ae(r))return!0}return!1})}

// repararExtratoRowsPosProcessados -> Xh
function Xh(e){const t=kn(e),a=Bh(t).filter(s=>!ea(s)),o=xr(a),n=wh(o),r=kn(xr(n));return Jd(kh(r)).map(s=>Ut(ra(Yt(_t(s)))))}

// repararHistoricoBbExtratoRow -> Yt
function Yt(e){const t=Gt(e);if(!Ge(t))return e;const a=xe(t,e).trim();if(!a||!H(a))return e;const o=ae(e).trim();return d1(a,o)?{...e,descricao:a,historicoOperacao:""}:e}

// repararHistoricoBbExtratoRows -> a0
function a0(e){return e.map(Yt)}

// repararHistoricoItauExtratoRow -> ra
function ra(e){const t=Gt(e);if(!is(t))return e;const a=xe(t,e).trim();if(!a||!H(a))return e;const o=ae(e).trim();return gr(o)?Ho({...e,descricao:a,historicoOperacao:""}):u1(a,o)?Ho({...e,descricao:a,historicoOperacao:""}):e}

// repararHistoricoItauExtratoRows -> t0
function t0(e){return e.map(ra)}

// resolverExtratoSaldoAnteriorImportacao -> Rh
function Rh(e){const t=[...e.conciliacaoRawRows??[],...e.rows],a=Qi(t,e.ocrText);if(a>=1e3)return a;const o=e.saldoAnteriorInformado;if(o==null||o<100)return 0;const n=e.items.filter(s=>s.nature==="C").reduce((s,i)=>s+Math.abs(Number(i.value)||0),0),r=e.items.filter(s=>s.nature==="D").reduce((s,i)=>s+Math.abs(Number(i.value)||0),0);return $C({informado:o,saldoFinal:e.saldoFinalEsperado,credits:n,debits:r,documentado:a})?0:o}

// resolverSaldoAnteriorParaMetaExtrato -> FC
function FC(e){const t=[...e.conciliacaoRawRows??[],...e.rows??[]],a=Qi(t,e.ocrText);return a>=1e3?a:void 0}

// saldoAnteriorDocumentadoNoExtrato -> Qi
function Qi(e,t){const a=Ji(e);if(a>=1e3)return a;if(t!=null&&t.trim()){const o=Oh(t);if(o>=1e3)return o}return 0}

// sanitizeExtratoDataOcrToken -> It
function It(e){const t=String(e??"").trim();if(!t||Jt(t)||tn(t))return"";const a=t.match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?/);if(!a)return"";const o=a.index??0;if(ii(t,o))return"";const n=a[1].padStart(2,"0"),r=a[2].padStart(2,"0"),s=parseInt(n,10),i=parseInt(r,10);if(s<1||s>31||i<1||i>12)return"";const c=a[3]?a[3].length===2?`20${a[3]}`:a[3]:"";return c?`${n}/${r}/${c}`:`${n}/${r}`}

// sanitizeExtratoOcrRowColumns -> _t
function _t(e){var u,f,m,p,b;const t={...e},a=(u=t.data)==null?void 0:u.trim();if(t.data&&tn(t.data)){const h=Zi(String(t._linhaOcr??""));t.data=h||""}t.descricao&&(t.descricao=Bt(t.descricao,a)),t.historicoOperacao&&(t.historicoOperacao=Bt(t.historicoOperacao,a));const o=(f=t.valorDebito)==null?void 0:f.trim(),n=(m=t.valorCredito)==null?void 0:m.trim(),r=(p=t.valorMisto)==null?void 0:p.trim(),s=h=>{if(!h||!t.descricao)return;const x=ie(t.descricao),g=ie(h);if(x===g){t.descricao="";return}x.includes(g)&&(t.descricao=t.descricao.replace(h," ").replace(/\s+/g," ").trim())};s(o),s(n),s(r);let i=ae(t);const c=Ge(String(t._linhaOcr??"")),l=is(String(t._linhaOcr??""));if(i&&H(i)&&(c||l)||(i=Re(i)),i&&!na(i))if(c){const h=Yt({...t,descricao:i});t.descricao=h.descricao||i}else if(l){const h=ra({...t,descricao:i});t.descricao=h.descricao||i}else t.descricao=Bt(i,a);else if(i&&na(i)&&(l||c)){const h=xe(t._linhaOcr,t).trim();if(h&&H(h)){const x=l?ra({...t,descricao:h}):Yt({...t,descricao:h});t.descricao=x.descricao||h}else t.descricao=""}else i&&na(i)&&(t.descricao="");if(!ae(t).trim()&&((b=t._linhaOcr)!=null&&b.trim())){const h=xe(t._linhaOcr,t);if(h&&H(h)&&!Fe(h)&&!na(h)){const x=(t.descricao??t.historicoOperacao??"").trim();if(!x||h.length>x.length+8||!H(x)){const v=c||l?h:Re(h);t.descricao=c?Yt({...t,descricao:v}).descricao||v:l?ra({...t,descricao:v}).descricao||v:Bt(v,a)}}}if(c){const h=Yt(t);h.descricao&&(t.descricao=h.descricao)}if(l){const h=ra(t);h.descricao&&(t.descricao=h.descricao)}return Fe(ae(t))&&(t.descricao="",t.historicoOperacao=""),Ho(t)}

// sanitizeExtratoValorOcrToken -> xt
function xt(e){let t=String(e??"").trim();if(!t)return"";(Ge(t)||/[—–−]/.test(t)||/^G\d/i.test(t)||/\//.test(t))&&(t=ti(t));const a=Lt(t),o=/^[-−(]/.test(t),n=(f,m,p)=>p?`${o&&!f.startsWith("-")?"-":""}${f}`.trim():m==="D"?`-${f.replace(/^[-−]/,"")}`:o?`-${f.replace(/^[-−]/,"")}`:f,r=t.match(/^[-−(]?\s*(\d),(\d{3}),(\d{2})\s*([DCdc])\s*\*?\s*$/);if(r){const f=`${r[1]}.${r[2]},${r[3]}`,m=r[4].toUpperCase()==="D"?"D":"C";return n(f,m,!1)}const s=t.match(/^[-−(]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})([DCdc])\s*$/i);if(s){const f=s[1],m=s[2].toUpperCase()==="D"?"D":"C";return n(f,m,!1)}const i=t.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d,\d{3},\d{2})(\s*)([DCdc])\s*\*?\s*$/i);if(i){const f=i[1].match(/^(\d),(\d{3}),(\d{2})$/),m=f?`${f[1]}.${f[2]},${f[3]}`:i[1];if(Kt(m)>0||/^0,\s*00$/i.test(m)){const p=(i[2]??"").trim().length>0,b=i[3].toUpperCase()==="D"?"D":"C";return n(m,b,p)}}let c=t.replace(/^[(\s]*[-−]?/,"").replace(/[)\s]+$/,"").replace(/[A-Za-zÀ-ú]+/g," ").replace(/\s+/g," ").trim();const l=c.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g)??[];let u="";for(const f of l)if(Kt(f)>0){u=f;break}if(!u){const f=c.replace(/[^\d,.\-−]/g,"");if(!f||!/,\d{2}$/.test(f.replace(/\./g,"")))return"";u=f.replace(/\./g,(m,p,b)=>{const h=b.slice(p+1);return/,\d{2}$/.test(h)?m:""})}return u?a==="D"?`-${u.replace(/^[-−]/,"")}`:`${o&&!u.startsWith("-")?"-":""}${u}`.trim():""}

// scanValoresLancamentoLinhaExtrato -> la
function la(e){return tt(e).filter(t=>t.hasNature&&t.value>1e-4)}

// scanValoresParaSplitExtrato -> Ie
function Ie(e){const a=tt(e).filter(r=>r.value>1e-4).filter(r=>!ut(e,r));if(a.length<=1)return a;if(a.length===2){const r=[...a].sort((c,l)=>c.start-l.start),[s,i]=r;if(s&&i&&!et(e,s)&&et(e,i)&&ec(e,s,i))return[i]}const o=$h(e,a);if(o)return o;const n=a.filter(r=>et(e,r));return n.length===1?n:HC(e,a)}

// scanValoresTextoLinhaExtrato -> tt
function tt(e){let t=String(e??"").replace(/\n+/g," ").replace(/\s+/g," ").trim();if(!t)return[];Ge(t)&&(t=Yn(t));const a=[],o=[];wf.lastIndex=0;let n;for(;(n=wf.exec(t))!==null;){const f=n.index??0,m=f+n[0].length;if($l(t,f,m))continue;const p=n[4],b=_(`${n[1]}.${n[2]},${n[3]}${p??""}`);b<=1e-4||(o.push({start:f,end:m}),a.push({value:b,nature:p?p.toUpperCase()==="D"?"D":"C":Pe(`${n[1]}.${n[2]},${n[3]}`,b),start:f,end:m,hasNature:!!p}))}_f.lastIndex=0;let r;for(;(r=_f.exec(t))!==null;){const f=r[0],m=r.index??0,p=m+f.length;if(BC(m,p,o)||$l(t,m,p))continue;const b=r[1]??"",h=r[2],x=b.match(/^(\d),(\d{3}),(\d{2})$/),g=x?`${x[1]}.${x[2]},${x[3]}${h??""}`:f;if(yh(f,t.slice(Math.max(0,m-40),m)))continue;const v=_(g);if(v<=1e-4)continue;const C=h?h.toUpperCase()==="D"?"D":"C":Pe(f,v);a.push({value:v,nature:C,start:m,end:p,hasNature:!!h})}const s=a.filter(f=>f.hasNature&&f.value>1e-4),i=s.length>0?s:a.filter(f=>f.value>1e-4),c=new Set,l=i.sort((f,m)=>f.start-m.start),u=l.filter((f,m)=>{const p=`${f.start}|${f.value.toFixed(2)}|${f.nature??""}`;if(c.has(p))return!1;if(c.add(p),m===0)return!0;const b=l[m-1];return!(Math.abs(b.value-f.value)<.011&&(b.nature??"")===(f.nature??"")&&f.start-b.end<=48)});return KC(t,u)}

// splitClusterPorAncorasLancamento -> Sh
function Sh(e,t,a=.48){if(e.length<=1)return[e];const o=as(e,t,a),n=[];for(let s=0;s<o.length;s++)jr(o[s])&&n.push(s);if(n.length<=1)return[e];const r=[];for(let s=0;s<n.length;s++){const i=n[s],c=(n[s+1]??o.length)-1,l=new Set,u=[],f=s>0?n[s-1]:-1;let m=i-1;for(;m>f&&m>=0&&!o[m].hasValor;){for(const p of o[m].items)l.has(p)||(l.add(p),u.unshift(p));m--}for(let p=i;p<=c;p++)for(const b of o[p].items)l.has(b)||(l.add(b),u.push(b));u.length>0&&r.push(u.sort((p,b)=>p.y-b.y||p.x-b.x))}return r.length>0?r:[e]}

// splitClusterPorFaixasValorY -> Eh
function Eh(e,t,a=.48){if(e.length<3)return[e];const o=e.map(m=>m.h).filter(m=>m>0).sort((m,p)=>m-p),n=o[Math.floor(o.length/2)]||12,r=Math.max(5,n*a),s=Math.max(t*.35,0),i=e.filter(m=>{if(m.x<s)return!1;const p=ie(m.str);return lo.lastIndex=0,lo.test(p)&&_(p)>1e-4});if(i.length<=1)return[e];const c=[];for(const m of i){const p=Ot(m);let b=c.find(h=>Math.abs(Ot(h[0])-p)<=r);b?b.push(m):c.push([m])}if(c.length<=1)return _n(e);const l=new Set,u=[];for(const m of c){const p=m.reduce((h,x)=>h+Ot(x),0)/m.length,b=e.filter(h=>Math.abs(Ot(h)-p)<=r);for(const h of b)l.add(h);if(b.sort((h,x)=>h.x-x.x||h.y-x.y),b.length>0){const h=_n(b);u.push(...h.length>0?h:[b])}}const f=e.filter(m=>!l.has(m));return f.length>0&&u.push(f),u.filter(m=>m.length>0)}

// splitClusterPorLinhasY -> Jn
function Jn(e,t){if(e.length===0)return[];const a=t??Math.max(6,Rd(e)*.55),o=[...e].sort((r,s)=>r.y-s.y||r.x-s.x),n=[];for(const r of o){const s=Ot(r);let i=n.find(c=>Math.abs(Ot(c[0])-s)<=a);i?i.push(r):n.push([r])}for(const r of n)r.sort((s,i)=>s.x-i.x);return n}

// splitClusterPorMultiplosValores -> _n
function _n(e){if(e.length<3)return[e];const t=[...e].sort((i,c)=>i.x-c.x),a=t.filter(i=>{const c=ie(i.str);return lo.lastIndex=0,lo.test(c)&&_(c)>1e-4});if(a.length<2)return[e];const o=a.map(i=>ie(i.str));if(o.every(i=>i===o[0])&&a.every(i=>Math.abs(i.x-a[0].x)<24)&&a.every(i=>Math.abs(i.y+i.h/2-(a[0].y+a[0].h/2))<5))return[e];const r=[];for(let i=0;i<a.length-1;i++){const c=a[i],l=a[i+1];r.push((c.x+c.w+l.x)/2)}const s=Array.from({length:a.length},()=>[]);for(const i of t){const c=i.x+i.w/2;let l=0;for(let u=0;u<r.length;u++)c>=r[u]&&(l=u+1);s[l].push(i)}return s.filter(i=>i.length>0)}

// splitExtratoOcrRowsPorLancamentosFundidos -> _r
function _r(e){const t=[];for(const a of e)t.push(...Lh(a));return t}

// splitLinhaOcrPorMarcadorSaldoInformativo -> Zn
function Zn(e){const t=pt(e);if(!t)return[];kf.lastIndex=0;const a=t.split(kf).map(o=>o.trim()).filter(Boolean);return a.length<=1?[t]:a}

// stripDateTokensFromExtratoText -> Bt
function Bt(e,t){let a=String(e??"").trim();if(!a)return"";const o=[],n=r=>{const s=`§BBD${o.length}§`;return o.push(r),s};if(a=a.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{2,4}(?:-\d{2})?\b/g,r=>n(r)),a=a.replace(/\b\d{2,3}(?:\.\d{3}){2,}(?:\.\d{3})?\b/g,r=>gd(r)?n(r):r),a=a.replace(/\b\d{1,2}\.\d{3}\b/g,r=>Vp(r)?n(r):r),a=Ih(a,o,"§BBD"),a=a.replace(/\b(\d{2,3}\/\d{2})\b/g,r=>ss(r)?n(r):r),a=Nh(a,o,"§BBD"),a=a.replace(/\b(\d{3}\.\d{4}\.[\wÀ-ú.-]+)/gi,r=>n(r)),t!=null&&t.trim()){const r=t.trim();a=a.replace(r," ");const s=ie(r);s&&(a=a.split(/\s+/).filter(i=>ie(i)!==s).join(" "))}return a=a.replace(new RegExp(Ui.source,"g"),(r,s)=>ii(a,s)?r:" "),a=a.replace(/\b\d{3}\.\d{4}\b(?=\s+(?:[A-Z]|\.))/g,(r,s)=>tn(r)||ii(a,s)?r:" "),o.forEach((r,s)=>{a=a.replace(`§BBD${s}§`,r)}),a.replace(/\s+/g," ").trim()}

// stripValorTokensFromExtratoText -> zt
function zt(e){let t=String(e??"");const a=[],o=n=>{const r=`§BBH${a.length}§`;return a.push(n),r};return t=t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{2,4}(?:-\d{2})?\b/g," "),t=t.replace(/\b\d{2,3}(?:\.\d{3}){2,}(?:\.\d{3})?\b/g,n=>gd(n)?o(n):n),t=Nh(t,a,"§BBH"),t=Ih(t,a,"§BBH"),t=t.replace(/\b(\d{3}\.\d{4}\.[\wÀ-ú.-]+)/gi,n=>o(n)),t=t.replace(/(?:[Rr]\$?\s*)?[-−(]?\s*\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g," "),t=t.replace(/[-−(]?\s*\d+[.,]\d{2}\b(?!\d)/g," "),t=t.replace(/(?:^|\s)[-−]\s*\d{1,3}(?:\.\d{3})+\s*(?!\d)/g," "),t=t.replace(/\b\d{1,2}\.\d{3}\b/g,n=>Vp(n)?o(n):n),t=t.replace(/\b[DCdc]\b/g," "),t=t.replace(/\s+/g," ").trim(),a.forEach((n,r)=>{t=t.replace(`§BBH${r}§`,n)}),t}

// tokenEhCodigoTedItauOcr -> tn
function tn(e){const t=String(e??"").trim();return t?/^\d{3}\.\d{4}(?:\.|$|\s)/.test(t)||new RegExp("(?<=[A-Za-zÀ-ú])\\d{3}\\.\\d{4}").test(t)?!0:/\b\d{3}\.\d{4}\./.test(t):!1}

// tokenEhPlanoOuReferenciaItauSlash -> ss
function ss(e){const t=String(e??"").trim().match(/^(\d{2,3})\/(\d{2})$/);if(!t)return!1;const a=parseInt(t[1],10),o=parseInt(t[2],10);return!(a>=1&&a<=31&&o>=1&&o<=12)}

// tokenEhValorExtrato -> na
function na(e){const t=String(e??"").replace(/\s+/g," ").trim();if(!t||Ln.test(t)&&/[A-Za-zÀ-ú]{3,}/.test(t)&&t.length>12&&!/(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/.test(t))return!1;if(/^R\$?\s*[-−(]?[\d.,]+$/.test(t)||/^[-−(]?\s*\d+[.,]\d{2}$/.test(t.replace(/\s/g,"")))return!0;if(_(t)<=1e-4)return!1;const o=t.replace(/\s/g,"");return/^[-−(]?\d+[.,]\d{2}$/.test(o)?!0:t.replace(/[^\d,]/g,"").length>=3&&/,\d{2}$/.test(o)}

// trimExtratoOcrRowsToLancamentos -> Ud
function Ud(e){if(e.length===0)return e;let t=-1,a=-1;for(let n=0;n<e.length;n++){const r=ae(e[n]);uo.test(r)||zc(e[n])&&(t<0&&(t=n),a=n)}if(t<0)return e.filter(n=>{if(zc(n))return!0;const r=pt(String(n._linhaOcr??""));return!!r&&Rt(r)});let o=a;for(let n=a+1;n<e.length;n++){const r=e[n];if(nt(r))break;const s=pt(String(r._linhaOcr??""));if(!s)break;if(zc(r)||Rt(s)||ve(s)&&Ie(s).some(i=>i.value>1e-4)){o=n;continue}break}return e.slice(t,o+1)}
