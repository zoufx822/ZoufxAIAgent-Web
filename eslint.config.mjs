import next from 'eslint-config-next'
import eslintConfigPrettier from 'eslint-config-prettier'

// eslint-config-next v16 直接导出 flat config 数组，无需 FlatCompat。
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
  // 关闭与 Prettier 冲突的格式化规则——格式交给 Prettier，ESLint 只管代码质量
  eslintConfigPrettier,
  {
    rules: {
      // 这两条 react-hooks v6 规则命中本仓库的合法惯用法，降级为 warn（保留可见、不阻断）：
      //  - set-state-in-effect：next-themes SSR 水合 guard（setMounted）、prop→state 同步、effect 内拉数据
      //  - refs：stream-markdown 打字机刻意在 render 写 ref（已在代码注释说明缘由）
      // 逐个消除需谨慎重构，不在本次清理范围。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]

export default eslintConfig
