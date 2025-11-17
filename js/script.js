/**
 * JonK was here
 */

(function ($) {
  'use strict';

  // Google Analytics (gtag.js) - injected on all pages
  (function loadGoogleAnalytics() {
    var GA_MEASUREMENT_ID = 'G-K9PW1WKYKW';

    // If gtag is already defined or the script tag exists, don't load it again
    if (window.gtag || document.querySelector('script[src*="www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID + '"]')) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);

    var gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(gaScript);
  })();

  /* ========================================================================= */
  /*	Page Preloader
  /* ========================================================================= */
  $(window).on('load', function () {
    $('#preloader').fadeOut('slow', function () {
      $(this).remove();
    });
  });


  // navbarDropdown
	if ($(window).width() < 992) {
		$('#navigation .dropdown-toggle').on('click', function () {
			$(this).siblings('.dropdown-menu').animate({
				height: 'toggle'
			}, 300);
		});
  }
  
  //Hero Slider
  $('.hero-slider').slick({
    autoplay: true,
    infinite: true,
    arrows: true,
    prevArrow: '<button type=\'button\' class=\'prevArrow\'></button>',
    nextArrow: '<button type=\'button\' class=\'nextArrow\'></button>',
    dots: false,
    autoplaySpeed: 7000,
    pauseOnFocus: false,
    pauseOnHover: false
  });
  $('.hero-slider').slickAnimation();

  /* ========================================================================= */
  /*	Portfolio Filtering Hook
  /* =========================================================================  */
  // filter
  setTimeout(function(){
    var containerEl = document.querySelector('.filtr-container');
    var filterizd;
    if (containerEl) {
      filterizd = $('.filtr-container').filterizr({});
    }
  }, 500);

  /* ========================================================================= */
  /*	Testimonial Carousel
  /* =========================================================================  */
  //Init the slider
  $('.testimonial-slider').slick({
    infinite: true,
    arrows: true,
    autoplay: true,
    autoplaySpeed: 2000,
    appendArrows: $('.testimonial-slider-wrapper'),
    prevArrow: '<button type="button" class="slick-prev"><i class="tf-ion-chevron-left"></i></button>',
    nextArrow: '<button type="button" class="slick-next"><i class="tf-ion-chevron-right"></i></button>'
  });


  /* ========================================================================= */
  /*	Clients Slider Carousel
  /* =========================================================================  */
  //Init the slider
  $('.clients-logo-slider').slick({
    infinite: true,
    arrows: false,
    autoplay: true,
    autoplaySpeed: 2000,
    slidesToShow: 5,
    slidesToScroll: 1,
    responsive: [{
      breakpoint: 1024,
      settings: {
        slidesToShow: 4,
        slidesToScroll: 1,
        infinite: true,
        dots: false
      }
    },
    {
      breakpoint: 480,
      settings: {
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false
      }
    }
    ]
  });

  /* ========================================================================= */
  /*	Company Slider Carousel
  /* =========================================================================  */
  $('.company-gallery').slick({
    infinite: true,
    arrows: false,
    autoplay: true,
    autoplaySpeed: 2000,
    slidesToShow: 5,
    slidesToScroll: 1,
    responsive: [{
      breakpoint: 1024,
      settings: {
        slidesToShow: 4,
        slidesToScroll: 1,
        infinite: true,
        dots: false
      }
    },
    {
      breakpoint: 667,
      settings: {
        slidesToShow: 3,
        slidesToScroll: 1,
        arrows: false
      }
    },
    {
      breakpoint: 480,
      settings: {
        slidesToShow: 2,
        slidesToScroll: 1,
        arrows: false
      }
    }
    ]
  });

  /* ========================================================================= */
  /*	On scroll fade/bounce effect
  /* ========================================================================= */
  var scroll = new SmoothScroll('a[href*="#"]');

  // -----------------------------
  //  Count Up
  // -----------------------------
  function counter() {
    var oTop;
    if ($('.counter').length !== 0) {
      oTop = $('.counter').offset().top - window.innerHeight;
    }
    if ($(window).scrollTop() > oTop) {
      $('.counter').each(function () {
        var $this = $(this),
          countTo = $this.attr('data-count');
        $({
          countNum: $this.text()
        }).animate({
          countNum: countTo
        }, {
          duration: 1000,
          easing: 'swing',
          step: function () {
            $this.text(Math.floor(this.countNum));
          },
          complete: function () {
            $this.text(this.countNum);
          }
        });
      });
    }
  }

  // -----------------------------
  //  Scroll progress bar
  // -----------------------------
  function updateScrollProgress() {
    var $scrollProgress = $('.scroll-progress');
    if (!$scrollProgress.length) return;
    var scrollTop = $(window).scrollTop();
    var docHeight = $(document).height() - $(window).height();
    var progress = docHeight > 0 ? scrollTop / docHeight : 0;
    progress = Math.min(Math.max(progress, 0), 1);
    $scrollProgress.css('--scroll-progress', progress);
  }

  // -----------------------------
  //  On Scroll
  // -----------------------------
  $(window).scroll(function () {
    counter();
    updateScrollProgress();

    var scroll = $(window).scrollTop();
    if (scroll > 50) {
      $('.navigation').addClass('sticky-header');
    } else {
      $('.navigation').removeClass('sticky-header');
    }
  });

  // Initialize scroll progress on load
  updateScrollProgress();

  // -----------------------------
  //  Ensure scroll progress bar exists
  // -----------------------------
  function ensureScrollProgressBar() {
    // Skip 404 page
    if (document.querySelector('.page-404')) return;

    // If a scroll bar already exists on the page, do nothing
    if (document.querySelector('.scroll-progress')) return;

    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
  }

  ensureScrollProgressBar();

})(jQuery);
