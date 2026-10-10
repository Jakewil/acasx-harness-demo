import { defineConfig } from 'oxfmt'

export default defineConfig({
  semi: false,
  tabWidth: 2,
  singleQuote: true,
  endOfLine: 'lf',
  printWidth: 140,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'avoid',
  objectWrap: 'preserve',
  experimentalOperatorPosition: 'start',
  proseWrap: 'preserve',
  sortPackageJson: false,
  sortTailwindcss: false,
  ignorePatterns: ['auto-imports.d.ts', 'components.d.ts', 'env.d.ts', 'public', 'src/routeTree.gen.ts', 'src/assets/imgs.ts'],
})
