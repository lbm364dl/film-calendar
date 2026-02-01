document.cookie = "mostrar_cookie=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
document.cookie = "mostrar_cookie=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.cinesrenoir.com";
document.cookie = "mostrar_cookie=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=www.cinesrenoir.com";

// Comprobar si la nueva cookie 'cc_cookie' existe
if (!document.cookie.split(';').some((item) => item.trim().startsWith('cc_cookie='))) {
    deleteAnalyticsCookies()
}

function deleteAnalyticsCookies() {

    let cookies = document.cookie.split(";");


    cookies.forEach(cookie => {
        let cookieName = cookie.split("=")[0].trim();

        if (cookieName.startsWith("_ga") || cookieName.startsWith("_gat") || cookieName.startsWith("_gid")) {
            document.cookie = cookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = cookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.cinesrenoir.com";
            document.cookie = cookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.cinesrenoir.com";
        }
    });
}

function blockGoogleAnalytics() {
    // Bloqueamos GA4 antes de eliminar cookies
    window['ga-disable-UA-7242790-1'] = true;  // Para Universal Analytics
    window['ga-disable-G-0VY3D77DL2'] = true;  // Para GA-4
    // Eliminamos cookies
    deleteAnalyticsCookies();
}


/* Cookies */
CookieConsent.run({
    cookie: {
        domain: ".cinesrenoir.com" // Asegura que la cookie sea accesible en todos los subdominios
    },
    guiOptions: {
        consentModal: {
            layout: 'bar',           // Define el diseño como una barra
            position: 'bottom center', // Posiciona la barra en la parte inferior central
            // Otras opciones...
        },
        // Configuración del modal de preferencias si es necesario...
    },
    categories: {
        necessary: {
            enabled: true,  // Esta categoría está activada por defecto
            readOnly: true  // No se puede desactivar
        },
        analytics: {},  // Google Analytics 4
        multimedia: {}  // YouTube
    },

    language: {
        default: 'es',
        translations: {
            es: {
                consentModal: {
                    title: 'Usamos cookies',
                    description: 'Utilizamos cookies necesarias para el funcionamiento de la web y cookies de terceros, como las de Google Analytics y YouTube, que nos ayudan a mejorar la experiencia del usuario y a analizar estadísticas de uso.',
                    acceptAllBtn: 'Aceptar todas',
                    acceptNecessaryBtn: 'Rechazar todas',
                    showPreferencesBtn: 'Gestionar preferencias'
                },
                preferencesModal: {
                    title: 'Gestionar preferencias de cookies',
                    acceptAllBtn: 'Aceptar todas',
                    acceptNecessaryBtn: 'Rechazar todas',
                    savePreferencesBtn: 'Guardar selección',
                    closeIconLabel: 'Cerrar',
                    sections: [
                        {
                            title: 'Uso de cookies',
                            description: 'Utilizamos cookies necesarias para el funcionamiento de la web y cookies de terceros, como las de Google Analytics y YouTube, que nos ayudan a mejorar la experiencia del usuario y a analizar estadísticas de uso. Puede aceptar todas las cookies pulsando "Aceptar todas", rechazarlas pulsando "Rechazar todas" o configurar sus preferencias en "Personalizar cookies".'
                        },
                        {
                            title: 'Cookies necesarias',
                            description: 'Estas cookies son esenciales para el funcionamiento del sitio y no se pueden desactivar.',
                            linkedCategory: 'necessary'
                        },
                        {
                            title: 'Cookies de análisis',
                            description: 'Nos ayudan a mejorar el sitio recopilando información sobre el uso de la web.',
                            linkedCategory: 'analytics'
                        },
                        {
                            title: 'Cookies de multimedia',
                            description: 'Se utilizan para habilitar la reproducción de vídeos de YouTube.',
                            linkedCategory: 'multimedia'
                        },
                        {
                            title: 'Más información',
                            description: 'Para más detalles, consulta nuestra <a href="/politica-de-cookies/">Política de Cookies</a>.'
                        }
                    ]
                }
            }
        }
    },
    onChange: function({changedCategories, changedServices}) {
        if (changedCategories.includes('analytics')) {
            if (CookieConsent.acceptedCategory('analytics')) {
            } else {
                blockGoogleAnalytics();
            }
        }
    }
});
/* End Cookies */