if(!self.define){let e,s={};const i=(i,d)=>(i=new URL(i+".js",d).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(d,c)=>{const r=e||("document"in self?document.currentScript.src:"")||location.href;if(s[r])return;let n={};const o=e=>i(e,r),t={module:{uri:r},exports:n,require:o};s[r]=Promise.all(d.map((e=>t[e]||o(e)))).then((e=>(c(...e),n)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"0170f8f5d7714faaec95482634bcabdd"},{url:"icons.js",revision:"9c1f23b5d642cd031f6d4710de9588d8"},{url:"oscd-designer.js",revision:"69f6d9dfa13fc7b6677984ca37f8c7c3"},{url:"oscd-designer.spec.js",revision:"f13556aae1c7da8831461387dbdd02bb"},{url:"sld-editor.js",revision:"4201141758baed29fb3fc709db2aac04"},{url:"util.js",revision:"8cf22045c4e1ae8f61cbcd1d81343f26"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
