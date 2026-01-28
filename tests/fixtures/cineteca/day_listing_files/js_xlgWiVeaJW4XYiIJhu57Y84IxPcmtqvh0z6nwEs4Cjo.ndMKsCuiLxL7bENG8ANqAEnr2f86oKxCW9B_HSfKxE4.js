(function($, Drupal, once) {
  Drupal.behaviors.share = {
    attach: function (context, settings) {
      //shares content on social networks
      $(once('share-twitter', '.st-custom-button.twitter', context)).each(function(index, element) {
        $(element).on('click', function(e){
          e.preventDefault();
          window.open(drupalSettings.mdcommon.twitter, 'twitter', 'width=800, height=500');
        });
      });
      $(once('share-facebook', '.st-custom-button.facebook', context)).each(function(index, element){
        $(element).on('click', function(e){
          e.preventDefault();
          window.open(drupalSettings.mdcommon.facebook, 'facebook', 'width=800, height=500');
        });
      });
    }
  };
})(jQuery, Drupal, once);
