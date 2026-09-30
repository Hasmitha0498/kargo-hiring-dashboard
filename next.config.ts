import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // pdf parsing uses a bundled pdf.js build; keep it out of the server bundle so it loads as-is.
  serverExternalPackages: ['unpdf', 'mammoth'],
};

export default nextConfig;
