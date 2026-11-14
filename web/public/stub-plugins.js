// Loaded just before js/script.js: no-op versions of the carousel and filter plugins for pages that skipped loading them (see components/legacy-scripts.tsx).
(function ($) {
  var none = function () { return this; };
  ["slick", "slickAnimation", "filterizr"].forEach(function (n) { if (!$.fn[n]) $.fn[n] = none; });
})(window.jQuery);
