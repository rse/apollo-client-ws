/*
**  Apollo-Client-WS -- GraphQL WebSocket Network Link for Apollo Client
**  Copyright (c) 2017-2019 Dr. Ralf S. Engelschall <rse@engelschall.com>
**
**  Permission is hereby granted, free of charge, to any person obtaining
**  a copy of this software and associated documentation files (the
**  "Software"), to deal in the Software without restriction, including
**  without limitation the rights to use, copy, modify, merge, publish,
**  distribute, sublicense, and/or sell copies of the Software, and to
**  permit persons to whom the Software is furnished to do so, subject to
**  the following conditions:
**
**  The above copyright notice and this permission notice shall be included
**  in all copies or substantial portions of the Software.
**
**  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
**  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
**  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
**  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
**  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
**  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
**  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/* global module: true */
module.exports = function (grunt) {
    grunt.loadNpmTasks("grunt-contrib-clean")
    grunt.loadNpmTasks("grunt-browserify")
    grunt.loadNpmTasks("grunt-eslint")
    grunt.initConfig({
        eslint: {
            options: {
                configFile: "eslint.yaml"
            },
            "gruntfile": [ "Gruntfile.js" ],
            "apollo-client-ws": [ "src/**/*.js" ]
        },
        browserify: {
            "apollo-client-ws-browser": {
                files: {
                    "lib/apollo-client-ws.browser.js": [ "src/apollo-client-ws.js" ]
                },
                options: {
                    transform: [
                        [ "envify", { PLATFORM: "browser" } ],
                        [ "babelify", {
                            presets: [
                                [ "@babel/preset-env", {
                                    "targets": {
                                        "browsers": "last 2 versions, > 1%, ie 11"
                                    }
                                } ]
                            ]
                        } ],
                        "browserify-shim",
                        [ "uglifyify", { sourceMap: false, global: true } ]
                    ],
                    plugin: [
                        [ "browserify-derequire" ],
                        [ "browserify-header" ]
                    ],
                    browserifyOptions: {
                        standalone: "ApolloClientWS",
                        debug: false
                    }
                }
            },
            "apollo-client-ws-node": {
                files: {
                    "lib/apollo-client-ws.node.js": [ "src/apollo-client-ws.js" ]
                },
                options: {
                    transform: [
                        [ "envify", { PLATFORM: "node" } ],
                        [ "babelify", {
                            presets: [
                                [ "@babel/preset-env", {
                                    "targets": {
                                        "node": "8.0.0"
                                    }
                                } ]
                            ]
                        } ]
                    ],
                    plugin: [
                        [ "browserify-derequire" ],
                        [ "browserify-header" ]
                    ],
                    external: [
                        "graphql",
                        "graphql-query-compress",
                        "graphql/language/printer",
                        "apollo-link",
                        "eventemitter3",
                        "es6-promise",
                        "latching",
                        "ducky",
                        "ws",
                        "websocket-framed",
                        "utf-8-validate",
                        "bufferutil"
                    ],
                    browserifyOptions: {
                        standalone: "ApolloClientWS",
                        debug: false
                    }
                }
            }
        },
        clean: {
            clean: [],
            distclean: [ "node_modules" ]
        }
    })
    grunt.registerTask("default", [ "eslint", "browserify" ])
}

