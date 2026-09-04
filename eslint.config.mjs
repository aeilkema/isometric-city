import nextConfig from 'eslint-config-next';

/**
 * IsoCity deliberately uses mutable refs for high-frequency game-engine state
 * (vehicles, particles, canvas caches and latest simulation snapshots). Those
 * refs are not React-render state and mutating them is essential to avoid
 * allocating thousands of objects per frame. Likewise, a few legacy UI flows
 * synchronise modal/localStorage state from effects.
 *
 * Keep the useful Next/React rules enabled, but do not apply compiler purity
 * rules that assume application state is exclusively declarative React state.
 */
const config = [
  ...nextConfig,
  {
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
