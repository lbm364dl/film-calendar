/**
 * @file: Theme js
 */

(function ($, Drupal) {

  Drupal.behaviors.cookies_handler = {

    attach: function(context, settings) {
      $(function() {
        if ($('#sliding-popup').length !== 0) {
          let overlay = $('.eu-cookie-compliance-categories-modal-overlay');
          let element = $('.eu-cookie-compliance-category summary');
          let save_preferences = $('.eu-cookie-compliance-save-preferences-button');

          $('.eu-cookie-compliance-open-dialog,' +
              '.eu-cookie-compliance-dialog-close span,' +
              '.eu-cookie-compliance-save-preferences-button').click(function(){
            overlay.toggle();
          });
          $(element).click(function() {
            $(this).parent().toggleClass('active');
          });
        }
      });
    },
  }
})(jQuery, Drupal);