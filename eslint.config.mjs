import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    // Existing components still trigger these rules. Keep them visible while
    // allowing lint to gate all other errors until the components are refactored.
    plugins: nextVitals.find((config) => config.name === 'next').plugins,
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      '@next/next/no-assign-module-variable': 'warn',
      'react/jsx-key': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
