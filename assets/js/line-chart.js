(function(){"use strict";
var ns="http://www.w3.org/2000/svg",rupiah=new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}),short=new Intl.NumberFormat("id-ID",{notation:"compact",maximumFractionDigits:1});
function node(tag,attrs,parent){var n=document.createElementNS(ns,tag);Object.keys(attrs||{}).forEach(function(k){n.setAttribute(k,attrs[k]);});if(parent)parent.appendChild(n);return n;}
function dateLabel(value){if(!value)return "Tanggal tidak tersedia";var d=new Date(value+"T00:00:00");return isNaN(d.getTime())?value:new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(d);}
function drawLineChart(container,source){
 if(!container)return;var all=(Array.isArray(source)?source:[]).filter(function(item){return item&&item.date;}).map(function(item){return{date:String(item.date),amount:Math.max(0,Number(item.amount)||0)};});
 container.replaceChildren();container.classList.add("interactive-chart");
 if(!all.length){container.textContent="Belum ada data tren donasi.";return;}
 var selection=all.length,toolbar=document.createElement("div"),plot=document.createElement("div"),tooltip=document.createElement("div"),detail=document.createElement("p");
 toolbar.className="chart-toolbar";plot.className="chart-plot";tooltip.className="chart-tooltip hidden";tooltip.setAttribute("role","status");detail.className="chart-detail";detail.setAttribute("aria-live","polite");
 [7,14,30].filter(function(n){return n<all.length;}).concat([all.length]).filter(function(n,i,a){return a.indexOf(n)===i;}).forEach(function(n){var button=document.createElement("button");button.type="button";button.className="chart-range";button.textContent=n+" hari";button.dataset.days=String(n);button.addEventListener("click",function(){selection=n;render();});toolbar.appendChild(button);});
 container.append(toolbar,plot,detail);
 function render(){
  Array.from(toolbar.children).forEach(function(b){var active=Number(b.dataset.days)===selection;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
  plot.replaceChildren();tooltip.classList.add("hidden");var values=all.slice(-selection),W=720,H=230,L=47,R=16,T=20,B=32,max=Math.max.apply(null,values.map(function(d){return d.amount;}).concat([0])),top=max===0?1:max*1.12;
  var svg=node("svg",{viewBox:"0 0 "+W+" "+H,role:"img",tabindex:"0","aria-label":"Grafik garis tren donasi. Gunakan tombol rentang atau tombol panah untuk melihat nilai harian."});svg.classList.add("line-chart-svg");
  function x(i){return L+(W-L-R)*(values.length===1?.5:i/(values.length-1));}function y(v){return max===0?T+(H-T-B)/2:T+(H-T-B)*(1-v/top);}
  for(var k=0;k<3;k++){var val=top*(2-k)/2,cy=T+(H-T-B)*k/2;node("line",{x1:L,x2:W-R,y1:cy,y2:cy,class:"chart-grid"},svg);var label=node("text",{x:L-7,y:cy+4,"text-anchor":"end",class:"chart-axis"},svg);label.textContent=short.format(val);}
  var coords=values.map(function(v,i){return x(i).toFixed(1)+","+y(v.amount).toFixed(1);});
  node("polygon",{points:L+","+(H-B)+" "+coords.join(" ")+" "+(W-R)+","+(H-B),class:"chart-area"},svg);
  node("polyline",{points:coords.join(" "),class:"chart-line"},svg);
  var guide=node("line",{x1:0,x2:0,y1:T,y2:H-B,class:"chart-guide",visibility:"hidden"},svg),dot=node("circle",{cx:0,cy:0,r:6,class:"chart-active-dot",visibility:"hidden"},svg);
  var first=node("text",{x:L,y:H-8,class:"chart-axis"},svg),last=node("text",{x:W-R,y:H-8,"text-anchor":"end",class:"chart-axis"},svg);first.textContent=dateLabel(values[0].date);last.textContent=values.length>1?dateLabel(values[values.length-1].date):"";
  var hit=node("rect",{x:L,y:T,width:W-L-R,height:H-B-T,fill:"transparent",class:"chart-hit"},svg);plot.append(svg,tooltip);
  function activate(index){index=Math.max(0,Math.min(values.length-1,index));var v=values[index],px=x(index);guide.setAttribute("x1",px);guide.setAttribute("x2",px);guide.setAttribute("visibility","visible");dot.setAttribute("cx",px);dot.setAttribute("cy",y(v.amount));dot.setAttribute("visibility","visible");tooltip.textContent=dateLabel(v.date)+" · "+rupiah.format(v.amount);tooltip.style.left=Math.min(85,Math.max(15,px/W*100))+"%";tooltip.classList.remove("hidden");detail.textContent=dateLabel(v.date)+" — "+rupiah.format(v.amount);svg.dataset.active=String(index);}
  function move(e){var box=svg.getBoundingClientRect(),pos=(e.clientX-box.left)/box.width*W,idx=values.length===1?0:Math.round((pos-L)/(W-L-R)*(values.length-1));activate(idx);}
  hit.addEventListener("pointermove",move);hit.addEventListener("pointerdown",move);
  hit.addEventListener("pointerleave",function(){tooltip.classList.add("hidden");guide.setAttribute("visibility","hidden");dot.setAttribute("visibility","hidden");});
  svg.addEventListener("focus",function(){activate(Number(svg.dataset.active||values.length-1));});
  svg.addEventListener("keydown",function(e){if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;e.preventDefault();activate(Number(svg.dataset.active||0)+(e.key==="ArrowRight"?1:-1));});
  detail.textContent="Arahkan kursor, sentuh grafik, atau fokuskan grafik lalu gunakan tombol panah.";
 }
 render();
}
window.SedekahLineChart=drawLineChart;
})();
