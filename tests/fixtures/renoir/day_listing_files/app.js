// Formulario para loguearse
$("#form-login").submit(function(e) {
    e.preventDefault();
    bloqueaPantalla('procesando...');
    $('#error-form-login').html('')
    $('#btn-login').attr("disabled", true);

    var form = $(this);
    var url = form.attr('action');
    var error = $('#error-form-login')

    $.ajax({
        type: "POST",
        dataType: "json",
        url: url,
        data: form.serialize(),
        success: function(data)
        {
            if(data.error){
                desbloqueaPantalla()
                if(data.tipo == '500')
                    error.html('<div class="alert alert-danger">Lo sentimos, ha ocurrido un error inesperado. Si el problema persiste ponte en contacto a través de nuestro <a href="/contacto/">formulario.</a></div>')
                if(data.tipo == 'socio no existe')
                    error.html('<div class="alert alert-danger">La tarjeta y la contraseña introducidas no se corresponden con ningún socio. Si tienes problemas con el acceso puede consultar <a href="/faq-preguntas-frecuentes/no-puedo-acceder-a-descuentos-en-pillalas-o-a-mi-zona-de-socio-porque-no-encuentra-socio-al-meter-mis-datos-de-acceso/">aquí.</a></div>')
                if(data.tipo == 'permisos')
                    error.html('<div class="alert alert-danger">Error de permisos</div>')
                if(data.tipo == 'rellenar')
                    error.html('<div class="alert alert-danger">Debe rellenar ambos campos</div>')
                if(data.tipo == 'campos')
                    error.html('<div class="alert alert-danger">Lo sentimos, ha ocurrido un error inesperado. Si el problema persiste ponte en contacto a través de nuestro <a href="/contacto/">formulario.</a></div>')
                $('#btn-login').attr("disabled", false);
            }else{
                window.location.href = data.url;
            }
        }
    });
})


// Formulario para cambiar la password
$("#form-cambia-password").submit(function(e) {
    e.preventDefault();
    bloqueaPantalla('procesando...');
    $('#error-form-cambia-password').html('')
    $('#btn-cambia-password').attr("disabled", true);

    var form = $(this);
    var url = form.attr('action');
    var error = $('#error-form-cambia-password')

    $.ajax({
        type: "POST",
        dataType: "json",
        url: url,
        data: form.serialize(),
        success: function(data)
        {
            if(data.error){
                desbloqueaPantalla()
                if(data.tipo == 'password no valida')
                    error.html('<div class="alert alert-danger">Contraseña no válida. La contraseña debe tener al menos 8 caractéres (máximo 20), contener al menos 1 número y no contener espacios en blanco.</div>')
                if(data.tipo == 'password diferente')
                    error.html('<div class="alert alert-danger">Las contraseñas introducidas no coinciden</div>')
                if(data.tipo == 'solicitud caducada')
                    window.location.href = '/club-renoir/solicitud/caducada/'
                if(data.tipo == 'solicitud no valida')
                    window.location.href = '/club-renoir/solicitud/invalida/'
                if(data.tipo == '500')
                    error.html('<div class="alert alert-danger">Lo sentimos, ha ocurrido un error inesperado. Si el problema persiste ponte en contacto a través de nuestro <a href="/contacto/">formulario.</a></div>')
                $('#btn-cambia-password').attr("disabled", false);
            }else{
                window.location.href = data.url;
            }
        }
    });
})

// Formulario para recuperar la password
$("#form-recuperar-password").submit(function(e) {
    e.preventDefault();
    bloqueaPantalla('Enviando formulario...')
    $('#btn-recuperar-password').attr("disabled", true);
    $('#error-form-recuperar').html('')

    var form = $(this);
    var url = form.attr('action');
    var error = $('#error-form-recuperar')

    data = $('#form-recuperar').serialize()
    $.ajax({
        type: "POST",
        dataType: "json",
        url: url,
        data: form.serialize(),
        success: function(data) {
            if(data.error){
                desbloqueaPantalla()
                if(data.tipo == 'rellenar')
                    error.html('<div class="alert alert-danger">Debe rellenar ambos campos</div>')
                if(data.tipo == 'no-socio')
                    error.html('<div class="alert alert-danger">Lo sentimos. No existe ningún socio con los datos proporcionados.</div>')
                if(data.tipo == 'varios-socios')
                    error.html('<div class="alert alert-danger">Varios socios comparten este email. Ponte en <a href="/contacto/">contacto</a> para solucionar el problema</div>')
                if(data.tipo == '500')
                    error.html('<div class="alert alert-danger">Lo sentimos, ha ocurrido un error inesperado. Si el problema persiste ponte en contacto a través de nuestro <a href="/contacto/">formulario.</a></div>')
                $('#btn-recuperar-password').attr("disabled", false);
            }else{
                window.location.href = "/club-renoir/recuperar/solicitado/?email="+data.email;
            }
        }
    });
});


// Formulario para editar datos del socio
$('#cambio-datos-club').formValidation({
    framework: 'bootstrap',
    locale: 'es_ES',
    fields: {
    	email: {
    		validators: {
                emailAddress: {}
    		}
    	},
    	provincia: {
    		validators: {
                notEmpty: {message: 'Debes indicar la provincia a la que pertenecen los cines que más asistes. '},
    		}
    	},
    	telefono: {
    		validators: {
    		    stringLength: {
                        max: 16,
                    },
                notEmpty: {message: 'Debes indicar tu código teléfono. '},
    		}
    	},
    	codigo_postal: {
    		validators: {
    		    stringLength: {
                        max: 10,
                    },
                notEmpty: {message: 'Debes indicar tu código postal.'},
    		}
    	},
    	repiteEmail: {
              validators: {
                   emailAddress: {},
                   identical: {
                       field: 'email',
                       message: 'Los emails no coinciden. '
                   }
               }
           },
    }
}).on('success.form.fv', function(e) {
   e.preventDefault();
   $('#errores-cambio-datos-club').hide()
   bloqueaPantalla('Enviando formulario...')
   data = $('#cambio-datos-club').serialize() + '&csrfmiddlewaretoken={{ csrf_token }}'
   $.ajax({
       data: data,
         type: "POST",
         dataType: "json",
         url: '/club-renoir/editar-datos/',
       success: function(data) {
       	if(!data.error){
            window.location.href = '/club-renoir/';
       	}else{
       	    desbloqueaPantalla();
       	    $('#errores-cambio-datos-club').show()
       	    $('html, body').animate({
                scrollTop: $('#errores-cambio-datos-club').offset().top-40
            }, 500);
       	}
       },
       error: function() {
            desbloqueaPantalla();
            $('#errores-cambio-datos-club').show()
            $('html, body').animate({
                scrollTop: $('#errores-cambio-datos-club').offset().top-40
            }, 500);
         }
   });
});





