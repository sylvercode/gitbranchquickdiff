import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        ignores: [
            'out/',
            'dist/',
            'build/',
            'coverage/',
            '**/*.min.js',
            '**/*.d.ts',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            '@typescript-eslint/naming-convention': 'warn',
            '@stylistic/semi': 'warn',
            'curly': 'warn',
            'eqeqeq': 'warn',
            'no-throw-literal': 'warn',
            'semi': 'off',
        },
    },
];
