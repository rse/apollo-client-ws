
/*  external requirements  */
const gql            = require("graphql-tag")
const ApolloClient   = require("apollo-client")
const ApolloClientWS = require("apollo-client-ws")

/*  create the WebSocket network interface for Apollo Client  */
const networkInterface = ApolloClientWS.createNetworkInterface({
    uri: "ws://en1.home.engelschall.com:12345/api",
    opts: {
        debug:     2,
        encoding:  "json",
        keepalive: 5 * 1000,
        compress:  true
    }
})

/*  receive non-GraphQL messages  */
networkInterface.on("receive", (message) => {
    console.log("RECEIVE", message)
})

/*  create the Apollo Client instance  */
const apolloClient = new ApolloClient.ApolloClient({
    networkInterface: networkInterface
})

/*  query the server  */
apolloClient.query({
    query: gql`{
        OrgUnit (id: "XT") {
            id#foo
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

