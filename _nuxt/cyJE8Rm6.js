import{r as f}from"./Rb7KhyFA.js";import{f as v,y,h as w,z as h,s as d,K as _,i as g,r as L,o as k,p as z,j as C}from"./CjHBLfWp.js";const V=v({__name:"DevelopersInput",props:y({size:{type:String,required:!1}},{modelValue:{},modelModifiers:{}}),emits:["update:modelValue"],setup(u){const a=w(null),l=h(u,"modelValue"),c=d([]),r=d([]);(async()=>{const e=s=>fetch(`/data/${s.dirname}/usernames.json`).then(i=>i.json()),n=(await Promise.all(f.map(e))).reduce((s,i)=>s.concat(i),[]),o=[...new Set(n)];c.value=o,l.value=l.value.filter(s=>o.includes(s))})();const p=e=>{if(e.length<=2){r.value=[];return}e=e.trim().toLowerCase();const t=o=>o.toLowerCase().indexOf(e)==0,n=(o,s)=>o.toLowerCase().indexOf(e)-s.toLowerCase().indexOf(e);r.value=c.value.filter(t).sort(n)},{$color:m}=_();return g(l,()=>{setTimeout(()=>{let e=0;for(const t of a.value.$el.querySelectorAll(".tag"))t.style.backgroundColor=m(l.value[e]),++e},0),a.value.$el.querySelector("input")!=null&&a.value.$el.querySelector("input").addEventListener("keydown",e=>{if(e.key=="Enter"){const t=a.value.$el.querySelector(".dropdown-item");t&&t.click()}})}),(e,t)=>{const n=L("b-taginput");return k(),z(n,{ref_key:"input",ref:a,modelValue:l.value,"onUpdate:modelValue":t[0]||(t[0]=o=>l.value=o),onTyping:p,data:C(r),"allow-new":!1,autocomplete:"",icon:"label",field:"this",placeholder:"developer username",type:"is-primary",size:u.size||"is-medium","open-on-focus":""},null,8,["modelValue","data","size"])}}});export{V as _};
