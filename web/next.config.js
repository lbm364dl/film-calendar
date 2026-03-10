/** @type {import('next').NextConfig} */
const nextConfig = {
  // No basePath needed for Vercel (it serves at root)
  // If you need a basePath for subdirectory hosting, uncomment:
  // basePath: '/film-calendar',

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
