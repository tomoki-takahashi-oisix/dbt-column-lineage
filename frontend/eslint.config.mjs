import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    // eslint-config-next 16 で新たに有効化された React Compiler 系ルールは、
    // このプロジェクト(React Compiler 未使用)では既存コードを大量に error 扱いする。
    // 旧 next/core-web-vitals(v14)と同じく error にはせず、warn として可視化に留める。
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**'],
  },
]

export default eslintConfig
