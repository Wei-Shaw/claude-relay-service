let e=null,r=0;function c(n,s="info",a="",i=3e3){e||(e=document.createElement("div"),e.id="toast-container",e.style.cssText="position: fixed; top: 20px; right: 20px; z-index: 10000;",document.body.appendChild(e));const o=++r,t=document.createElement("div");t.className=`toast rounded-2xl p-4 shadow-2xl backdrop-blur-sm toast-${s}`,t.style.cssText=`
    position: relative;
    min-width: 320px;
    max-width: 500px;
    margin-bottom: 16px;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  `;const l={success:"fas fa-check-circle",error:"fas fa-times-circle",warning:"fas fa-exclamation-triangle",info:"fas fa-info-circle"};return t.innerHTML=`
    <div class="flex items-start gap-3">
      <div class="flex-shrink-0 mt-0.5">
        <i class="${l[s]} text-lg"></i>
      </div>
      <div class="flex-1 min-w-0">
        ${a?`<h4 class="font-semibold text-sm mb-1">${a}</h4>`:""}
        <p class="text-sm opacity-90 leading-relaxed">${n}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" 
              class="flex-shrink-0 text-white/70 hover:text-white transition-colors ml-2">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `,e.appendChild(t),setTimeout(()=>{t.style.transform="translateX(0)"},10),i>0&&setTimeout(()=>{t.style.transform="translateX(100%)",setTimeout(()=>{t.remove()},300)},i),o}export{c as s};
