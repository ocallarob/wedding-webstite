/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd1ocinx0434jpv.cloudfront.net',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
