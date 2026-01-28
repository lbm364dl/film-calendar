(function ($, Drupal) {
  Drupal.behaviors.search_menu = {
    attach: function ( context, settings ) {
      $(once('search_menu', 'body', context)).each(function () {
        //Search block, autofocus and hiding the menu on mobile.
        $('[gumby-trigger="#block-bloquedebusqueda"]').click(function(e){
          if (!$(this).hasClass('active')) {
            $('#superfish-main-toggle').click();
            $('#edit-buscar').focus();
          }
        });
      });
    }
  };
})(jQuery, Drupal);
