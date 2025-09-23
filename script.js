// Reviews slider functionality
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function initReviewsSlider() {
    var slider = document.querySelector('.reviews-slider');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.review-card'));
    var dotsContainer = document.querySelector('.review-dots');
    var dots = dotsContainer ? Array.prototype.slice.call(dotsContainer.querySelectorAll('.dot')) : [];
    var container = document.querySelector('.reviews-container');

    if (!slider || cards.length === 0) {
      return;
    }

    var currentIndex = cards.findIndex(function (c) { return c.classList.contains('active'); });
    if (currentIndex < 0) currentIndex = 0;

    function show(index) {
      if (index < 0) index = cards.length - 1;
      if (index >= cards.length) index = 0;

      cards.forEach(function (c, i) {
        if (i === index) {
          c.classList.add('active');
          c.style.display = '';
        } else {
          c.classList.remove('active');
          c.style.display = 'none';
        }
      });

      if (dots.length) {
        dots.forEach(function (d, i) {
          if (i === index) d.classList.add('active'); else d.classList.remove('active');
        });
      }

      currentIndex = index;
    }

    function changeReview(delta) {
      show(currentIndex + delta);
    }

    function goToReview(n) {
      // n is 1-based in markup
      show(n - 1);
    }

    // Expose for inline onclick handlers in HTML
    window.changeReview = changeReview;
    window.goToReview = goToReview;

    // Initialize state
    // Ensure only one is visible
    cards.forEach(function (c, i) { c.style.display = i === currentIndex ? '' : 'none'; });
    show(currentIndex);

    // Auto-rotation
    var intervalMs = 5000;
    var timer = setInterval(function () { changeReview(1); }, intervalMs);

    function pause() { if (timer) { clearInterval(timer); timer = null; } }
    function resume() { if (!timer) { timer = setInterval(function () { changeReview(1); }, intervalMs); } }

    if (container) {
      container.addEventListener('mouseenter', pause);
      container.addEventListener('mouseleave', resume);
      container.addEventListener('touchstart', pause, { passive: true });
      container.addEventListener('touchend', resume, { passive: true });
    }
  });
})();