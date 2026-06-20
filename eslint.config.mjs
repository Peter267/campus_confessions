import nextConfig from 'eslint-config-next';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'build.log', 'typecheck.log', 'eslint.log', 'next-env.d.ts']
  },
  ...nextConfig
];
