import{i as $}from"./BeACrgm2.js";import{f as q,m as A,g as G,h as x,p as j,r as w,o as m,c as k,s as l,i as V,w as i,b as d,d as b,F as T,j as F,t as E,x as I,v as H}from"./Cdo8rkQ9.js";import{_ as J}from"./DlAUqK2U.js";const K={class:"timeline"},L=3,O=q({__name:"Timeline",props:A({minDate:{default:new Date("2000-01"),type:Date},maxDate:{default:new Date,type:Date}},{modelValue:{},modelModifiers:{}}),emits:["update:modelValue"],setup(Q){const _=Q,z=n=>$(_.minDate,_.maxDate)(Math.pow(n,1/L)),h=n=>{const e=_.minDate.getTime(),s=_.maxDate.getTime(),u=(n.getTime()-e)/(s-e);return Math.pow(u,L)},f=G(Q,"modelValue"),t=x(f.value.map(h)),M=x(!1),B=x(_.minDate),N=x(_.maxDate),Y=new Date,D=x(new Date(Y.getFullYear(),Y.getMonth()-4).getFullYear());let y=!1,C=!1;j(t,()=>{C||y||(C=!0,f.value=t.value.map(z),setTimeout(()=>{C=!1},1))}),j(f,()=>{C||y||(y=!0,t.value=f.value.map(h),setTimeout(()=>{y=!1},1))});const S=()=>{M.value=!M.value},R=n=>{const e=z(n);return e.getFullYear()+"-"+(e.getMonth()+1)},o=n=>h(n),v=n=>{const e=Math.floor(n/4),s=n%4,r=new Date(e,(s-1)*3),u=new Date(e,(s-1)*3+3);return t.value[0]<=o(r)&&t.value[1]>=o(u)},U=(n,e)=>{const s=new Date(n,(e-1)*3),r=new Date(n,(e-1)*3+3);if(!v(4*n+e)){t.value=[Math.min(t.value[0],o(s)),Math.max(t.value[1],o(r))];return}const u=4*n+e-1,p=4*n+e+1;if(v(u)&&v(p)){t.value=[o(s),o(r)];return}if(v(u)){const g=Math.floor(u/4),a=u%4,c=new Date(g,(a-1)*3+3);t.value=[t.value[0],o(c)];return}if(v(p)){const g=Math.floor(p/4),a=p%4,c=new Date(g,(a-1)*3);t.value=[o(c),t.value[1]];return}t.value=[o(s),o(r)]};return(n,e)=>{const s=w("b-button"),r=w("b-field"),u=w("b-datepicker"),p=w("b-slider-tick"),g=w("b-slider");return m(),k("div",K,[l(M)?(m(),V(r,{key:0,grouped:""},{default:i(()=>[d(s,{onClick:S,class:"mr-5",size:"is-small"},{default:i(()=>e[3]||(e[3]=[b(" - ")])),_:1}),(m(!0),k(T,null,F([l(D)-1,l(D)],a=>(m(),V(r,{key:a,label:a+"-Quarters"},{default:i(()=>[(m(),k(T,null,F(4,c=>d(s,{key:c,onClick:P=>U(a,c),inverted:!v(4*a+c),type:"is-primary",class:"mr-1",rounded:""},{default:i(()=>[b(E("Q"+c),1)]),_:2},1032,["onClick","inverted"])),64))]),_:2},1032,["label"]))),128)),d(r,{label:"Min"},{default:i(()=>[d(u,{position:"is-top-left",value:f.value[0],onInput:e[0]||(e[0]=a=>l(t)[0]=o(a)),"min-date":l(B),"max-date":l(N)},null,8,["value","min-date","max-date"])]),_:1}),d(r,{label:"Max"},{default:i(()=>[d(u,{position:"is-top-left",value:f.value[1],onInput:e[1]||(e[1]=a=>l(t)[1]=o(a)),"min-date":l(B),"max-date":l(N)},null,8,["value","min-date","max-date"])]),_:1})]),_:1})):I("",!0),l(M)?I("",!0):(m(),V(r,{key:1,grouped:""},{default:i(()=>[d(s,{onClick:S,class:"mr-5",size:"is-small"},{default:i(()=>e[4]||(e[4]=[b(" + ")])),_:1}),d(g,{expanded:"",modelValue:l(t),"onUpdate:modelValue":e[2]||(e[2]=a=>H(t)?t.value=a:null),min:0,max:1,step:.001,"custom-formatter":R,rounded:"","tooltip-always":"",lazy:""},{default:i(()=>[(m(),k(T,null,F([0,1,2,3,4,6,8,10,12,14,16,18,20],a=>(m(),k(T,{key:a},[o(new Date(l(D)-a+"-01-01"))>=.1?(m(),V(p,{key:0,value:o(new Date(l(D)-a+"-01-01"))},{default:i(()=>[b(E(l(D)-a),1)]),_:2},1032,["value"])):I("",!0)],64))),64)),d(p,{value:1},{default:i(()=>e[5]||(e[5]=[b("today")])),_:1})]),_:1},8,["modelValue"])]),_:1}))])}}}),ee=J(O,[["__scopeId","data-v-9487ea3f"]]);export{ee as _};