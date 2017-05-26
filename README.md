
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
based network interface for the JavaScript GraphQL client library
[Apollo Client](https://github.com/apollographql/apollo-client).
It is intended to be used with the [HAPI](http://hapijs.com/) server
framework and its seamless WebSocket protocol integration module
[HAPI-Plugin-WebSocket](https://github.com/rse/hapi-plugin-websocket).

Installation
------------

```shell
$ npm install apollo-client apollo-client-ws
```

Usage
-----

```js
const gql                    = require("graphql-tag")
const ApolloClient           = require("apollo-client")
const { NetworkInterfaceWS } = require("apollo-client-ws")

const networkInterface = new NetworkInterfaceWS({
    uri: "ws://127.0.0.1:12345/api",
    opts: {
        /*  (all options and their default values)  */
        debug:             false,
        log:               (msg) => { console.log(msg) },
        protocols:         [],
        compress:          false,
        encoding:          "json",
        keepalive:         0,
        reconnectattempts: 3,
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

There is also the alterative module
[Subscriptions-Transport-WS](https://github.com/apollographql/subscriptions-transport-ws)
for [Apollo Client](https://github.com/apollographql/apollo-client). While
Apollo-Client-WS sends plain GraphQL request/response messages over
WebSockets and has no built-in subscription support (although one
can easily add it on top of it), this module
uses an [own protocol](https://github.com/apollographql/subscriptions-transport-ws/blob/master/src/message-types.ts)
on top of WebSockets to support the subscription notification.

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

