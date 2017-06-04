
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
although it could be used with any GraphQL server speaking WebSocket.
Apollo-Client-WS has deferred connection establishment, connection
keepalive support and can reconnect to the server automatically.
Additionally, beside the GraphQL request/response messages, it also
allows the application to send/receive arbitrary messages over the
WebSocket connection, too.

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

Network Protocol
----------------

Apollo-Client-WS on the WebSocket connection speaks a very simple
protocol based on the following frame format:

```
[ type: string, ...args: any ]
```

In particular, the following frames are used for the GraphQL requests
and (their corresponding) responses:

```
[ type: string = "REQUEST",  txid: number, { query: string, variables?: any, operationName?: string } ]
[ type: string = "RESPONSE", txid: number, { data?: any, error?: any[] ]
```

When sending a custom message via `networkInterface::send(type: string, data: any[])`,
the following frame is sent:

```
[ type, ...data ]
```

When receiving such a custom frame, it is delivered via `networkInterface::on("receive", { type, data }) => { ... })`.

Notice
------

There is also the alternative module
[Subscriptions-Transport-WS](https://github.com/apollographql/subscriptions-transport-ws)
for [Apollo Client](https://github.com/apollographql/apollo-client). While
Apollo-Client-WS
intentionally has no direct built-in GraphQL subscription support,
the Subscriptions-Transport-WS module uses an
[own protocol](https://github.com/apollographql/subscriptions-transport-ws/blob/master/src/message-types.ts)
on top of WebSockets to support the subscription notification and
unfortunately (from the perspective of the Apollo-Client-WS author), but by design, uses an
opinionated way of implementing GraphQL subscriptions on the GraphQL engine side.

The Apollo-Client-WS instead provides plain WebSocket
communication, without any additional subscription protocol, and hence
does not enfore any special support for subscriptions on the server side.

For implementing a subscription or similar add-on protocol on top
of Apollo-Client-WS, simply use the `send` method to send non-GraphQL
request messages to the server and use the `receive` event for
receiving non-GraphQL response messages from the server.

```js
/*  send a subscribe command  */
let data = [ "foo", 42 ]
networkInterface.send("SUBSCRIBE", data)

/*  receive a notification command  */
networkInterface.on("receive", ({ type, data }) => {
    if (type === "NOTIFY")
        notify(...data)
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

