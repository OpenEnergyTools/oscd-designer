if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,o)=>{const d=e||("document"in self?document.currentScript.src:"")||location.href;if(s[d])return;let n={};const c=e=>i(e,d),t={module:{uri:d},exports:n,require:c};s[d]=Promise.all(r.map((e=>t[e]||c(e)))).then((e=>(o(...e),n)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"icons.js",revision:"01f03d3742da1f2ee3bde5c41976d146"},{url:"oscd-designer.js",revision:"903ca0d6dd7f3460e86e8b69b9065570"},{url:"oscd-designer.spec.js",revision:"134f242c65363f868d584accbc253591"},{url:"sld-editor.js",revision:"f7e908e3927ed7740bd8064ca20fdd0c"},{url:"util.js",revision:"d8ceab38586f2b9a6136d3a2a7fcf033"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
