/** @type {import('next').NextConfig} */
const nextConfig = {
  // Our Node scripts (upload-jobs.js, classify-simple.js) live at the repo
  // root alongside the app. They are not part of the Next build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
