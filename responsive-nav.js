// Root shim for backward compatibility.
(function(){
  const s=document.createElement('script');
  s.src='js/responsive-nav.js';
  s.defer=true;
  document.head.appendChild(s);
})();
