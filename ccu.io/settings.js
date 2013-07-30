var settings = {
    version: "0.6",

    //  Port auf dem der Webserver und Socket.IO lauscht
    ioListenPort: 8080,

    // IP-Adresse der Homematic CCU
    ccuIp: "172.16.23.3",
    binrpc: {

        // IP-Adresse des Node-Servers (wird der CCU mitgeteilt f�r RPC Init)
        listenIp: "172.16.23.19",

        // Port auf dem der xmlrpc_bin:// Server lauscht
        listenPort: 2101,
        inits: [

            // CUxD Init durchf�hren
            { id: "io_cuxd",    port: 8701 },
            // BidCos-Wired Init durchf�hren
            { id: "io_wired",   port: 2000 },
            // BidCos-RF Init durchf�hren
            { id: "io_rf",      port: 2001 }
        ]
    },
    regahss: {
        // Variablen-Werte von der CCU Pollen
        pollData: true,
        // Interval f�r Polling in milli-Sekunden
        pollDataInterval: 10000,



        // Todo Implement Polling Trigger
        pollDataTrigger: "BidCos-RF.BidCoS-RF:50.PRESS_LONG",
        // Todo Implement Meta Data Polling
        pollMeta: true,
        pollMetaInterval: 172800000,
        // Todo Implement Meta Data Cache
        cacheMeta: false,
        metaScripts: [
            "favorites",
            "variables",
            "programs",
            "rooms",
            "functions",
            "devices",
            "channels",
            "datapoints"
        ]
    }
};

module.exports = settings;