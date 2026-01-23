import nextConfig from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default [
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
        rules: {
            "react/no-unescaped-entities": "off",
        },
    },
];
