/**
 *      CCU.IO Script Engine
 *
 *      Copyright (c) 2013 http://hobbyquaker.github.io
 *
 *      CC BY-NC 3.0
 *
 *      Kommerzielle Nutzung nicht gestattet!
 *
 */


var regaObjects = {},
    regaIndex = {},
    datapoints = {};

var scriptEngine = {
    util:           require('util'),
    settings:       require(__dirname+'/settings.js'),
    logger:         require(__dirname+'/logger.js'),
    //vm:             require('vm'),
    io:             require('socket.io-client'),
    scheduler:      require('node-schedule'),
    suncalc:        require('suncalc'),
    fs:             require('fs'),
    socket: {},
    subscribers: [],
    schedules: [],
    init: function () {
        var that = this;
        if (that.settings.ioListenPort) {
            that.socket = that.io.connect("127.0.0.1", {
                port: that.settings.ioListenPort
            });
        } else if (settings.ioListenPortSsl) {
            that.socket = that.io.connect("127.0.0.1", {
                port: that.settings.ioListenPortSsl,
                secure: true
            });
        } else {
            process.exit();
        }
        
        that.socket.on('connect', function () {
            that.logger.info("script-engine connected to ccu.io");
        });

        that.socket.on('disconnect', function () {
            that.logger.info("script-engine disconnected from ccu.io");
        });

        // Fetch Data
        that.socket.emit('getIndex', function(index) {
            that.logger.info("script-engine fetched regaIndex")
            regaIndex = index;
            that.socket.emit('getObjects', function(objects) {
                that.logger.info("script-engine fetched regaObjects")
                regaObjects = objects;
                that.socket.emit('getDatapoints', function(dps) {
                    that.logger.info("script-engine fetched datapoints")
                    datapoints = dps;
                    that.initEventHandler();
                    that.startEngine();
                });
            });
        });


    },
    initEventHandler: function () {
        var that = this;
        that.socket.on('event', function (obj) {
            if (!obj) { return; }
            var id =    obj[0];

            var name,
                parent,
                channelName,
                deviceName,
                channelType,
                deviceType,
                rooms = [],
                funcs = [],
                roomNames = [],
                funcNames = [];


            if (regaObjects[id]) {
                name = regaObjects[id].Name;
                parent = regaObjects[id].Parent;
            }

            if (parent) {

                channelName = regaObjects[parent].Name;
                channelType = regaObjects[parent].HssType;

                // Räume finden
                var roomIndex = regaIndex.ENUM_ROOMS;
                for (var i = 0; i < roomIndex.length; i++) {
                    var room = roomIndex[i];
                    if (regaObjects[room].Channels.indexOf(parent) != -1) {
                        rooms.push(room);
                        roomNames.push(regaObjects[room].Name);
                    }
                }

                // Gewerke finden
                var funcIndex = regaIndex.ENUM_FUNCTIONS;
                for (var i = 0; i < funcIndex.length; i++) {
                    var func = funcIndex[i];
                    if (regaObjects[func].Channels.indexOf(parent) != -1) {
                        funcs.push(func);
                        funcNames.push(regaObjects[func].Name);
                    }
                }

                // Gerät
                var device = regaObjects[parent].Parent;
                deviceName = regaObjects[device].Name;
                deviceType = regaObjects[device].HssType;


            }



            var oldObj = datapoints[id];

            if (!oldObj) { oldObj = []; }

            datapoints[id] = [obj[1], obj[2], obj[3], obj[4]];

            var eventObj = {
                id: id,
                name: name,
                newState: {
                    value: obj[1],
                    timestamp: obj[2],
                    ack: obj[3],
                    lastchange: obj[4]
                },
                oldState: {
                    value: oldObj[0],
                    timestamp: oldObj[1],
                    ack: oldObj[2],
                    lastchange: oldObj[3]
                },
                channel: {
                    id: parent,
                    name: channelName,
                    type: channelType,
                    funcIds: funcs,
                    roomIds: rooms,
                    funcNames: funcNames,
                    roomNames: roomNames
                },
                device: {
                    id: device,
                    name: deviceName,
                    type: deviceType
                }

            };


            var length = that.subscribers.length;

            for (var i = 0; i < length; i++) {

                if (that.patternMatching(eventObj, that.subscribers[i].pattern)) {
                    that.subscribers[i].callback(eventObj);
                }

            }

        });
    },
    patternMatching: function (event, pattern) {
        if (!pattern.logic) {
            pattern.logic = "and";
        }

        var matched = false;

        // Datapoint id matching
        if (pattern.id && pattern.id == event.id) {
            console.log("matched id!");
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.id) {
            if (pattern.logic == "and") { return false; }
        }

        // change matching
        if (pattern.change) {
            switch (pattern.change) {
                case "eq":
                    if (event.newState.value == event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "ne":
                    if (event.newState.value != event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;

                case "gt":
                    if (event.newState.value > event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "ge":
                    if (event.newState.value >= event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "lt":
                    if (event.newState.value < event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
                case "le":
                    if (event.newState.value <= event.oldState.value) {
                        if (pattern.logic == "or") { return true; }
                        matched = true;
                    } else {
                        if (pattern.logic == "and") { return false; }
                    }
                    break;
            }
        }

        // Value Matching
        if (pattern.val && pattern.val == event.newState.value) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.val) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valGt && event.newState.value > pattern.valGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valGe && event.newState.value >= pattern.valGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valLt && event.newState.value < pattern.valLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.valLe && event.newState.value <= pattern.valLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.valLe) {
            if (pattern.logic == "and") { return false; }
        }

        // Old-Value matching
        if (pattern.oldVal && pattern.oldVal == event.oldState.value) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldVal) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValGt && event.oldState.value > pattern.oldValGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValGe && event.oldState.value >= pattern.oldValGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValLt && event.oldState.value < pattern.oldValLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldValLe && event.oldState.value <= pattern.oldValLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldValLe) {
            if (pattern.logic == "and") { return false; }
        }

        // newState.timestamp matching
        if (pattern.ts && pattern.ts == event.newState.timestamp) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.ts) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsGt && event.newState.timestamp > pattern.tsGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsGe && event.newState.timestamp >= pattern.tsGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsLt && event.newState.timestamp < pattern.tsLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.tsLe && event.newState.timestamp <= pattern.tsLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.tsLe) {
            if (pattern.logic == "and") { return false; }
        }

        // oldState.timestamp matching
        if (pattern.oldTs && pattern.oldTs == event.oldState.timestamp) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTs) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsGt && event.oldState.timestamp > pattern.oldTsGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsGe && event.oldState.timestamp >= pattern.oldTsGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsLt && event.oldState.timestamp < pattern.oldTsLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldTsLe && event.oldState.timestamp <= pattern.oldTsLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldTsLe) {
            if (pattern.logic == "and") { return false; }
        }


        // newState.lastchange matching
        if (pattern.lc && pattern.lc == event.newState.lastchange) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lc) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcGt && event.newState.lastchange > pattern.lcGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcGe && event.newState.lastchange >= pattern.lcGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcLt && event.newState.lastchange < pattern.lcLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.lcLe && event.newState.lastchange <= pattern.lcLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.lcLe) {
            if (pattern.logic == "and") { return false; }
        }

        // oldState.lastchange matching
        if (pattern.oldLc && pattern.oldLc == event.oldState.lastchange) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLc) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcGt && event.oldState.lastchange > pattern.oldLcGt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcGt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcGe && event.oldState.lastchange >= pattern.oldLcGe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcGe) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcLt && event.oldState.lastchange < pattern.oldLcLt) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcLt) {
            if (pattern.logic == "and") { return false; }
        }
        if (pattern.oldLcLe && event.oldState.lastchange <= pattern.oldLcLe) {
            if (pattern.logic == "or") { return true; }
            matched = true;
        } else if (pattern.oldLcLe) {
            if (pattern.logic == "and") { return false; }
        }



        // Datapoint Name matching
        if (pattern.name) {
            if (pattern.name instanceof RegExp) {
                if (event.name && event.name.match(pattern.name)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.name && pattern.name == event.name) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // Room id/name matching
        if (pattern.room) {
            if (pattern.room instanceof RegExp) {
                var submatch = false;
                for (var j = 0; j < event.channel.roomNames.length; j++) {
                    if (event.channel.roomNames[j].match(pattern.room)) {
                        submatch = true;
                        break;
                    }
                }
                if (submatch) {
                    if (pattern.logic == "or") {
                        return true;
                    }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.room == "number") {
                if (event.channel.roomNames.indexOf(pattern.room) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.roomNames.indexOf(pattern.room) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // function (Gewerk) id/name matching
        if (pattern.func) {
            if (pattern.func instanceof RegExp) {
                var submatch = false;
                for (var j = 0; j < event.channel.funcNames.length; j++) {
                    if (event.channel.funcNames[j].match(pattern.func)) {
                        submatch = true;
                        break;
                    }
                }
                if (submatch) {
                    if (pattern.logic == "or") {
                        return true;
                    }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.func == "number") {
                if (event.channel.func.indexOf(pattern.func) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.funcNames.indexOf(pattern.func) != -1) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }

        }

        // channel id/name matching
        if (pattern.channel) {
            if (pattern.channel instanceof RegExp) {
                if (event.channel.name && event.channel.name.match(pattern.channel)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.channel == "number") {
                if (event.channel.id && event.channel.id == pattern.channel) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.name && event.channel.name == pattern.channel) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // channelType (HssType) matching
        if (pattern.channelType) {
            if (pattern.channelType instanceof RegExp) {
                if (event.channel.type && event.channel.type.match(pattern.channelType)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.channel.type && pattern.channelType == event.channel.type) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // device id/name matching
        if (pattern.device) {
            if (pattern.device instanceof RegExp) {
                if (event.device.name && event.device.name.match(pattern.device)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else if (typeof pattern.device == "number") {
                if (event.device.id && event.device.id == pattern.device) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.device.name && event.device.name == pattern.device) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        // device type (HssType) matching
        if (pattern.deviceType) {
            if (pattern.deviceType instanceof RegExp) {
                if (event.device.type && event.device.type.match(pattern.deviceType)) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            } else {
                if (event.device.type && pattern.deviceType == event.device.type) {
                    if (pattern.logic == "or") { return true; }
                    matched = true;
                } else {
                    if (pattern.logic == "and") { return false; }
                }
            }
        }

        return matched;

    },
    startEngine: function () {
        var that = this;
        that.logger.info("script-engine starting");
        that.fs.readdir(__dirname+"/scripts", function (err, data) {
            data.sort();
            for (var i = 0; i < data.length; i++) {
                var path = __dirname+"/scripts/"+data[i];
                runScript(path);
            }
        });
    },
    stop: function () {
        scriptEngine.logger.info("script-engine terminating");
        setTimeout(function () {
            process.exit();
        }, 250);
    }
}

function runScript(path) {
    scriptEngine.logger.verbose("script-engine loading "+path);
    var script = scriptEngine.fs.readFileSync(path);
    // Todo use vm.runInContext
    //var context = scriptEngine.vm.createContext(global);
    //scriptEngine.vm.runInContext(script, context, path);
    //scriptEngine.vm.runInThisContext(script, path);

    var subLength = scriptEngine.subscribers.length;
    var schLength = scriptEngine.schedules.length;
    try {
        eval(script.toString());
        scriptEngine.logger.info("script-engine registered "+(scriptEngine.subscribers.length-subLength)+" subscribers and "+(scriptEngine.schedules.length-schLength)+" schedules in "+path);
    } catch (e) {
        scriptEngine.logger.error("script-engine "+path+" "+e);
    }

}

// Global Stuff for use in Scripts
function log(msg) {
    scriptEngine.logger.info("script        "+msg);
}

function subscribe(pattern, callback) {
    scriptEngine.subscribers.push({
        pattern: pattern,
        callback: callback
    });
}


function schedule(pattern, callback) {
    var sch;
    if (pattern.astro) {
        var date = new Date();
        var ts = scriptEngine.suncalc.getTimes(date, scriptEngine.settings.latitude, scriptEngine.settings.longitude)[pattern.astro];

        if (pattern.shift) {
            ts = new Date(ts.getTime() + (pattern.shift * 60000));
        }

        if (ts < date) {
            date = new Date(date.getTime() + 86400000);
            ts = scriptEngine.suncalc.getTimes(date, scriptEngine.settings.latitude, scriptEngine.settings.longitude)[pattern.astro];
            if (pattern.shift) {
                ts = new Date(ts.getTime() + (pattern.shift * 60000));
            }

        }

        log("ASTRO "+JSON.stringify(pattern)+" "+ts.getFullYear()+"-"+(ts.getMonth()+1)+"-"+ts.getDate()+" "+ts.getHours()+":"+ts.getMinutes()+":"+ts.getSeconds());
        sch = scriptEngine.scheduler.scheduleJob(ts, function () {
            setTimeout(function () {
                sch = schedule(pattern, callback);
            }, 1000);
            callback();
        });


        scriptEngine.schedules.push(sch);
        return sch;
    } else {
        sch = scriptEngine.scheduler.scheduleJob(pattern, callback);
        scriptEngine.schedules.push(sch);
        return sch;
    }
}




function setState(id, val, callback) {
    scriptEngine.socket.emit("setState", [id, val], function () {
        if (callback) {
            callback();
        }
    });
}

function executeProgram(id, callback) {
    scriptEngine.socket.emit("executeProgram", id, function () {
        if (callback) {
            callback();
        }
    });
}

function setObject(id, obj, callback) {
    scriptEngine.socket.emit("setObject", obj, function () {
        if (callback) {
            callback();
        }
    });
}



process.on('SIGINT', function () {
    scriptEngine.stop();
});

process.on('SIGTERM', function () {
    scriptEngine.stop();
});


scriptEngine.init();


