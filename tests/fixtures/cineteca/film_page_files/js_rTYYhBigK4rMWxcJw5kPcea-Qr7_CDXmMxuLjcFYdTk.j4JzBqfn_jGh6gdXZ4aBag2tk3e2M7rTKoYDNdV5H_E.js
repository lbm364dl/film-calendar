/**
 * Main theme app script
 */

(function ($, Drupal) {

  'use strict';

  // Declare App Object
  var App = {};

  /**
   * Generic module with Application functions and initializations
   *
   * @example
   * App.Application.run();
   */
  App.Application = {

    /**
     * Methods for this module
     */
    methods: {

      /**
       * Superfish menu, add "activeParent" class to active <li>
       */
      actualizaMenu: function() {
        $('#superfish-main .is-active:not(:last-child)').parent().addClass("activeParent");
      },

      /**
       * Clone secondary menu into primary menu, for mobile devices
       */
      menuSecondaryClone: function(){
        $('[gumby-trigger="#block-bloquedebusqueda"]').parent().before($('#superfish-secondary-navigation').children().clone());
      }
    },


    /**
     * Public function for run method
     */
    run: function() {

      // Execute all functions
      var m = this.methods;
      for ( var key in this.methods ) {
        m[key]();
      }

    }

  };
    /**
     * Function to show/hide the video embed when click on
     * play icon in the home banner.
     *
     * @private
     */
    function _videoInBanner(context, settings) {

      var bannerHomeDOM = 'body.path-frontpage .view-id-banner';
      if($(context).find(bannerHomeDOM + ' .js-play-video-btn a.open').length > 0) {
        // $(bannerHomeDOM + ' .js-play-video-btn a.open').once().on('click', function (e) {
        $(once('intermediae_theme', bannerHomeDOM + ' .js-play-video-btn a.open')).on('click', function (e) {
          e.preventDefault();

          // Selected button
          const $wrapper = $(e.target).closest('.video-wrap');
          const $realTarget = $wrapper.find('.video-embed-field-launch-modal');

          // Show the embed video.
          $.colorbox($.extend(settings.colorbox, {'html': $realTarget.data('video-embed-field-modal')}));

        });
      }
    }
  /**
   * Attach the App code to Drupal.
   */
  Drupal.behaviors.cineteca_theme = {
    attach: function ( context, settings ) {
      $(once('cineteca_theme', 'body', context)).each(function () {
        App.Application.run();
      });

      $(document).ready(function() {
        // Display video field at home banner.
        _videoInBanner(context, settings);

        // If there is no video, the div with class .video-wrap must be hidden in order to access the image link.
        $(context).find('.node--type-banner').each(function(){
          if($(this).find('.video-wrap .field-name-field-video-banner').length == 0){
            $(this).find('.video-wrap').addClass('hidden');
          }
        });
      });

      $(function () {
        var arrow_height = $('.slick-arrow').outerHeight();
        var img_height = $('.field-name-field-image').height();
        var new_height = (img_height / 2);
        $('.slick-arrow').css('top', new_height + 'px');
      });

      // download newsletter file in html format
      $('.view-newsletter .js-btn-export').off('click').on('click', function () {
        var title = $('.newsletter-title .js-nl-title').text();
        var titleToUrl = cleanTitle(title);
        var fileName = titleToUrl + '.html';
        var header =  '<html><head><meta charset="UTF-8"></head><body>';
        var html = $('.view-newsletter .view-content').html();
        var footer = '</body></html>'
        var completeHtml = header + html + footer;

        var saveFile = (function () {
          var a = document.createElement("a");
          document.body.appendChild(a);
          a.style = "display: none";
          return function (completeHtml, fileName) {
            var fileBlob = new Blob([completeHtml], {type: "text/html"});
            var fileUrl = URL.createObjectURL(fileBlob);

            if(navigator.userAgent.search("MSIE") >= 0) { // explorer or edge
              window.navigator.msSaveOrOpenBlob(fileBlob, fileName);
            }else{
              a.href = fileUrl;
              a.download = fileName;
              a.click();
            }
          };
        }());

        saveFile(completeHtml, fileName);
      });

      function cleanTitle(string) {
        return string
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[áàäâå]/, 'a')
            .replace(/[éèëê]/, 'e')
            .replace(/[íìïî]/, 'i')
            .replace(/[óòöô]/, 'o')
            .replace(/[úùüû]/, 'u')
            .replace(/[ñ]/, 'n')
            .replace(/[ç]/, 'c')
            .replace(/\s+/g, "-")
            .replace(/[^\w\-]+/g, "")
            .replace(/\-\-+/g, "-")
            .replace(/^-+/, "")
            .replace(/-+$/, "");
      }
    }
  };

})(jQuery, Drupal);
