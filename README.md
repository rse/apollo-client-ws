
Apollo-Client-WS
================

GraphQL WebSocket Network Interface for Apollo Client

<p/>
<img src="https://nodei.co/npm/apollo-client-ws.png?downloads=true&stars=true" alt=""/>

<p/>
<img src="https://david-dm.org/rse/apollo-client-ws.png" alt=""/>

About
-----

This is a [GraphQL](http://graphql.org/)
[WebSocket](https://html.spec.whatwg.org/multipage/comms.html#network)
based `NetworkInterface` layer for the JavaScript GraphQL client library
[Apollo Client](https://github.com/apollographql/apollo-client).
It was developed for and is intended to be used with the [HAPI](http://hapijs.com/) server
framework and its seamless WebSocket protocol integration module
[HAPI-Plugin-WebSocket](https://github.com/rse/hapi-plugin-websocket),
although it could be used with any GraphQL server speaking plain (JSON-encoded) GraphQL
request/response messages over WebSocket connections. It has deferred
connection establishment and connection keepalive support and can
reconnect automatically.

Installation
------------

```shell
$ npm install graphql-tag apollo-client apollo-client-ws
```

Usage
-----

```js
const gql            = require("graphql-tag")
const ApolloClient   = require("apollo-client")
const ApolloClientWS = require("apollo-client-ws")

const networkInterface = ApolloClientWS.createNetworkInterface({
    uri: "ws://127.0.0.1:12345/api",
    opts: {
        /*  (all options and their default values)  */
        debug:             false,
        log:               (msg) => { console.log(msg) },
        protocols:         [],
        compress:          false,
        encoding:          "json",
        keepalive:         0,
        reconnectattempts: 10,
        reconnectdelay:    2 * 1000
    }
})

const apolloClient = new ApolloClient.ApolloClient({
    networkInterface: networkInterface
})

apolloClient.query({ query: gql`{ ... }` })
    .then((response) => { ...  })
    .catch((err)     => { ...  })
```

Notice
------

There is also the alternative module
[Subscriptions-Transport-WS](https://github.com/apollographql/subscriptions-transport-ws)
for [Apollo Client](https://github.com/apollographql/apollo-client). While
Apollo-Client-WS transfers plain GraphQL request/response messages over
WebSocket connections and intentionally has no direct built-in subscription support,
the Subscriptions-Transport-WS module uses an
[own protocol](https://github.com/apollographql/subscriptions-transport-ws/blob/master/src/message-types.ts)
on top of WebSockets to support the subscription notification and
unfortunately, but by design, uses an opinionated way of implementing GraphQL subscriptions
on the GraphQL engine side.

The Apollo-Client-WS instead provides plain GraphQL over WebSocket
communication, without any additional subscription protocol, and hence
does not need any special support on the server side.

For implementing a subscription or similar add-on protocol on top
of Apollo-Client-WS, use the `send` method to send non-GraphQL
request messages to the server, use the `receive` event for
receiving non-GraphQL response messages from the server and use the
`query:request` and `query:response` hooks to optionally wrap/unwrap
regular GraphQL request/response messages.

For example, assume your custom protocol is based on messages of the
form `{ cmd: "...", args: [ ... ] }`, then you could implement it
with Apollo-Client-WS the following way (ignoring error handling for
illustration purposes):

```js
/*  send a subscribe command  */
networkInterface.send({ cmd: "SUBSCRIBE", args: [ 42 ] })

/*  receive a notification command  */
networkInterface.on("receive", ({ cmd, args }) => {
    if (cmd === "NOTIFY")
        ...
})

/*  wrap GraphQL request into a request command  */
networkInterface.latch("query:request", (request) => {
    return { cmd: "REQUEST", args: [ request ] }
})

/*  unwrap GraphQL response from a response command  */
networkInterface.latch("query:response", (response) => {
    if (response.cmd === "RESPONSE")
         response = response.args[0]
    return response
})
```

License
-------

Copyright (c) 2017 Ralf S. Engelschall (http://engelschall.com/)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

