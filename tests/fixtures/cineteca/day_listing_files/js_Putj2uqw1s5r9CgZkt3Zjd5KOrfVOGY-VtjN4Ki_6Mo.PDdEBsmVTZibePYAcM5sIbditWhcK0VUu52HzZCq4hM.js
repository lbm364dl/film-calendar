(function($, Drupal) {
  Drupal.behaviors.datepickerpopup = {
    attach: function (context, settings) {
      let datefilters = document.querySelectorAll('#block-formularioexpuestoschedulelist .js-form-type-date input')
      let textFilter = document.querySelector('input[data-drupal-selector="edit-s"]')
      let submitButton = document.querySelector('#block-formularioexpuestoschedulelist input[id*="edit-submit"]')

      datefilters.forEach(function (filter) {
        filter.addEventListener('change', function(event) {
          submitButton.click()
        })
      })

      textFilter.addEventListener('keyup', function () {
        if (this.textLength >= 2) {
          setTimeout(() => {
            submitButton.click()
          }, "500");
        }
      })

    }
  };
})(jQuery, Drupal);
