import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Next.js otherwise appends a generated block to CLAUDE.md on every
   * `next dev`. CLAUDE.md holds this project's binding architecture rules and
   * is maintained by hand, so the generator stays off.
   */
  agentRules: false,
};

export default nextConfig;
