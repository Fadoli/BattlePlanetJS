import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import progress from 'rollup-plugin-progress';

export default [
    /*
    {
        input: 'src/client/index.js',
        output: [
            { file: '.bin/client/scripts.compiled.min.js', format: 'cjs' },
            { file: 'src/client/scripts.compiled.js', format: 'cjs' },
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
                    { src: 'src/client/lib/*', dest: '.bin/client/lib' },
                ]
            })
        ]
    },
    */
    {
        input: 'src/index.js',
        output: [
            { file: '.bin/index.js', format: 'cjs' },
        ],
        external: [
            // 'express',
            'socket.io'
        ],
        plugins: [
            progress(),
            commonjs(),
            json(),
            resolve({
                preferBuiltins: true,
            }),
            copy({
                targets: [
                    { src: 'src/client', dest: '.bin' },
                ]
            })
        ]
    }
];