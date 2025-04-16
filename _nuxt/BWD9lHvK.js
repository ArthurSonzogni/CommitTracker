import{_ as D}from"./CB-TWu6o.js";import{_ as $}from"./DKZGIHTP.js";import{f as B,y as O,z as P,h as f,r as v,o as r,p as S,w as c,c as y,F as U,k as j,b as i,j as a,d as l,t as W,g as G,q as I,A as z,i as J,B as Y,a as e,v as q,l as b}from"./CjHBLfWp.js";import"./DlAUqK2U.js";import"./Rb7KhyFA.js";const Z=B({__name:"TimeRangeSelector",props:O({label:{default:"",type:String,required:!1}},{modelValue:{},modelModifiers:{}}),emits:["update:modelValue"],setup(R){const p=P(R,"modelValue"),w=[["forever"],["1y+4y","1y+3y","1y+2y","1y+1y"],["1y","6m","3m","1m","1w"]],n=new Map([["forever","All time"],["1y+4y","Five year ago, until four year ago"],["1y+3y","Four year ago, until three year ago"],["1y+2y","Three year ago, until two year ago"],["1y+1y","Two year ago, until last year"],["1y","The last year"],["6m","The last 6 months"],["3m","The last 3 months"],["1m","The last month"],["1w","The last week"]]);return f(w.flat()),(u,s)=>{const d=v("b-tooltip"),k=v("b-radio-button"),_=v("b-field");return r(),S(_,{grouped:"",label:"Time range:"},{default:c(()=>[(r(),y(U,null,j(w,(g,V)=>i(_,{key:V,class:"has-addons"},{default:c(()=>[(r(!0),y(U,null,j(g,h=>(r(),S(k,{key:h,modelValue:p.value,"onUpdate:modelValue":s[0]||(s[0]=x=>p.value=x),"native-value":h},{default:c(()=>[i(d,{label:a(n).get(h)},{default:c(()=>[l(W(h),1)]),_:2},1032,["label"])]),_:2},1032,["modelValue","native-value"]))),128))]),_:2},1024)),64))]),_:1})}}}),H={class:"fullscreenFlexbox"},K={class:"section zoom"},Q={key:0,class:"section"},X={class:"container"},ee={key:1,class:"zoomable"},te={key:2,class:"container"},ie=B({__name:"communities",setup(R){const p=G(),w=I(),n=f(["v8"]),u=f("1y");f(1);const s=f(!1),d=f(!1),k=f(null);p.query.repositories&&(n.value=p.query.repositories.split(",")),p.query.time&&(u.value=p.query.time);const _=z(()=>`${n.value.length==1?n.value:"all"}_${u.value}.svg`),g=z(()=>"/community-map/"+_.value),V=()=>{window.open(g.value,"_blank")},h=()=>{const o=document.createElement("a");o.href=g.value,o.download=_.value,o.click()},x=async()=>{if(g.value==k.value)return;k.value=g.value;const o=await fetch(g.value);if(o.ok){d.value=!1;const t=await o.text(),T=new DOMParser().parseFromString(t,"image/svg+xml").querySelector("svg");if(!T)return;document.querySelector("svg").replaceWith(T)}else d.value=!0},A=async()=>{await x(),E()},E=()=>{const o=document.querySelector("svg");o.setAttribute("preserveAspectRatio","xMinYMin meet"),o.setAttribute("margin","auto"),o.setAttribute("aspect-ratio","2"),o.setAttribute("width","80vw"),o.addEventListener("click",V)};return J([u,n],()=>{w.replace({query:{time:u.value,repositories:n.value.join(",")}}),A()}),Y(()=>{A()}),(o,t)=>{const M=D,F=$,T=Z,C=v("b-button"),N=v("b-field"),L=v("b-message");return r(),y("div",H,[i(M),e("section",K,[i(F,{modelValue:a(n),"onUpdate:modelValue":t[0]||(t[0]=m=>q(n)?n.value=m:null),size:"small",allowMultiple:!1,allowAll:!0,filter:m=>m.reviewers},null,8,["modelValue","filter"]),i(T,{modelValue:a(u),"onUpdate:modelValue":t[1]||(t[1]=m=>q(u)?u.value=m:null)},null,8,["modelValue"]),i(N,{grouped:""},{default:c(()=>[i(N,{grouped:""},{default:c(()=>[i(C,{label:"Readme",onClick:t[2]||(t[2]=m=>s.value=!a(s)),type:"is-warning"}),a(d)?b("",!0):(r(),S(C,{key:0,onClick:V,type:"is-info",label:"View"})),a(d)?b("",!0):(r(),S(C,{key:1,onClick:h,type:"is-info is-light"},{default:c(()=>t[4]||(t[4]=[l(" Download ")])),_:1}))]),_:1})]),_:1})]),a(s)?(r(),y("section",Q,[e("div",X,[i(L,{title:"Readme",modelValue:a(s),"onUpdate:modelValue":t[3]||(t[3]=m=>q(s)?s.value=m:null),"aria-close-label":"Close message"},{default:c(()=>t[5]||(t[5]=[e("div",{class:"content"},[e("ul",null,[e("li",null,[l(" Data is refreshed "),e("strong",null,"weekly"),l(", and "),e("strong",null,"automatically"),l(". See "),e("a",{href:"https://github.com/ArthurSonzogni/ChromeCommitTracker/actions/workflows/importer-graph.yaml"}," Job ")]),e("li",null,[e("strong",null,"Label height"),l(" is proportional to the number contributions square root (author + review). The goal is to make the surface used to draw one characters proportional to the number of commits. ")]),e("li",null,[e("strong",null,"Edge thickness"),l(' is proportional to the number of commit flowing from one author to a reviewer. We ignore long distance edges with a low number of commit. To be precise, there is a "commit" / "length" threshold. The "real" graph is extremly dense and difficult to interpret. ')]),e("li",null,[e("strong",null,"Edge orientation"),l(" helps understanding who is the author and who is the reviewer. The edge turn left when going from the author to the reviewer. ")]),e("li",null,[e("strong",null,"Colors"),l(" represent different communities who strongly interact together, and do not outside Often, the number of communities is high when considering small range of time (small project), and low when considering large range of time (large product). We are using the "),e("a",{href:"https://en.wikipedia.org/wiki/Louvain_method"}," Louvain algorithm "),l(". ")]),e("li",null,[e("strong",null,"Code reviews before 2017 are not included."),l(", the data wasn't part of the commit description before. ")])])],-1)])),_:1},8,["modelValue"])])])):b("",!0),a(d)?b("",!0):(r(),y("div",ee,t[6]||(t[6]=[e("svg",null,null,-1)]))),a(d)?(r(),y("p",te,t[7]||(t[7]=[l(" No data for this selection. Try to select a larger time range, or a different repository."),e("br",null,null,-1),l(" Please note that this relies on the commit description. If the commit description doesn't contains some `Reviewed-by` or tags, the data will be incomplete. ")]))):b("",!0)])}}});export{ie as default};
