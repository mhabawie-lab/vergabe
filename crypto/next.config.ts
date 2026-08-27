import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // CRYPTO.md holds this project's binding rules and is maintained by hand.
  agentRules: false,
  turbopack: {
    /*
     * This app lives in a subdirectory of a repository whose root holds an
     * unrelated Next.js project. Without an explicit root, Turbopack walks up to
     * the outer lockfile and pulls that project's middleware into this build.
     */
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
