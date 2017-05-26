/*
**  apollo-client-ws -- GraphQL WebSocket Network Interface for Apollo Client
**  Copyright (c) 2017 Ralf S. Engelschall <rse@engelschall.com>
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

/*  external dependencies  */
import EventEmitter from "eventemitter3"

/*  standard Apollo Client Network Interface  */
export default class NetworkInterfaceStd extends EventEmitter {
    /*  initialize the network interface  */
    constructor (...args) {
        super()
        if (args.length === 2 && typeof args[0] === "string" && typeof args[1] === "object")
            this._args = { uri: args[0], opts: args[1] }
        else if (args.length === 1 && typeof args[0] === "object")
            this._args = args[0]
        else
            throw new Error("invalid arguments to NetworkInterface constructor (invalid number or type of arguments)")
        if (this._args.uri === undefined)
            throw new Error("invalid arguments to NetworkInterface constructor (missing URI)")
        this._middlewares = []
        this._afterwares  = []
    }

    /*  API: use a middleware  */
    use (middlewares) {
        middlewares.map((middleware) => {
            if (typeof middleware.applyMiddleware !== "function")
                throw new Error("Middleware must implement the applyMiddleware function")
            this._middlewares.push(middleware)
        })
        return this
    }

    /*  API: use an afterware  */
    useAfter (afterwares) {
        afterwares.map((afterware) => {
            if (typeof afterware.applyAfterware !== "function")
                throw new Error("Afterware must implement the applyAfterware function")
            this._afterwares.push(afterware)
        })
        return this
    }

    /*  INTERNAL: apply all middlewares  */
    applyMiddlewares ({ request, options }) {
        return new Promise((resolve, reject) => {
            const queue = (funcs, scope) => {
                const next = () => {
                    if (funcs.length > 0) {
                        const f = funcs.shift()
                        if (f)
                            f.applyMiddleware.apply(scope, [ { request, options }, next ])
                    }
                    else
                        resolve({ request, options })
                }
                next()
            }
            queue([ ...this._middlewares ], this)
        })
    }

    /*  INTERNAL: apply all afterwares  */
    applyAfterwares ({ response, options }) {
        return new Promise((resolve, reject) => {
            const responseObject = { response, options }
            const queue = (funcs, scope) => {
                const next = () => {
                    if (funcs.length > 0) {
                        const f = funcs.shift()
                        f.applyAfterware.apply(scope, [ responseObject, next ])
                    }
                    else
                        resolve(responseObject)
                }
                next()
            }
            queue([ ...this._afterwares ], this)
        })
    }
}

