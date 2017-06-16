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
import WebSocketFramed                from "websocket-framed"
import { print as printGraphQLQuery } from "graphql/language/printer"
import compressGraphQLQuery           from "graphql-query-compress"
import Latching                       from "latching"
import Ducky                          from "ducky"

/*  internal dependencies  */
import NetworkInterfaceStd            from "./apollo-client-std"

/*  Apollo Client Network Interface for WebSocket Communication  */
class NetworkInterfaceWS extends NetworkInterfaceStd {
    constructor (...args) {
        super(...args)

        /*  provide default values for options  */
        this._args.opts = Object.assign({
            debug:             0,
            log:               (msg) => { /* eslint no-console: off */ console.log(msg) },
            protocols:         [],
            compress:          false,
            encoding:          "json",
            keepalive:         0,
            reconnectattempts: 10,
            reconnectdelay:    2 * 1000
        }, this._args.opts)

        /*  validate options  */
        let errors = []
        if (!Ducky.validate(this._args.opts, `{
            debug:             number,
            log:               function,
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

        /*  provide latching sub-system  */
        this.latching = new Latching()
    }

    /*  pass-through methods of latching sub-system  */
    hook    (...args) { return this.latching.hook(...args) }
    at      (...args) { return this.latching.at(...args) }
    latch   (...args) { return this.latching.latch(...args) }
    unlatch (...args) { return this.latching.unlatch(...args) }

    /*  ADDON: log a debug message  */
    log (level, msg) {
        if (level <= this._args.opts.debug) {
            let date = (new Date()).toISOString()
            this._args.opts.log(`${date} DEBUG [${level}]: ${msg}`, level, msg)
        }
    }

    /*  ADDON: connect to the peer  */
    connect (attempt = 0) {
        const connectInternal = (attempt = 0) => {
            return new Promise((resolve, reject) => {
                this.emit("connect")
                this.log(1, "connect: begin")

                /*  create a new WebSocket client  */
                let ws = new WebSocket(this._args.uri, this._args.opts.protocols)

                /*  configure binary transfer  */
                ws.binaryType = process.env.PLATFORM === "browser" ? "arraybuffer" : "nodebuffer"

                /*   create a new WebSocket-Framed wrapper  */
                let wsf = new WebSocketFramed(ws, this._args.opts.encoding)

                /*  react (once) on error messages  */
                const onError = (ev) => {
                    if (this._ws !== null && this._ws._explicitDisconnect)
                        return
                    this.log(1, `connect: end (connection error: ${ev.message})`)
                    ws.removeEventListener("error", onError)
                    ws._errorOnConnect = true
                    if (attempt < this._args.opts.reconnectattempts) {
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
                    let { rid, type, data } = ev.frame
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
                const onMessageError = (err) => {
                    this.log(2, `error on message receive: ${err}`)
                }
                wsf.on("error", onMessageError)

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
            /*  send the message  */
            let { frame } = this._wsf.send({ type, data })
            this.log(2, `message sent: ${JSON.stringify(frame)}`)
            this.log(1, "send: end")
            return frame
        })
    }

    /*  STANDARD: send query to the peer  */
    query (request) {
        this.emit("query", request)
        this.log(1, "query: begin")
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
        }).then(() => {
            /*  apply the middlewares  */
            this.log(2, "query: apply middlewares")
            return this.applyMiddlewares({ request, options })
        }).then(({ request, options }) => {
            /*  perform the request  */
            return new Promise((resolve, reject) => {
                /*  prepare the request  */
                request = Object.assign({}, request, {
                    query: printGraphQLQuery(request.query)
                })
                if (this._args.opts.compress === true)
                    request.query = compressGraphQLQuery(request.query)
                request = this.hook("query:request", "pass", request)

                /*  send the request  */
                this.log(2, `query: request: ${JSON.stringify(request)}`)
                let { frame } = this._wsf.send({ type: "GRAPHQL-REQUEST", data: request })
                this.log(3, `query: request (framed): ${JSON.stringify(frame)}`)

                /*  queue request and await response or error  */
                let fid = frame.fid
                this._tx[fid] = (response, error) => {
                    delete this._tx[fid]
                    if (response)
                        resolve(response)
                    else
                        reject(error)
                }
            })
        }).then((response) => {
            /*  apply the afterwares  */
            this.log(2, "query: apply afterwares")
            return this.applyAfterwares({ response, options })
        }).then(({ response }) => {
            /*  optionally automatically disconnect connection after request  */
            if (this._args.opts.keepalive > 0) {
                this.log(2, "query: (re)start disconnect timer")
                if (this._to !== null)
                    clearTimeout(this._to)
                this._to = setTimeout(() => {
                    this.disconnect()
                }, this._args.opts.keepalive)
            }
            this.log(1, "query: end")
            this.log(2, `query: response: ${JSON.stringify(response)}`)
            return response
        })
    }
}

/*  export classes  */
module.exports = {
    NetworkInterfaceStd,
    NetworkInterfaceWS,
    createNetworkInterface: (...args) => new NetworkInterfaceWS(...args)
}

