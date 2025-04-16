import{_ as te}from"./CB-TWu6o.js";import{f as G,y as j,z as oe,h as p,r as h,o as T,p as D,w as l,a as x,t as M,c as C,F as R,k as N,n as ae,d as F,l as le,j as t,g as ne,q as ie,A as H,K as re,i as v,b as a,v as S}from"./CjHBLfWp.js";import{_ as se}from"./Ds7opTOe.js";import{_ as ce}from"./BV1nIrGk.js";import{_ as pe}from"./DlAUqK2U.js";import"./BeACrgm2.js";import"./DFE6o7vh.js";import"./BwK0cQ14.js";import"./5SkG2ReE.js";import"./D04YGJXT.js";import"./D2nGpDRe.js";import"./DKbKBQE1.js";import"./v1aee4gK.js";import"./rlX7cRMw.js";import"./Drloq0xg.js";import"./ntdiYfc-.js";const ue=[{name:"file",description:"The number of c++ files.",script:"git ls-files -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"file"},{name:"raw_ptr",description:"The number of raw_ptr<T>",script:"git grep -c 'raw_ptr<' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"raw_ptr",tags:["MiraclePtr"]},{name:"raw_ref",description:"The number of raw_ref<T>",script:"git grep -c 'raw_ref<' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"raw_ref",tags:["MiraclePtr"]},{name:"RAW_PTR_EXCLUSION",description:"The number of RAW_PTR_EXCLUSION",script:"git grep -c 'RAW_PTR_EXCLUSION ' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"raw_ptr_exclusion",tags:["MiraclePtr"]},{name:"DanglingUntriaged",description:"The number of DanglingUntriaged",script:"git grep -c 'DanglingUntriaged' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"dangling_untriaged",tags:["MiraclePtr"]},{name:"AllowPtrArithmetic",description:"The number of AllowPtrArithmetic",script:"git grep -c 'AllowPtrArithmetic' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"allow_ptr_arithmetic",tags:["MiraclePtr"]},{name:"ContainerExperimental",description:"The number of VectorExperimental, SetExperimental, CtnExperimental",script:`git grep -cE "(Vector|Set|Ctn)Experimental" -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'`,file:"ctrn_expr",tags:["MiraclePtr"]},{name:"allow_unsafe_buffers",description:"The number of files with allow_unsafe_buffers",script:"git grep -c 'allow_unsafe_buffers' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"allow_unsafe_buffers",tags:["Spanification"]},{name:"UNSAFE_BUFFER_USAGE",description:"The occurrences of UNSAFE_BUFFER_USAGE",script:"git grep -c 'UNSAFE_BUFFER_USAGE' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"unsafe_buffer_usage",tags:["Spanification"]},{name:"UNSAFE_BUFFERS",description:"The occurrences of UNSAFE_BUFFERS(...)",script:"git grep -c 'UNSAFE_BUFFERS(' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"unsafe_buffers",tags:["Spanification"]},{name:"base::Unretained",description:"The occurrences of base::Unretained",script:"git grep -c 'base::Unretained' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"base_unretained",tags:["Memory Safety"]},{name:"TODO",description:"The number of TODO",script:"git grep -c 'TODO' -- '*.h' '*.hpp' '*.cc' '*.cpp' '*.c'",file:"todo",tags:["Misc"]}],U={metrics:ue},me={class:"mr-2 is-size-6"},de={style:{"font-style":"italic"}},fe=G({__name:"TreemapInput",props:j({placeholder:{type:String,required:!1,default:"Type to filter"}},{value:{},valueModifiers:{}}),emits:j(["input"],["update:value"]),setup(A,{emit:i}){const k=oe(A,"value"),f=p(null),V=i,d=p(U.metrics),q=s=>{d.value=U.metrics.filter(n=>n.length===0?!0:n.name.toLowerCase().includes(s.toLowerCase())||n.description.toLowerCase().includes(s.toLowerCase())||n.file.toLowerCase().includes(s.toLowerCase()))},r=s=>{V("input",s)};return(s,n)=>{const _=h("b-tag"),g=h("b-taginput");return T(),D(g,{ref_key:"input",ref:f,modelValue:k.value,"onUpdate:modelValue":n[0]||(n[0]=m=>k.value=m),onInput:r,onTyping:q,data:t(d),"allow-new":!1,autocomplete:"",icon:"label",field:"name",placeholder:A.placeholder,type:"is-primary",size:"is-medium","open-on-focus":"","append-to-body":""},{default:l(m=>[x("strong",me,M(m.option.name),1),m.option.tags?(T(!0),C(R,{key:0},N(m.option.tags,u=>(T(),D(_,{key:u,style:ae({color:"white",backgroundColor:s.$color(u)})},{default:l(()=>[F(M(u),1)]),_:2},1032,["style"]))),128)):le("",!0),x("p",de,M(m.option.description),1)]),header:l(()=>n[1]||(n[1]=[x("div",{class:"content"},[x("strong",{class:"is-size-4"},"Metrics")],-1)])),_:1},8,["modelValue","data","placeholder"])}}}),_e=["value"],ge=G({__name:"treemap",setup(A){console.log(U.metrics);const i=ne(),k=ie(),f=p([U.metrics[7]]);i.query.field_color&&(f.value=i.query.field_color.split(",").map(c=>U.metrics.find(e=>e.file===c)));const V=H(()=>f.value.map(c=>c.file)),d=p([U.metrics[0]]);i.query.field_size&&(d.value=i.query.field_size.split(",").map(c=>U.metrics.find(e=>e.file===c)));const q=H(()=>d.value.map(c=>c.file)),r=p([new Date("2020-01-01"),new Date]);i.query.dates&&(r.value=i.query.dates.split(",").map(c=>new Date(c)));const s=p("Red");i.query.colormap&&(s.value=i.query.colormap);const n=p([]);i.query.path&&(n.value=i.query.path.split(","));const _=p(0);i.query.colormapMin&&(_.value=parseFloat(i.query.colormapMin));const g=p(.12);i.query.colormapMax&&(g.value=parseFloat(i.query.colormapMax));const m=p(["chromium"]);i.query.repositories&&(m.value=i.query.repositories.split(","));const u=p(!1),E=p(1),{$color_map:W}=re(),X=p(Object.keys(W)),Y=()=>{switch(E.value){case 1:E.value=2;break;case 2:E.value=5;break;case 5:E.value=10;break;case 10:E.value=1;break}},b=(c,e)=>{const z={colormap:s.value,colormapMax:g.value,colormapMin:_.value,field_color:f.value.map(w=>w.file).join(","),field_size:d.value.map(w=>w.file).join(","),path:n.value.join(","),repositories:m.value.join(","),dates:r.value.map(w=>w.toISOString().split("T")[0]).join(",")};k.push({query:z})};v(m,b),v(s,b),v(g,b),v(_,b),v(f,b),v(d,b),v(n,b),v(r,b);const L=()=>{const c=Math.max(document.body.scrollHeight,document.body.offsetHeight,document.documentElement.clientHeight,document.documentElement.scrollHeight,document.documentElement.offsetHeight);document.documentElement.dataset.scrolltop=window.scrollY>100?"1":"0",document.documentElement.dataset.scrollbottom=c-window.scrollY>1e3?"1":"0"};L(),document.addEventListener("scroll",L,{passive:!0});const P=()=>{if(console.log("animationEnd"),r.value[1]>new Date&&(u.value=!1),u.value){const c=r.value[1].getTime()+E.value*7*24*60*60*1e3;r.value=[r.value[0],new Date(c)]}};return v(u,()=>{u.value&&P()}),(c,e)=>{const z=te,w=fe,y=h("b-field"),O=h("b-breadcrumb-item"),K=h("b-breadcrumb"),B=h("b-input"),Z=h("b-select"),J=se,Q=h("b-icon"),I=h("b-button"),ee=ce;return T(),C("div",null,[a(z),a(ee,{repositories:t(m),path:t(n),field_color:t(V),field_size:t(q),colormapMin:t(_),colormapMax:t(g),colormap:t(s),dates:t(r),animate:t(u),onZoomin:e[8]||(e[8]=o=>{t(n).push(o),b()}),onAnimationend:e[9]||(e[9]=o=>P())},{top:l(()=>[a(y,null,{default:l(()=>[a(w,{value:t(d),"onUpdate:value":e[0]||(e[0]=o=>S(d)?d.value=o:null),placeholder:"size",class:"mr-10"},null,8,["value"]),a(w,{value:t(f),"onUpdate:value":e[1]||(e[1]=o=>S(f)?f.value=o:null),placeholder:"color"},null,8,["value"])]),_:1}),a(K,{align:"is-left"},{default:l(()=>[a(O,{tag:"a",onClick:e[2]||(e[2]=o=>n.value=[])},{default:l(()=>e[10]||(e[10]=[F(" . ")])),_:1}),(T(!0),C(R,null,N(t(n),(o,$)=>(T(),D(O,{tag:"a",key:$,onClick:be=>n.value=t(n).slice(0,$+1)},{default:l(()=>[F(M(o),1)]),_:2},1032,["onClick"]))),128))]),_:1})]),colormap:l(()=>[a(y,{grouped:""},{default:l(()=>[a(y,{label:"Min",grouped:"","label-position":"inside"},{default:l(()=>[a(B,{modelValue:t(_),"onUpdate:modelValue":e[3]||(e[3]=o=>S(_)?_.value=o:null),placeholder:"Min",size:"is-small"},null,8,["modelValue"])]),_:1}),a(y,{label:"Max",grouped:"","label-position":"inside"},{default:l(()=>[a(B,{modelValue:t(g),"onUpdate:modelValue":e[4]||(e[4]=o=>S(g)?g.value=o:null),size:"is-small",placeholder:"Max"},null,8,["modelValue"])]),_:1}),a(y,{label:"Colormap",expanded:"","label-position":"inside"},{default:l(()=>[a(Z,{placeholder:"Colormap",modelValue:t(s),"onUpdate:modelValue":e[5]||(e[5]=o=>S(s)?s.value=o:null),size:"is-small",expanded:""},{default:l(()=>[(T(!0),C(R,null,N(t(X),o=>(T(),C("option",{value:o,key:o},M(o),9,_e))),128))]),_:1},8,["modelValue"])]),_:1})]),_:1})]),bottom:l(()=>[a(y,{grouped:""},{default:l(()=>[a(y,{expanded:""},{default:l(()=>[a(J,{modelValue:t(r),"onUpdate:modelValue":e[6]||(e[6]=o=>S(r)?r.value=o:null),minDate:new Date("2020-01-01")},null,8,["modelValue","minDate"])]),_:1}),a(y,{grouped:""},{default:l(()=>[a(I,{class:"ml-5",onClick:e[7]||(e[7]=o=>u.value=!t(u)),disabled:t(r)[1].getTime()>new Date().getTime()-1e7},{default:l(()=>[a(Q,{icon:t(u)?"pause":"play",size:"is-small"},null,8,["icon"])]),_:1},8,["disabled"]),a(I,{disabled:t(r)[1].getTime()>new Date().getTime()-1e7,onClick:Y},{default:l(()=>[F(" x"+M(t(E)),1)]),_:1},8,["disabled"])]),_:1})]),_:1})]),_:1},8,["repositories","path","field_color","field_size","colormapMin","colormapMax","colormap","dates","animate"]),e[11]||(e[11]=x("section",{class:"section"},[x("p",null,[F(" Content is updated weekly. Please add your own "),x("a",{href:"https://github.com/ArthurSonzogni/ChromeCommitTracker/blob/main/treemap.yaml"}," entries to track ")])],-1))])}}}),ze=pe(ge,[["__scopeId","data-v-112d28c0"]]);export{ze as default};
