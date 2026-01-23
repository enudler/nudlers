import nextConfig from "eslint-config-next/core-web-vitals";

import tseslint from "typescript-eslint";

const eslintConfig = [
    ...nextConfig,
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        languageOptions: {
            parser: tseslint.parser,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
    {
        files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off"
        }
    },
    {
        rules: {
            "react/no-unescaped-entities": "off",
        },
    },

];

export default eslintConfig;
