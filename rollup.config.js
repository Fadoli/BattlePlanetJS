import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import progress from 'rollup-plugin-progress';
import builtins from 'rollup-plugin-node-builtins';
import { terser } from 'rollup-plugin-terser';

export default [
    {
        input: 'src/client/index.js',
        output: [
            { file: '.bin/client/_script.min.js', format: 'cjs' },
            { file: 'src/client/_script.js', format: 'cjs' },
        ],
        plugins: [
            progress(),
            commonjs(),
            terser({
                include: /^.+\.min\.js$/
            }),
            resolve({
                // the fields to scan in a package.json to determine the entry point
                // if this list contains "browser", overrides specified in "pkg.browser"
                // will be used
                mainFields: ['module', 'main'], // Default: ['module', 'main']
                browser: true,  // Default: false
                preferBuiltins: false,
            }),
            builtins(),
            copy({
                targets: [
                    { src: 'src/client/index.html', dest: '.bin/client' },
                    { src: 'src/client/res/*', dest: '.bin/client/res' },
                ]
            })
        ]
    },
    {
        input: 'src/index.js',
        output: [
            { file: '.bin/index.js', format: 'cjs' },
        ],
        external: [
            'express',
            'socket.io'
        ],
        plugins: [
            progress(),
            commonjs(),
            json(),
            resolve({
                preferBuiltins: true,
            }),
        ]
    }
];