"use strict";

var Widget = require(__dirname + "/../../../src/widget");

var widget = new Widget();

/**
 * All available commands for the server
 * @type {{variables: [], commands: []}}
 */
widget.availableCommands = {"variables": [], "commands": []};

/**
 * On rcon server has successfully connected and authenticated
 * @param {RconServer} server
 */
widget.onServerConnected = function (server) {
    // get available commands on server connect, ignore the log
    server.cmd("find .", null, false, function (data) {
        var key = "variables";
        var lines = data.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.toLowerCase() == "commands:") {
                key = "commands";
            }
            if (line.substr(0, 1) != " ") continue;
            widget.availableCommands[key].push(line.substr(1));
        }
    });
};

/**
 * On frontend message
 * @param {RconServer} server
 * @param {WebSocketUser} user
 * @param {string} action The action
 * @param {*} messageData Any message data received from frontend
 * @param {function} callback Pass an object as message data response for the frontend
 */
widget.onFrontendMessage = function (server, user, action, messageData, callback) {
    switch (action) {
        case "commands":
            callback(this, widget.availableCommands);
            break;
        case "server-log":
            server.logRoll();
            var logData = server.getLogData().toString();
            if (messageData.limit) {
                logData = logData.split("\n");
                logData = logData.slice(-messageData.limit - 1);
                logData = logData.join("\n");
            }
            callback(this, {"log": logData});
            break;
    }
};

module.exports = widget;