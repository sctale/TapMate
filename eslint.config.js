const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/*', 'dist/*', 'spark-output/*', '.expo/*'],
  },
  {
    rules: {
      // RN 惯用模式误报：effect 内载数 setState / useRef().current 读写（与 TapLedger 同款豁免）
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/no-direct-state-reference': 'off',
    },
  },
]);
