if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,n)=>{const o=e||("document"in self?document.currentScript.src:"")||location.href;if(s[o])return;let d={};const c=e=>i(e,o),t={module:{uri:o},exports:d,require:c};s[o]=Promise.all(r.map((e=>t[e]||c(e)))).then((e=>(n(...e),d)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"c0d87f8580a917ddfd26400ddfc81b03"},{url:"icons.js",revision:"4991bf7f794164652c2345302470a4ba"},{url:"oscd-designer.js",revision:"93b8fe366914294b94d03b1375e8adb9"},{url:"oscd-designer.spec.js",revision:"6a2a4921e2e241b15861e27a84806d6d"},{url:"sld-editor.js",revision:"ccd8d72570e8081b6a651af801dd8540"},{url:"util.js",revision:"5abd2cfa5020b54cf3354489284c7e77"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
