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
import WebSocket                      from "ws"
import { print as printGraphQLQuery } from "graphql/language/printer"
import compressGraphQLQuery           from "graphql-query-compress"
import Latching                       from "latching"

/*  internal dependencies  */
import NetworkInterfaceStd            from "./apollo-client-std"

/*  Apollo Client Network Interface for WebSocket Communication  */
class NetworkInterfaceWS extends NetworkInterfaceStd {
    constructor (...args) {
        super(...args)

        /*  provide default values for options  */
        this._args.opts = Object.assign({
            debug:             false,
            log:               (msg) => { /* eslint no-console: off */ console.log(msg) },
            protocols:         [],
            compress:          false,
            encoding:          "json",
            keepalive:         0,
            reconnectattempts: 10,
            reconnectdelay:    2 * 1000
        }, this._args.opts)

        /*  initialize state variables  */
        this._ws = null
        this._to = null

        /*  provide latching sub-system  */
        this.latching = new Latching()
    }

    /*  pass-through latching sub-system  */
    hook    (...args) { return this.latching.hook(...args) }
    at      (...args) { return this.latching.at(...args) }
    latch   (...args) { return this.latching.latch(...args) }
    unlatch (...args) { return this.latching.unlatch(...args) }

    /*  ADDON: log a debug message  */
    log (level, msg) {
        if (level <= this._args.opts.debug) {
            let date = (new Date()).toISOString()
            this._args.opts.log(`${date} DEBUG [${level}]: ${msg}`)
        }
    }

    /*  ADDON: connect to the peer  */
    connect (attempt = 0) {
        this.emit("connect")
        this.log(1, "connect: begin")
        return new Promise((resolve, reject) => {
            /*   create a new WebSocket client  */
            let ws = new WebSocket(this._args.uri, this._args.protocols)

            /*  react (once) on error  */
            const onError = (ev) => {
                this.log(1, `connect: end (connection error: ${ev.message})`)
                ws.removeEventListener("error", onError)
                ws._errorOnConnect = true
                if (attempt < this._args.opts.reconnectattempts) {
                    this.log(2, "connection error: trigger new connect attempt " +
                        `(in ${this._args.opts.reconnectdelay / 1000}s)`)
                    setTimeout(() => {
                        this.connect(attempt + 1)
                            .then(() => resolve())
                            .catch((err) => reject(err))
                    }, this._args.opts.reconnectdelay)
                }
                else
                    reject(ev)
            }
            ws.addEventListener("error", onError)

            /*  react (once) on the connection opening  */
            const onOpen = () => {
                this.log(1, "connect: end (connection open)")
                ws.removeEventListener("open",  onOpen)
                ws.removeEventListener("error", onError)
                this._ws = ws
                if (this._args.opts.keepalive > 0) {
                    this.log(2, "connect: start auto-disconnect timer")
                    this._to = setTimeout(() => {
                        this.disconnect()
                    }, this._args.opts.keepalive)
                }
                this.emit("open")
                resolve()
            }
            ws.addEventListener("open", onOpen)

            /*  react (once) on the connection closing  */
            const onClose = (ev) => {
                this.log(1, `connection closed (code: ${ev.code})`)
                ws.removeEventListener("close", onClose)
                if (this._to !== null)
                    clearTimeout(this._to)
                this._to = null
                this._ws = null
                let errorOnConnect = ws._errorOnConnect
                delete ws._errorOnConnect
                this.emit("close")
                if (!errorOnConnect && (ev.code > 1000 || this._args.opts.keepalive === 0)) {
                    this.log(2, "connection closed: trigger re-connect " +
                        `(in ${this._args.opts.reconnectdelay / 1000}s)`)
                    setTimeout(() => {
                        this.connect()
                            .catch((err) => void (err))
                    }, this._args.opts.reconnectdelay)
                }
            }
            ws.addEventListener("close", onClose)

            /*  react (always) on received messages  */
            const onMessage = (ev) => {
                let message = ev.data
                this.log(2, `message received (encoded): ${JSON.stringify(message)}`)
                if (this._args.opts.encoding === "json")
                    message = JSON.parse(message)
                message = this.hook("receive:message", "pass", message)
                this.log(2, `message received (decoded): ${JSON.stringify(message)}`)
                this.emit("receive", message)
            }
            ws.addEventListener("message", onMessage)
        })
    }

    /*  ADDON: disconnect from the peer  */
    disconnect () {
        this.emit("disconnect")
        this.log(1, "disconnect: begin")
        return new Promise((resolve, reject) => {
            if (this._ws !== null) {
                const onClose = (ev) => {
                    this.log(1, "disconnect: end")
                    if (this._ws !== null)
                        this._ws.removeEventListener("close", onClose)
                    resolve()
                }
                this._ws.addEventListener("close", onClose)
                this._ws.close()
            }
            else {
                this.log(1, "disconnect: end (no-op)")
                resolve()
            }
        })
    }

    /*  ADDON: send raw message to the peer  */
    send (message) {
        this.log(1, "send: begin")
        return new Promise((resolve, reject) => {
            if (this._ws === null) {
                this.log(2, "send: on-the-fly connect")
                this.connect()
                    .then(() => resolve())
                    .catch((err) => reject(err))
            }
            else
                resolve()
        })
        .then(() => {
            this.emit("send", message)
            this.log(2, `message send (decoded): ${JSON.stringify(message)}`)
            message = this.hook("send:message", "pass", message)
            if (this._args.opts.encoding === "json")
                message = JSON.stringify(message)
            this.log(2, `message send (encoded): ${JSON.stringify(message)}`)
            this._ws.send(message)
            this.log(1, "send: end")
        })
    }

    /*  STANDARD: send query to the peer  */
    query (request) {
        this.emit("query", request)
        this.log(1, "query: begin")
        this.log(2, `query: request (decoded): ${JSON.stringify(request)}`)
        const options = Object.assign({}, this._args.opts)
        return new Promise((resolve, reject) => {
            /*  optionally perform the deferred connect  */
            if (this._ws === null) {
                this.log(2, "query: on-the-fly connect")
                this.connect()
                    .then(() => resolve())
                    .catch((err) => reject(err))
            }
            else
                resolve()
        })
        .then(() => {
            /*  apply the middlewares  */
            this.log(2, "query: apply middlewares")
            return this.applyMiddlewares({ request, options })
        })
        .then(({ request, options }) => {
            /*  perform the request  */
            return new Promise((resolve, reject) => {
                /*  prepare the request  */
                request = Object.assign({}, request, {
                    query: printGraphQLQuery(request.query)
                })
                if (this._args.opts.compress === true)
                    request.query = compressGraphQLQuery(request.query)
                request = this.hook("query:request", "pass", request)
                if (this._args.opts.encoding === "json")
                    request = JSON.stringify(request)

                /*  handle resulting error or response  */
                let onMessage, onError
                onError = (ev) => {
                    this.log(2, `query: error: ${ev.message}`)
                    this._ws.removeEventListener("message", onMessage)
                    reject(ev)
                }
                onMessage = (ev) => {
                    this._ws.removeEventListener("error", onError)
                    let response = ev.data
                    this.log(2, `query: response (encoded): ${JSON.stringify(response)}`)
                    if (this._args.opts.encoding === "json") {
                        try {
                            response = JSON.parse(response)
                        }
                        catch (err) {
                            reject(err)
                            return
                        }
                    }
                    response = this.hook("query:response", "pass", response)
                    resolve(response)
                }
                this._ws.addEventListener("error",   onError)
                this._ws.addEventListener("message", onMessage)

                /*  send the request  */
                this.log(2, `query: request (encoded): ${JSON.stringify(request)}`)
                this._ws.send(request)
            })
        })
        .then((response) => {
            /*  apply the afterwares  */
            this.log(2, "query: apply afterwares")
            return this.applyAfterwares({ response, options })
        })
        .then(({ response }) => {
            /*  optionally automatically disconnect connection after request  */
            if (this._args.opts.keepalive > 0) {
                this.log(2, "query: (re)start disconnect timer")
                if (this._to !== null)
                    clearTimeout(this._to)
                this._to = setTimeout(() => {
                    this.disconnect()
                }, this._args.opts.keepalive)
            }
            this.log(2, `query: response (decoded): ${JSON.stringify(response)}`)
            this.log(1, "query: end")
            return response
        })
    }
}

/*  export classes  */
module.exports = {
    NetworkInterfaceStd,
    NetworkInterfaceWS
}

