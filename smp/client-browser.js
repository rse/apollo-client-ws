
/*  external requirements  */
const gql                = require("graphql-tag")
const { ApolloClient }   = require("apollo-client")
const { ApolloClientWS } = require("apollo-client-ws")
const { InMemoryCache }  = require("apollo-cache-inmemory")

/*  create the WebSocket network interface for Apollo Client  */
const link = new ApolloClientWS({
    uri: "ws://en1.home.engelschall.com:12345/api",
    opts: {
        debug:     3,
        encoding:  "json",
        keepalive: 5 * 1000,
        compress:  true
    }
})
link.on("debug", ({ log }) => {
    console.log(log)
})

/*  receive non-GraphQL messages  */
link.on("receive", ({ fid, rid, type, data }) => {
    console.log("RECEIVE", fid, rid, type, data)
})

/*  create the Apollo Client instance  */
const apolloClient = new ApolloClient({
    link:  link,
    cache: new InMemoryCache()
})

/*  query the server  */
apolloClient.query({
    query: gql`{
        OrgUnit (id: "XT") {
            id
            name
            director   { id name }
            parentUnit { id name }
            members    { id name }
        }
    }`
})
.then((response) => {
    console.log("OK:", JSON.stringify(response))
})
.catch((err) => {
    console.log("ERROR:", err)
})

