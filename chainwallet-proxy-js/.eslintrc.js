module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'standard',
    'eslint:recommended',
    'plugin:prettier/recommended',
    'plugin:node/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  settings: {
    /** Use TypeScript resolver so we can use `baseUrl` and `paths` */
    'import/resolver': {
      // {} is required for some reason, cant find a link to it anymore :(
      typescript: {},
    },
    /** Configure node plugin to include TS files */
    node: { tryExtensions: ['.js', '.ts', '.tsx'] },
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    project: ['./tsconfig.json']
  },
  rules: {
    'node/no-unsupported-features/es-syntax': [
      'error',
      { ignores: ['modules'] },
    ],
    'node/no-missing-import': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error'],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        semi: false,
        printWidth: 90
      },
    ],
    'import/named': 'off',
    'import/namespace': 'off',
    'import/default': 'off',
    'import/export': 'off',
    'import/no-duplicates': 'off',
    'import/no-unresolved': 'off',
  },
}
