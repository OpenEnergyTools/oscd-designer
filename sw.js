if(!self.define){let e,s={};const i=(i,r)=>(i=new URL(i+".js",r).href,s[i]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=i,e.onload=s,document.head.appendChild(e)}else e=i,importScripts(i),s()})).then((()=>{let e=s[i];if(!e)throw new Error(`Module ${i} didn’t register its module`);return e})));self.define=(r,c)=>{const n=e||("document"in self?document.currentScript.src:"")||location.href;if(s[n])return;let o={};const d=e=>i(e,n),t={module:{uri:n},exports:o,require:d};s[n]=Promise.all(r.map((e=>t[e]||d(e)))).then((e=>(c(...e),o)))}}define(["./workbox-088bfcc4"],(function(e){"use strict";self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"__snapshots__/oscd-designer.spec.snap.js",revision:"2e01e0d960110534dfa176e06f7ea140"},{url:"icons.js",revision:"b4763d4c2cc027fe15eee3e00d83651e"},{url:"oscd-designer.js",revision:"fa8a342e60bd41ae9b8e93a190070132"},{url:"oscd-designer.spec.js",revision:"897ac1a117aede5cb48bbc39ce199f1b"},{url:"sld-editor.js",revision:"a031b3ad1a53cb4d3abf1be8932c9fa6"},{url:"util.js",revision:"ceeb3c80b5fc6077fd3ca3e0619ffddc"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("/index.html"))),e.registerRoute("polyfills/*.js",new e.CacheFirst,"GET")}));
//# sourceMappingURL=sw.js.map
