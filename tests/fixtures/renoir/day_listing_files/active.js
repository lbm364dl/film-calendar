(function ($) {
    'use strict';

    // :: All Variables

    var bigshopWindow = $(window),
        wel_slides = $('.welcome_slides'),
        welSlidesTwo = $('.welSlideTwo');

    // :: Preloader Code

    bigshopWindow.on('load', function () {
        $('#preloader').fadeOut('1000', function () {
            $(this).remove();
        });
    });

    // :: Menu Code

    if ($.fn.classyNav) {
        $('#bigshopNav').classyNav();
    }

    // :: Fixed Top Dropdown Code    

    $(".classy-navbar-toggler").on("click", function () {
        $(".top-header-area").toggleClass("z-index-reduce");
    });
    $(".classycloseIcon, .language-currency-dropdown a.btn").on("click", function () {
        $(".top-header-area").removeClass("z-index-reduce");
    });
    $(".language-currency-dropdown a.btn").on("click", function () {
        $(".classy-menu").removeClass("menu-on");
        $(".navbarToggler").removeClass("active");
    });

    // :: Search Form Code    
    $(".search-btn").on("click", function () {
        $(".search-form").toggleClass("active");
    });

    // :: New Arrivals Slider Code

    if ($.fn.owlCarousel) {
        $(".megamenu-slides").owlCarousel({
            items: 1,
            margin: 0,
            loop: true,
            nav: true,
            navText: ['<i class="icofont-rounded-left"></i>', '<i class="icofont-rounded-right"></i>'],
            dots: false,
            autoplay: true,
            autoplayTimeout: 3000
        });
    }

    // :: Hero Slides Code - Home 1

    if ($.fn.owlCarousel) {
        wel_slides.owlCarousel({
            items: 1,
            margin: 0,
            loop: true,
            dots: true,
            nav: true,
            navText: ['<i class="icofont-rounded-left"></i>', '<i class="icofont-rounded-right"></i>'],
            autoplay: true,
            autoplayTimeout: 6000,
            smartSpeed: 800,
            animateIn: "fadeIn",
            animateOut: "fadeOut"
        });

        wel_slides.on('translate.owl.carousel', function () {
            var layer = $("[data-animation]");
            layer.each(function () {
                var anim_name = $(this).data('animation');
                $(this).removeClass('animated ' + anim_name).css('opacity', '0');
            });
        });

        $("[data-delay]").each(function () {
            var anim_del = $(this).data('delay');
            $(this).css('animation-delay', anim_del);
        });

        $("[data-duration]").each(function () {
            var anim_dur = $(this).data('duration');
            $(this).css('animation-duration', anim_dur);
        });

        wel_slides.on('translated.owl.carousel', function () {
            var layer = wel_slides.find('.owl-item.active').find("[data-animation]");
            layer.each(function () {
                var anim_name = $(this).data('animation');
                $(this).addClass('animated ' + anim_name).css('opacity', '1');
            });
        });
    }

    // :: Hero Slides Code - Home 2

    if ($.fn.owlCarousel) {
        welSlidesTwo.owlCarousel({
            items: 2,
            margin: 15,
            loop: true,
            center: true,
            nav: true,
            navText: ['<i class="icofont-rounded-left"></i>', '<i class="icofont-rounded-right"></i>'],
            dots: true,
            autoplay: true,
            smartSpeed: 1500,
            autoplayTimeout: 7000,
            autoplayHoverPause: true,
            responsive: {
                0: {
                    items: 1
                },
                480: {
                    items: 2
                }
            }
        });

        welSlidesTwo.on('translate.owl.carousel', function () {
            var layer = $("[data-animation]");
            layer.each(function () {
                var anim_name = $(this).data('animation');
                $(this).removeClass('animated ' + anim_name).css('opacity', '0');
            });
        });

        $("[data-delay]").each(function () {
            var anim_del = $(this).data('delay');
            $(this).css('animation-delay', anim_del);
        });

        $("[data-duration]").each(function () {
            var anim_dur = $(this).data('duration');
            $(this).css('animation-duration', anim_dur);
        });

        welSlidesTwo.on('translated.owl.carousel', function () {
            var layer = welSlidesTwo.find('.owl-item.center').find("[data-animation]");
            layer.each(function () {
                var anim_name = $(this).data('animation');
                $(this).addClass('animated ' + anim_name).css('opacity', '1');
            });
        });
    }


    // :: Tooltip Code

    if ($.fn.tooltip) {
        $('[data-toggle="tooltip"]').tooltip();
    }

    // :: Popup Gallery Code

    if ($.fn.magnificPopup) {
        $('.video_btn').magnificPopup({
            disableOn: 0,
            type: 'iframe',
            mainClass: 'mfp-fade',
            removalDelay: 160,
            preloader: true,
            fixedContentPos: false
        });
        $('.gallery_img').magnificPopup({
            type: 'image',
            gallery: {
                enabled: true
            }
        });
        $('.size_guide_img').magnificPopup({
            type: 'image',
            gallery: {
                enabled: true
            }
        });
    }

    // :: ScrollUp Code

    if ($.fn.scrollUp) {
        $.scrollUp({
            scrollSpeed: 1000,
            easingType: 'easeInOutQuart',
            scrollText: '<i class="icofont-rounded-up"></i>'
        });
    }

    // :: Popover Code

    if ($.fn.popover) {
        $('[data-toggle="popover"]').popover({
            html: true,
            trigger: 'hover',
            content: function () {
                return '<img src="' + $(this).data('img') + '" />';
            }
        });
    }


    // :: Price Range Code

    $('.slider-range-price').each(function () {
        var min = $(this).data('min'),
            max = $(this).data('max'),
            unit = $(this).data('unit'),
            value_min = $(this).data('value-min'),
            value_max = $(this).data('value-max'),
            label_result = $(this).data('label-result'),
            t = $(this);
        $(this).slider({
            range: true,
            min: min,
            max: max,
            values: [value_min, value_max],
            slide: function (event, ui) {
                var result = label_result + " " + unit + ui.values[0] + ' - ' + unit + ui.values[1];
                t.closest('.slider-range').find('.range-price').html(result);
            }
        });
    });

    // :: PreventDefault "a" Click

    $("a[href='#']").on('click', function ($) {
        $.preventDefault();
    });

    //::  WoW Active Code

    if (bigshopWindow.width() > 767) {
        new WOW().init();
    }

})(jQuery);