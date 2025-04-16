import{_ as e}from"./CB-TWu6o.js";import{_ as u}from"./DlAUqK2U.js";import{r as a,c as d,b as t,a as s,e as m,d as l,w as r,o as f}from"./CjHBLfWp.js";const p={},y={class:"section"},g={class:"container content"};function b(j,o){const i=e,n=a("b-tag");return f(),d("div",null,[t(i),s("section",y,[s("div",g,[o[40]||(o[40]=m('<h1 class="title">The API</h1><p> This is a static server. All the responses are static JSON files. They are refreshed every week by a bot running on Github actions. </p><p> Those responses are giving informations about the emails, usernames and organizations of the contributors. </p><h2> Endpoints </h2><ul><li><a href="/data/repositories.json"><code>/data/repositories.json</code></a></li><li><ul><li><a href="/data/chromium/emails.json"><code>/data/${repo}/emails.json</code></a></li><li><a href="/data/chromium/emails/arthursonzogni@chromium.org.json"><code>/data/${repo}/emails/${email}.json</code></a></li><li><a href="/data/chromium/emails_summary_commit_yearly_author.json"><code>/data/${repo}/emails_summary_commit_${group_by}_{side}.json</code></a></li></ul></li><li><ul><li><a href="/data/chromium/usernames.json"><code>/data/${repo}/usernames.json</code></a></li><li><a href="/data/chromium/usernames/arthursonzogni.json"><code>/data/${repo}/usernames/${username}.json</code></a></li><li><a href="/data/chromium/usernames_summary_commit_yearly_author.json"><code>/data/${repo}/usernames_summary_commit_${group_by}_{side}.json</code></a></li></ul></li><li><ul><li><a href="/data/chromium/organizations.json"><code>/data/${repo}/organizations.json</code></a></li><li><a href="/data/chromium/organizations_summary_commit_yearly_author.json"><code>/data/${repo}/organizations_summary_commit_${group_by}_{side}.json</code></a></li><li><a href="/data/chromium/organizations_summary_contributor_yearly_author.json"><code>/data/${repo}/organizations_summary_contributor_${group_by}_{side}.json</code></a></li></ul></li></ul><h2>Params</h2>',6)),s("ul",null,[s("li",null,[o[11]||(o[11]=s("code",null,"repo",-1)),o[12]||(o[12]=l(" is one of: ")),t(n,null,{default:r(()=>o[0]||(o[0]=[l("angle")])),_:1}),o[13]||(o[13]=l()),t(n,null,{default:r(()=>o[1]||(o[1]=[l("chromeos")])),_:1}),o[14]||(o[14]=l()),t(n,null,{default:r(()=>o[2]||(o[2]=[l("chromium")])),_:1}),t(n,null,{default:r(()=>o[3]||(o[3]=[l("dawn")])),_:1}),o[15]||(o[15]=l()),t(n,null,{default:r(()=>o[4]||(o[4]=[l("devtool-frontend")])),_:1}),t(n,null,{default:r(()=>o[5]||(o[5]=[l("gn")])),_:1}),o[16]||(o[16]=l()),t(n,null,{default:r(()=>o[6]||(o[6]=[l("pdfium")])),_:1}),o[17]||(o[17]=l()),t(n,null,{default:r(()=>o[7]||(o[7]=[l("perfetto")])),_:1}),t(n,null,{default:r(()=>o[8]||(o[8]=[l("swiftshader")])),_:1}),o[18]||(o[18]=l()),t(n,null,{default:r(()=>o[9]||(o[9]=[l("v8")])),_:1}),o[19]||(o[19]=l()),t(n,null,{default:r(()=>o[10]||(o[10]=[l("webrtc")])),_:1}),o[20]||(o[20]=l(" ... "))]),o[39]||(o[39]=s("li",null,[s("code",null,"email"),l(" is an email address. ")],-1)),s("li",null,[o[26]||(o[26]=s("code",null,"group_by",-1)),o[27]||(o[27]=l(" is one of: ")),t(n,null,{default:r(()=>o[21]||(o[21]=[l("forever")])),_:1}),o[28]||(o[28]=l()),t(n,null,{default:r(()=>o[22]||(o[22]=[l("decennial")])),_:1}),o[29]||(o[29]=l()),t(n,null,{default:r(()=>o[23]||(o[23]=[l("yearly")])),_:1}),o[30]||(o[30]=l()),t(n,null,{default:r(()=>o[24]||(o[24]=[l("quarterly")])),_:1}),o[31]||(o[31]=l()),t(n,null,{default:r(()=>o[25]||(o[25]=[l("monthly")])),_:1})]),s("li",null,[o[35]||(o[35]=s("code",null,"side",-1)),o[36]||(o[36]=l(" is one of: ")),t(n,null,{default:r(()=>o[32]||(o[32]=[l("author")])),_:1}),o[37]||(o[37]=l()),t(n,null,{default:r(()=>o[33]||(o[33]=[l("review")])),_:1}),o[38]||(o[38]=l()),t(n,null,{default:r(()=>o[34]||(o[34]=[l("both")])),_:1})])]),o[41]||(o[41]=s("h2",null,"Guarantees",-1)),o[42]||(o[42]=s("p",null," There are no guarantees about how long the API will stay in the current shape. Please let me know when you start relying on it, so that I can consider not to change it anymore, or to provide a better service. ",-1))])])])}const z=u(p,[["render",b]]);export{z as default};
