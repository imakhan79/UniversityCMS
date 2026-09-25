/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer ships ESM-only and is only ever loaded client-side
  // via next/dynamic({ ssr: false }); this lets webpack bundle it.
  transpilePackages: ["@react-pdf/renderer"],
};

export default nextConfig;
