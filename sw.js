if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,n)=>{const o=e||("document"in self?document.currentScript.src:"")||location.href;if(s[o])return;let c={};const d=e=>i(e,o),t={module:{uri:o},exports:c,require:d};s[o]=Promise.all(r.map((e=>t[e]||d(e)))).then((e=>(n(...e),c)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"926bdd412104cb5d7499f512825139c2"},{url:"icons.js",revision:"b4763d4c2cc027fe15eee3e00d83651e"},{url:"oscd-designer.js",revision:"f39d253a0c3e4b4f18235d86ce124afd"},{url:"oscd-designer.spec.js",revision:"6ef22f3615beebf245e097123542493e"},{url:"sld-editor.js",revision:"5509dfbf060b94903c5579547bb13f5c"},{url:"util.js",revision:"307eba0ccebd7890860b5add40866672"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
