/** @type {import('next').NextConfig} */
const nextConfig = {
  // Generate a static export (replaces `next export`)
  output: 'export',
  images: {
    // Use direct image URLs so static hosting on S3/CloudFront works without the image optimizer
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'd1ocinx0434jpv.cloudfront.net',
        pathname: '/**',
      },
    ],
  },
  // allowedDevOrigins: ['*'],
  // images: {
  //   remotePatterns: [
  //     {
  //       protocol: 'https',
  //       hostname: 'd1ocinx0434jpv.cloudfront.net',
  //       pathname: "/**",
  //     },
  //   ],
  // },
};

export default nextConfig;
