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

/*  external dependencies  */
import { ApolloLink, Observable }     from "apollo-link"
import WebSocket                      from "ws"
import WebSocketFramed                from "websocket-framed"
import { print as printGraphQLQuery } from "graphql/language/printer"
import compressGraphQLQuery           from "graphql-query-compress"
import Latching                       from "latching"
import EventEmitter                   from "eventemitter3"
import Ducky                          from "ducky"

/*  Apollo Client Link Interface for WebSocket Communication  */
class ApolloClientWS extends ApolloLink {
    constructor (...args) {
        /*  initialize ApolloLink base class  */
        super()

        /*  sanity check constructor arguments  */
        if (args.length === 2 && typeof args[0] === "string" && typeof args[1] === "object")
            this._args = { uri: args[0], opts: args[1] }
        else if (args.length === 1 && typeof args[0] === "object")
            this._args = args[0]
        else
            throw new Error("invalid arguments to ApolloClientWS constructor (invalid number or type of arguments)")
        if (this._args.uri === undefined)
            throw new Error("invalid arguments to ApolloClientWS constructor (missing URI)")

        /*  provide default values for options  */
        this._args.opts = Object.assign({
            debug:             0,
            protocols:         [],
            compress:          false,
            encoding:          "json",
            keepalive:         0,
            reconnectattempts: -1,
            reconnectdelay:    2 * 1000
        }, this._args.opts)

        /*  validate options  */
        const errors = []
        if (!Ducky.validate(this._args.opts, `{
            debug:             number,
            protocols:         [ string* ],
            compress:          boolean,
            encoding:          string,
            keepalive:         number,
            reconnectattempts: number,
            reconnectdelay:    number
        }`, errors))
            throw new Error(`invalid options: ${errors.join("; ")}`)

        /*  initialize state variables  */
        this._ws   = null
        this._wsf  = null
        this._to   = null
        this._tx   = {}

        /*  provide hook latching sub-system  */
        this._latching = new Latching()

        /*  provide event emitter sub-system  */
        this._emitter  = new EventEmitter()
    }

    /*  ADDON: pass-through methods of latching sub-system  */
    hook               (...args) { return this._latching.hook(...args) }
    at                 (...args) { return this._latching.at(...args) }
    latch              (...args) { return this._latching.latch(...args) }
    unlatch            (...args) { return this._latching.unlatch(...args) }

    /*  ADDON: pass-through methods of emitter sub-system  */
    emit               (...args) { return this._emitter.emit(...args) }
    once               (...args) { return this._emitter.once(...args) }
    on                 (...args) { return this._emitter.on(...args) }
    off                (...args) { return this._emitter.off(...args) }
    addListener        (...args) { return this._emitter.addListener(...args) }
    removeListener     (...args) { return this._emitter.removeListener(...args) }
    removeAllListeners (...args) { return this._emitter.removeAllListeners(...args) }
    listenerCount      (...args) { return this._emitter.listenerCount(...args) }
    listeners          (...args) { return this._emitter.listeners(...args) }
    eventNames         (...args) { return this._emitter.eventNames(...args) }

    /*  ADDON: log a debug message  */
    log (level, msg) {
        if (level <= this._args.opts.debug) {
            const date = (new Date()).toISOString()
            const log = `${date} DEBUG [${level}]: ${msg}`
            this.emit("debug", { date, level, msg, log })
        }
    }

    /*  ADDON: connect to the peer  */
    connect () {
        const connectInternal = (attempt = 0) => {
            return new Promise((resolve, reject) => {
                this.emit("connect")
                this.log(1, "connect: begin")

                /*  create a new WebSocket client  */
                let ws
                if (process.env.PLATFORM === "browser")
                    ws = new WebSocket(this._args.uri, this._args.opts.protocols)
                else {
                    const opts = this.hook("connect:options", "pass", {})
                    ws = new WebSocket(this._args.uri, this._args.opts.protocols, opts)
                }

                /*  configure binary transfer  */
                ws.binaryType = process.env.PLATFORM === "browser" ? "arraybuffer" : "nodebuffer"

                /*   create a new WebSocket-Framed wrapper  */
                const wsf = new WebSocketFramed(ws, this._args.opts.encoding)

                /*  react (once) on error messages  */
                const onError = (ev) => {
                    if (this._ws !== null && this._ws._explicitDisconnect)
                        return
                    this.log(1, `connect: end (connection error: ${ev.message})`)
                    ws.removeEventListener("error", onError)
                    ws._errorOnConnect = true
                    if (attempt < this._args.opts.reconnectattempts || this._args.opts.reconnectattempts === -1) {
                        this.log(2, "connection error: trigger new connect attempt " +
                            `(in ${Math.trunc(this._args.opts.reconnectdelay / 1000)}s)`)
                        setTimeout(() => {
                            /*  handle repeated connection attempts (subsequently)  */
                            connectInternal(attempt + 1)
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
                    ws.removeEventListener("open", onOpen)
                    this._ws  = ws
                    this._wsf = wsf
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

                /*  react (always) on received response messages  */
                const onMessage = (ev) => {
                    ev = this.hook("receive:message", "pass", ev)
                    const { rid, type, data } = ev.frame
                    if (   type === "GRAPHQL-RESPONSE"
                        && typeof data === "object") {
                        /*  is a valid GraphQL response  */
                        this.log(3, `query: response (framed): ${JSON.stringify(ev.frame)}`)
                        if (this._tx[rid] !== undefined) {
                            if (Ducky.validate(data,
                                "({ data: Object, errors?: [ Object* ] } | { data?: Object, errors: [ Object* ] })"))
                                this._tx[rid](data)
                            else
                                this._tx[rid](null, "invalid GraphQL response object")
                        }
                    }
                    else {
                        /*  is a non-standard message  */
                        this.log(2, `message received: ${JSON.stringify(ev.frame)}`)
                        this.emit("receive", ev.frame)
                    }
                }
                wsf.on("message", onMessage)
                const onSocketError = (err) => {
                    this.log(2, `WebSocket error: ${err}`)
                    /*  not now, because of auto-reconnects we don't want to mention everything:
                        this.emit("error", `WebSocket error: ${err}`)  */
                }
                wsf.on("error", onSocketError)

                /*  react (once) on the connection closing  */
                const onClose = (ev) => {
                    if (this._ws !== null && this._ws._explicitDisconnect)
                        return
                    this.log(1, `connection closed (code: ${ev.code})`)
                    ws.removeEventListener("error",   onError)
                    ws.removeEventListener("open",    onOpen)
                    ws.removeEventListener("message", onMessage)
                    ws.removeEventListener("close",   onClose)
                    if (this._to !== null)
                        clearTimeout(this._to)
                    this._to  = null
                    this._ws  = null
                    this._wsf = null
                    const errorOnConnect = ws._errorOnConnect
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
            })
        }

        /*  handle subsequent connect calls  */
        if (this._connectPromise)
            return Promise.resolve(this._connectPromise)
        else {
            /*  handle repeated connection attempts (initially)  */
            return (this._connectPromise = connectInternal(0).then(
                ()    => { delete this._connectPromise },
                (err) => { delete this._connectPromise; throw err }
            ))
        }
    }

    /*  ADDON: disconnect from the peer  */
    disconnect () {
        /*  handle subsequent disconnect calls  */
        if (this._disconnectPromise)
            return Promise.resolve(this._disconnectPromise)
        else {
            return (this._disconnectPromise = new Promise((resolve, reject) => {
                /*  disconnect from the peer  */
                this.emit("disconnect")
                this.log(1, "disconnect: begin")
                if (this._ws !== null) {
                    this._ws._explicitDisconnect = true
                    const onClose = (ev) => {
                        if (this._ws === null)
                            return
                        this._ws.removeEventListener("close", onClose)
                        if (this._to !== null) {
                            clearTimeout(this._to)
                            this._to = null
                        }
                        this._ws  = null
                        this._wsf = null
                        this.log(1, "disconnect: end")
                        this.emit("close")
                        resolve()
                    }
                    this._ws.addEventListener("close", onClose)
                    this._ws.close()
                }
                else {
                    this.log(1, "disconnect: end (no-op)")
                    resolve()
                }
            }).then(
                () => { delete this._disconnectPromise },
                () => { delete this._disconnectPromise }
            ))
        }
    }

    /*  ADDON: send message to the peer  */
    send (type, data) {
        this.log(1, "send: begin")
        this.emit("send", { type, data })
        return new Promise((resolve, reject) => {
            if (this._ws === null) {
                this.log(2, "send: on-the-fly connect")
                this.connect()
                    .then(() => resolve())
                    .catch((err) => reject(err))
            }
            else
                resolve()
        }).then(() => {
            /*  await WebSocket ready-state OPEN  */
            return new Promise((resolve, reject) => {
                const check = (k) => {
                    if (k <= 0)
                        reject(new Error("failed to await WebSocket ready-state OPEN"))
                    else if (this._ws.readyState === WebSocket.CLOSED)
                        reject(new Error("failed to send to WebSocket, already in ready-state CLOSED"))
                    else if (this._ws.readyState === WebSocket.CLOSING)
                        reject(new Error("failed to send to WebSocket, already in ready-state CLOSING"))
                    else if (this._ws.readyState === WebSocket.CONNECTING)
                        setTimeout(() => check(k - 1), 100)
                    else
                        resolve()
                }
                check(100)
            })
        }).then(() => {
            /*  send the message  */
            const { frame } = this._wsf.send({ type, data })
            this.log(2, `message sent: ${JSON.stringify(frame)}`)
            this.log(1, "send: end")
            return frame
        })
    }

    /*  STANDARD: send request to the peer  */
    request (operation) {
        return new Observable((observer) => {
            this.emit("request", operation)
            this.log(1, "request: begin")
            /*  we here would have (but don't use):
                const { operationName, extensions, variables, query } = operation  */
            void (new Promise((resolve, reject) => {
                /*  optionally perform the deferred connect  */
                if (this._ws === null) {
                    this.log(2, "request: on-the-fly connect")
                    this.connect()
                        .then(() => resolve())
                        .catch((err) => reject(err))
                }
                else
                    resolve()
            }).then(() => {
                /*  await WebSocket ready-state OPEN  */
                return new Promise((resolve, reject) => {
                    const check = (k) => {
                        if (k <= 0)
                            reject(new Error("failed to await WebSocket ready-state OPEN"))
                        else if (this._ws.readyState === WebSocket.CLOSED)
                            reject(new Error("failed to send to WebSocket, already in ready-state CLOSED"))
                        else if (this._ws.readyState === WebSocket.CLOSING)
                            reject(new Error("failed to send to WebSocket, already in ready-state CLOSING"))
                        else if (this._ws.readyState === WebSocket.CONNECTING)
                            setTimeout(() => check(k - 1), 100)
                        else
                            resolve()
                    }
                    check(100)
                })
            }).then(() => {
                /*  perform the request  */
                return new Promise((resolve, reject) => {
                    /*  prepare the request  */
                    let request = Object.assign({}, operation)
                    request.query = printGraphQLQuery(request.query)
                    if (this._args.opts.compress === true)
                        request.query = compressGraphQLQuery(request.query)
                    if (request.operationName === null)
                        delete request.operationName
                    if (Object.keys(request.variables).length === 0)
                        delete request.variables
                    if (Object.keys(request.extensions).length === 0)
                        delete request.extensions
                    request = this.hook("query:request", "pass", request)

                    /*  send the request  */
                    this.log(2, `request: request: ${JSON.stringify(request)}`)
                    const { frame } = this._wsf.send({ type: "GRAPHQL-REQUEST", data: request })
                    this.log(3, `request: request (framed): ${JSON.stringify(frame)}`)

                    /*  queue request and await response or error  */
                    const fid = frame.fid
                    this._tx[fid] = (response, error) => {
                        delete this._tx[fid]
                        if (response)
                            resolve(response)
                        else
                            reject(error)
                    }
                })
            }).then((response) => {
                /*  optionally automatically disconnect connection after request  */
                if (this._args.opts.keepalive > 0) {
                    this.log(2, "request: (re)start auto-disconnect timer")
                    if (this._to !== null)
                        clearTimeout(this._to)
                    this._to = setTimeout(() => {
                        this.disconnect()
                    }, this._args.opts.keepalive)
                }
                this.log(2, `request: response: ${JSON.stringify(response)}`)
                this.log(1, "request: end")
                return response
            }).then((response) => {
                /*  pass response to other Apollo Link instances  */
                operation.setContext({ response })

                /*  pass response to caller  */
                observer.next(response)
                observer.complete()
            }).catch((err) => {
                /*  pass error to caller  */
                observer.error(err)
            }))
            return () => {
                /*  no-op: we cannot cancel the operation  */
            }
        })
    }
}

/*  API export */
module.exports = {
    ApolloClientWS
}

