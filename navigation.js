// Root shim for backward compatibility.
// Loads the canonical scripts from /js/.
(function(){
  function load(src){
    return new Promise((resolve,reject)=>{
      if ([...document.scripts].some(s=>s.src && s.src.includes(src))) return resolve();
      const s=document.createElement('script');
      s.src=src;
      s.defer=true;
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Failed to load '+src));
      document.head.appendChild(s);
    });
  }
  // Load navigation first, then responsive behavior.
  load('js/navigation.js')
    .then(()=>load('js/responsive-nav.js'))
    .catch(err=>console.error(err));
})();
