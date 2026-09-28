(function () {
  "use strict";
  var parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] === "program" && parts[1]) {
    location.replace("/program/?slug=" + encodeURIComponent(parts[1]));
    return;
  }
  document.addEventListener("DOMContentLoaded", function () {
    var target = document.querySelector("#missing-path");
    if (target) target.textContent = location.pathname;
  });
})();
