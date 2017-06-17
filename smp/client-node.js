
/*  external requirements  */
const gql            = require("graphql-tag")
const ApolloClient   = require("apollo-client")
const ApolloClientWS = require("apollo-client-ws")

/*  create the WebSocket network interface for Apollo Client  */
const networkInterface = ApolloClientWS.createNetworkInterface({
    uri: "ws://127.0.0.1:12345/api",
    opts: {
        debug:     3,
        encoding:  "json",
        keepalive: 5 * 1000,
        compress:  true
    }
})
networkInterface.on("debug", ({ log }) => {
    console.log(log)
})

/*  receive non-GraphQL messages  */
networkInterface.on("receive", ({ fid, rid, type, data }) => {
    console.log("RECEIVE", fid, rid, type, data)
})

/*  create the Apollo Client instance  */
const apolloClient = new ApolloClient.ApolloClient({
    networkInterface: networkInterface
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
    console.log("OK:", require("util").inspect(response, { colors: true, depth: null }))
})
.catch((err) => {
    console.log("ERROR:", err)
})

