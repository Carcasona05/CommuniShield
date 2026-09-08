import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // 0. Global Ignores
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.expo/**"],
  },

  // 1. Core Recommended Rules
  js.configs.recommended,
  
  // 2. Global Project Settings
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      sourceType: "unambiguous", 
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect", 
      },
    },
  },
  
  // 3. Recommended & Strict TypeScript Rules
  ...tseslint.configs.recommended,
  
  // 4. Recommended React Rules
  pluginReact.configs.flat.recommended,

  // 5. Code Efficiency & Redundancy Overrides
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    rules: {
      // --- 🟢 COMPATIBILITY ALLOWANCES ---
      "@typescript-eslint/no-require-imports": "off", // Allows mixed require/import
      "react/prop-types": "off",                      // Bypasses JavaScript prop validation

      // --- 🛑 REDUNDANCY & DEAD CODE DETECTION ---
      "no-unreachable": "error",             // Flags code written after a return statement
      "no-unused-private-class-members": "error", // Catches private properties never read
      "no-constant-condition": "warn",       // Flags loops/if statements stuck on true/false
      "no-empty": ["warn", { "allowEmptyCatch": true }], // Catches useless empty {} blocks
      "no-useless-computed-key": "error",    // Cleans up { ["x"]: y } down to { x: y }
      "no-useless-rename": "error",          // Flags redundant imports like { MyVar as MyVar }
      "no-useless-return": "error",          // Strips empty returns at the end of functions
      "no-self-assign": "error",             // Prevents redundant x = x assignments

      // --- 🚀 PERFORMANCE & EFFICIENCY ---
      "no-lonely-if": "warn",                // Converts nested "else { if (x) }" blocks into "else if"
      "prefer-const": "warn",                // Forces read-only variables to use const (aids engine speed)
      "object-shorthand": "warn",            // Enhances efficiency: changes { x: x } to just { x }
      
      // --- ⚛️ REACT CLEANUP ---
      "react/no-direct-mutation-state": "error", // Stops slow direct state mutations (e.g. this.state.x = 1)
      "react/jsx-no-duplicate-props": "error", // Eradicates duplicate properties on JSX items
      "react/self-closing-comp": "warn",     // Changes <div></div> to <div /> for lighter code
      "react/no-unused-state": "warn",       // Pinpoints state hooks/variables created but never used
    },
  },
]);