// Circub Compass: research, compare and budget views.
var S={m:"Merkato, Addis Ababa",tab:"r",on:{},f:"all",more:false,bud:"",cmp:{}};
function shortN(m){return m.split(",")[0]}
I.forEach(function(i){S.on[i.n]=1});
["Merkato, Addis Ababa","Walmara","Adama","Bahir Dar"].forEach(function(m){S.cmp[m]=1});
var $=function(id){return document.getElementById(id)};
var E=function(x){return Math.round(x).toLocaleString("en-US")+" ETB"};
var key=Object.keys(M);
function posts(m,i){var mi=key.indexOf(m),ix=I.indexOf(i),o=[];
 for(var k=0;k<i.p;k++){var t=((k*37+ix*11)%i.p)/(i.p>1?i.p-1:1),tr=4+((k*5+ix*3)%30);
  o.push({item:i.n,price:Math.round((i.lo+(i.hi-i.lo)*t)*M[m].f/5)*5,who:N[(k*3+ix*2+mi)%10],place:M[m].a[(k+ix)%3],d:(k*3+ix)%28+1,tr:tr})}
 return o}
function st(m,i){var p=posts(m,i).map(function(x){return x.price});
 return{lo:Math.min.apply(0,p),hi:Math.max.apply(0,p),av:p.reduce(function(a,b){return a+b},0)/p.length,n:p.length}}
function sel(){return I.filter(function(i){return S.on[i.n]})}
function pill(v){return '<span class="pill'+(v<=0?' d':'')+'">'+(v>0?'+':'')+v+'%</span>'}
function ago(d){return d===1?"yesterday":d+" days ago"}
function research(){var s=sel();if(!s.length)return'<div class="card">Pick at least one item from your list.</div>';
 var n=0,lo=0,av=0,hi=0,ch=0,w=0,all=[];
 s.forEach(function(i){var x=st(S.m,i);n+=x.n;lo+=x.lo;av+=x.av;hi+=x.hi;ch+=i.ch*x.n;w+=x.n;all=all.concat(posts(S.m,i))});
 ch=Math.round(ch/w);var place=S.m.split(",")[0];
 var fl=S.f==="all"?all:all.filter(function(p){return p.item===S.f});
 fl.sort(function(a,b){return a.price-b.price});var mn=fl[0]&&fl[0].price;
 var rows=(S.more?fl:fl.slice(0,6)).map(function(p){return'<div class="post"><div class="av">'+p.who[0]+'</div><div class="pm"><b>'+p.who+(p.tr>15?'<span class="ok">Trusted</span>':'')+'</b><span>'+p.item+' at '+p.place+' · '+ago(p.d)+' · '+p.tr+' posts</span></div><div class="pr">'+E(p.price)+(p.price===mn?'<span class="tag">Lowest</span>':'')+'</div></div>'}).join("");
 var chips='<div class="chips" style="margin:12px 0 0">'+['all'].concat(s.map(function(i){return i.n})).map(function(k){return'<button class="chip" data-f="'+k+'" aria-pressed="'+(S.f===k)+'">'+(k==="all"?"All items":k)+'</button>'}).join("")+'</div>';
 var top=s.slice().sort(function(a,b){return b.ch-a.ch})[0];
 return'<section class="card" aria-live="polite"><p class="lead">You are planning to visit '+place+' '+$("wh").value.toLowerCase()+'.</p><p class="big">Here are '+n+' prices posted recently for the '+s.length+' product'+(s.length>1?'s':'')+' on your list.</p>'+
 '<div class="stats"><div class="stat a"><b>'+E(av)+'</b><span>Average</span></div><div class="stat l"><b>'+E(lo)+'</b><span>Lowest</span></div><div class="stat h"><b>'+E(hi)+'</b><span>Highest</span></div></div>'+
 '<div class="range"><i style="left:'+((av-lo)/(hi-lo)*100)+'%"></i></div><div class="rl"><span>'+E(lo)+'</span><span>'+E(hi)+'</span></div>'+
 '<div class="trend">'+pill(ch)+'<span>Prices '+(ch>0?'rose':'fell')+' '+Math.abs(ch)+'% this month.</span></div></section>'+
 '<h2>People who posted these prices</h2><div class="card">'+chips+rows+(fl.length>6?'<button class="btn g" id="more">'+(S.more?'Show fewer':'Show all '+fl.length+' posts')+'</button>':'')+'</div>'+
 '<div class="tip"><p>'+(top.ch>5?top.n+' is up '+top.ch+'% this month. Budget toward the higher end and compare a few stalls.':'Prices on your list are steady. Aim near the lowest price and haggle from there.')+'</p></div>'}
function tot(m,s){return s.reduce(function(a,i){return a+st(m,i).av*i.q},0)}
function compare(){var s=sel();if(!s.length)return'<div class="card">Pick at least one item from your list.</div>';
 var ms=key.filter(function(m){return S.cmp[m]});
 var pick='<p class="lead" style="margin-bottom:8px">Choose the locations to compare.</p><div class="chips" role="group" aria-label="Locations to compare">'+key.map(function(m){return'<button class="chip" data-c="'+m+'" aria-pressed="'+(!!S.cmp[m])+'">'+shortN(m)+'</button>'}).join("")+'</div>';
 if(ms.length<2)return'<div class="card">'+pick+'<p style="margin:0">Select at least two locations to see them side by side.</p></div>';
 var T2={},best=null;ms.forEach(function(m){T2[m]=tot(m,s);if(!best||T2[m]<T2[best])best=m});
 var head=ms.map(function(m){return'<th class="'+(m===S.m?'sel':'')+'"><button data-m="'+m+'" title="Use as my location">'+shortN(m)+'</button></th>'}).join("");
 var body=s.map(function(i){var v=ms.map(function(m){return st(m,i).av}),mv=Math.min.apply(0,v);
  return'<tr><td>'+i.n+' <span style="color:var(--mute)">('+i.u+')</span></td>'+v.map(function(x){return'<td class="'+(x===mv?'min':'')+'">'+E(x)+'</td>'}).join("")+'</tr>'}).join("");
 var foot=ms.map(function(m){return'<td class="'+(m===best?'min':'')+'">'+E(T2[m])+'</td>'}).join("");
 var mine=tot(S.m,s),save=mine-T2[best];
 return'<div class="card">'+pick+'<div class="scroll"><table><thead><tr><th>Item</th>'+head+'</tr></thead><tbody>'+body+'</tbody><tfoot><tr><td>Your list (with quantities)</td>'+foot+'</tr></tfoot></table></div><p class="note" style="margin-bottom:0">Tap a location name to make it your shopping location.</p></div>'+
 '<div class="tip"><p>'+(best===S.m?'<b>'+shortN(S.m)+'</b> is the cheapest of the locations you picked.':'Among these locations your list is cheapest in <b>'+shortN(best)+'</b>, about '+E(save)+' less than '+shortN(S.m)+'.')+'</p></div>'}
function plan(){var s=sel();if(!s.length)return'<div class="card">Pick at least one item from your list.</div>';
 var lo=0,av=0,hi=0,L=shortN(S.m);
 var rows=s.map(function(i){var x=st(S.m,i);lo+=x.lo*i.q;av+=x.av*i.q;hi+=x.hi*i.q;
  return'<div class="post"><div class="pm"><b>'+i.n+'</b><span>'+i.u+' each · typical '+E(x.av)+' in '+L+'</span></div><label class="pr"><small>Quantity</small><input class="qty" type="number" min="0" max="99" value="'+i.q+'" data-q="'+i.n+'" aria-label="Quantity of '+i.n+'"></label></div>'}).join("");
 var set=Math.ceil((av+(hi-av)/2)/50)*50,b=parseFloat(S.bud),msg="";
 if(b>0){msg=b>=set?'Your '+E(b)+' covers the safe estimate for '+L+' with '+E(b-set)+' to spare.':b>=av?'Your '+E(b)+' covers the typical price in '+L+' but may run short if you meet high prices. Add '+E(set-b)+' to be safe.':'Your '+E(b)+' is '+E(av-b)+' below the typical total in '+L+'. Cut quantities or add money.'}
 var loc='<div class="bar" style="margin-bottom:6px"><label class="grow" style="display:block"><span class="lead" style="display:block;font-size:13px">Where will you buy?</span><select id="pm" style="width:100%">'+key.map(function(m){return'<option'+(m===S.m?' selected':'')+'>'+m+'</option>'}).join("")+'</select></label></div>';
 var others=key.filter(function(m){return m!==S.m}).map(function(m){return{m:m,t:tot(m,s)}}).sort(function(a,b){return a.t-b.t}).slice(0,3);
 var oth=others.map(function(o){var d=o.t-av;return'<div class="post"><div class="pm"><b>'+shortN(o.m)+'</b><span>Typical total '+E(o.t)+'</span></div><button class="chip" data-m="'+o.m+'">'+(d<0?E(-d)+' less':E(d)+' more')+' · switch</button></div>'}).join("");
 return'<div class="card">'+loc+rows+'</div>'+
 '<h2>What to set aside for '+L+'</h2><div class="card"><div class="stats"><div class="stat l"><b>'+E(lo)+'</b><span>Best case</span></div><div class="stat a"><b>'+E(av)+'</b><span>Typical</span></div><div class="stat h"><b>'+E(hi)+'</b><span>Worst case</span></div></div>'+
 '<div class="tip"><p>To shop in <b>'+S.m+'</b> '+$("wh").value.toLowerCase()+', bring at least <b>'+E(set)+'</b>. That is the typical total plus half the gap to the highest prices.</p></div>'+
 '<div class="bar" style="margin:14px 0 0"><input id="bud" class="grow" type="number" min="0" placeholder="Your budget for '+L+' in ETB (optional)" value="'+(S.bud||"")+'"></div>'+(msg?'<p style="margin:10px 0 0">'+msg+'</p>':'')+'</div>'+
 '<h2>Same list, other locations</h2><div class="card">'+oth+'</div>'}
var T={r:["Research",research],c:["Compare by location",compare],p:["Plan my budget",plan]};
function draw(){
 $("tabs").innerHTML=Object.keys(T).map(function(k){return'<button class="tab" role="tab" data-t="'+k+'" aria-selected="'+(S.tab===k)+'">'+T[k][0]+'</button>'}).join("");
 $("view").innerHTML=T[S.tab][1]();
 var b=$("bud");if(b&&S.focus){b.focus();b.setSelectionRange(b.value.length,b.value.length)}}
$("mk").innerHTML=key.map(function(m){return'<option>'+m+'</option>'}).join("");
$("chips").innerHTML=I.map(function(i){return'<button class="chip" data-i="'+i.n+'" aria-pressed="true">'+i.n+'</button>'}).join("");
document.addEventListener("click",function(e){var t=e.target.closest("button");if(!t)return;S.focus=0;
 if(t.dataset.t){S.tab=t.dataset.t}
 else if(t.dataset.i){var n=t.dataset.i;S.on[n]=S.on[n]?0:1;t.setAttribute("aria-pressed",!!S.on[n]);if(S.f===n)S.f="all"}
 else if(t.dataset.f){S.f=t.dataset.f;S.more=false}
 else if(t.dataset.c){var c=t.dataset.c;S.cmp[c]=S.cmp[c]?0:1}
 else if(t.dataset.m){S.m=t.dataset.m;$("mk").value=S.m}
 else if(t.id==="more"){S.more=!S.more}else return;draw()});
document.addEventListener("input",function(e){var t=e.target;
 if(t.dataset.q){I.filter(function(i){return i.n===t.dataset.q})[0].q=Math.max(0,parseInt(t.value)||0);S.focus=0;var f=t.dataset.q;draw();var n=document.querySelector('[data-q="'+f+'"]');n.focus()}
 else if(t.id==="bud"){S.bud=t.value;S.focus=1;draw()}});
document.addEventListener("change",function(e){if(e.target.id==="pm"){S.m=e.target.value;$("mk").value=S.m;draw()}});
$("mk").onchange=function(){S.m=this.value;S.more=false;draw()};$("wh").onchange=draw;draw();
