(function($, Drupal) {
  'use strict';

  var App = {};

  App.slider = function($selector, options) {
    // Cannot use default value in signature because of shitty IE.
    if (typeof options === 'undefined') {
      options = {};
    }
    if (!$selector.length || $selector.children().length < 2 || $selector.hasClass('slick-initialized')) {
      return;
    }

    var defaults = {
      dots: true,
      slidesToShow: 3,
      slidesToScroll: 3,
      adaptiveHeight: true,
      responsive: [
        {
          breakpoint: 768,
          settings: {
            slidesToShow: 2,
            slidesToScroll: 2
          }
        },
        {
          breakpoint: 420,
          settings: {
            slidesToShow: 1,
            slidesToScroll: 1
          }
        }
      ]
    };
    $.extend(defaults, options);

    $selector.slick(defaults);
  };

  Drupal.behaviors.slider = {
    attach: function (context, settings) {
      // Execute sliders.
      $(once('slider', context === document ? 'html' : context)).each(function(index, element) {
        $.each(drupalSettings.slider, function(index, value) {
          if ($(element).find(value.selector).length == 0) {
            // continue cannot be used here.
            return true;
          }
          var $selector = $(value.selector);
          App.slider($selector, value.options);

          // Autoplaying videos inside sliders doesn't work well in chrome as it
          // doesn't like surrounding html to be modified. Because of that we
          // need to make it play in js.
          $selector.find('video[autoplay]').each(function(i, e) {
            $(e).attr('muted', true);
            e.play();
          });
        });
      });
    }
  };

  Drupal.behaviors.nb_common = {
    attach: function ( context, settings ) {
      $(document).ready(function() {
        // Close colorbox dialog when do click on iframe block link.
        $('.js-nb-iframe__link').on('click', function () {
          $.colorbox.close();
        })
      });
    }
  }

})(jQuery, Drupal);
