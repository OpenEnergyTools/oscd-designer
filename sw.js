if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,n)=>{const o=e||("document"in self?document.currentScript.src:"")||location.href;if(s[o])return;let c={};const d=e=>i(e,o),t={module:{uri:o},exports:c,require:d};s[o]=Promise.all(r.map((e=>t[e]||d(e)))).then((e=>(n(...e),c)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"ae5f004c651a115699a98979da1baf3c"},{url:"icons.js",revision:"4991bf7f794164652c2345302470a4ba"},{url:"oscd-designer.js",revision:"4d1d08fb667b7d9a87f2eb4e32f19eed"},{url:"oscd-designer.spec.js",revision:"4b1c96c70a4fa0efea43fb3b6843da86"},{url:"sld-editor.js",revision:"d8ff3c3f34233ead0d4cf4cd09ebe9d4"},{url:"util.js",revision:"5abd2cfa5020b54cf3354489284c7e77"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
