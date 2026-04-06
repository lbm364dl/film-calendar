import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-FKN0ELREQD';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.madridfilmcalendar.com'),
  title: 'Madrid Film Calendar — Cartelera de cine independiente en Madrid',
  description: 'Cartelera de cine independiente y alternativo en Madrid. Sesiones, horarios y películas en Cineteca, Doré, Sala Berlanga, Sala Equis, Cines Renoir, Golem, Embajadores, Cine Paz, Verdi y más. Actualizado a diario.',
  keywords: 'cartelera madrid, cine independiente madrid, cine alternativo madrid, cineteca, doré, sala berlanga, sala equis, renoir, golem, embajadores, cine paz, verdi, sesiones cine madrid, VOSE madrid, películas madrid, cine de autor madrid, filmoteca española',
  authors: [{ name: 'Madrid Film Calendar' }],
  alternates: {
    canonical: 'https://www.madridfilmcalendar.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.madridfilmcalendar.com/',
    title: 'Madrid Film Calendar — Cartelera de cine independiente en Madrid',
    description: 'Cartelera de cine independiente y alternativo en Madrid. Sesiones, horarios y películas en Cineteca, Doré, Sala Berlanga, Sala Equis, Renoir, Golem, Embajadores y más. Actualizado a diario.',
    siteName: 'Madrid Film Calendar',
    locale: 'es_ES',
    alternateLocale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Madrid Film Calendar — Cartelera de cine independiente en Madrid',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Madrid Film Calendar — Cartelera de cine independiente en Madrid',
    description: 'Cartelera de cine independiente y alternativo en Madrid. Sesiones y horarios en Cineteca, Doré, Sala Berlanga, Renoir, Golem y más.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="theme-color" content="#0f0f0f" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "Madrid Film Calendar",
              "alternateName": "Cartelera de cine independiente en Madrid",
              "url": "https://www.madridfilmcalendar.com/",
              "description": "Cartelera de cine independiente y alternativo en Madrid. Sesiones, horarios y películas en Cineteca, Doré, Sala Berlanga, Sala Equis, Cines Renoir, Golem, Embajadores y más.",
              "applicationCategory": "EntertainmentApplication",
              "operatingSystem": "Web",
              "inLanguage": ["es", "en"],
              "isAccessibleForFree": true,
              "areaServed": {
                "@type": "City",
                "name": "Madrid",
                "containedInPlace": { "@type": "Country", "name": "España" }
              }
            })
          }}
        />
        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
