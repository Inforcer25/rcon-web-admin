"use strict";

Widget.register(function (widget) {
    var consoleEl = $('<div class="console">');
    var cmdEl = $('<div class="cmd form-group has-feedback input-group">' +
        '<span class="input-group-addon"><i class="glyphicon glyphicon-chevron-right"></i></span>' +
        '<input type="search" class="form-control" placeholder="' + widget.t("input.cmd") + '">' +
        '</div>');
    var searchEl = $('<div class="search form-group has-feedback input-group form-inline">' +
        '<span class="input-group-addon"><i class="glyphicon glyphicon-search"></i></span>' +
        '<input type="search" class="form-control" placeholder="' + widget.t("input.search") + '">' +
        '<select class="selectpicker">' +
        '<option value="yes">' + widget.t("autoscroll.enabled") + '</option>' +
        '<option value="no">' + widget.t("autoscroll.disabled") + '</option>' +
        '</select>' +
        '</div>');
    var cmdSelect = $('<div class="cmd-select">' +
        '<select class="selectpicker" data-live-search="true">' +
        '<option value="">' + widget.t("list.commands") + '</option>' +
        '</select>' +
        '</div>');
    var autoscrollInp = searchEl.find("select");

    var initialServerLog = [];
    var receivedServerMessages = [];
    var searchTimeout = null;
    var searchMatchTimeout = null;

    /**
     * Add a message to console
     * @param {object} messageData
     */
    var addMessage = function (messageData) {
        var cl = "";
        if (widget.options.get("hideUserCommands") && (messageData.user)) {
            cl = "collapsed";
        }
        if (widget.options.get("hideServerLogs") && (messageData.type === 4)) {
            cl = "collapsed";
        }
        cl += " logtype-" + messageData.type;
        var e = $('<div class="message ' + cl + '">' +
            '<div class="header"><span class="glyphicon glyphicon-chevron-down"></span>' +
            '<span class="glyphicon glyphicon-chevron-right"></span>' +
            '<span class="glyphicon glyphicon-info-sign"></span></div>' +
            '<div class="text"></div>' +
            '</div>'
        );
        e.find(".header").append($('<span class="timestamp"></span>').html(new Date(messageData.timestamp).toLocaleString()));
        if (messageData.user) {
            e.find(".header").append('<span class="glyphicon glyphicon-user"></span>' +
                '<span class="username">' + messageData.user + '</span>');
        }
        e.find(".text").html(escapeHtml(messageData.body));
        consoleEl.append(e);
        if (autoscrollInp.length && autoscrollInp[0].value == "yes") {
            scrollTo(999999999);
        }
    };

    /**
     * Scroll console to given position
     * @param {number} pos
     */
    var scrollTo = function (pos) {
        $({"pos": consoleEl.scrollTop()}).animate({"pos": pos}, {
            duration: 300,
            step: function () {
                consoleEl.scrollTop(this.pos);
            }
        });
    };

    /**
     * Reload server log
     */
    var reloadServerLog = function () {
        consoleEl.html('');
        if (widget.options.get("showOldLogs")) {
            for (var i = 0; i < initialServerLog.length; i++) {
                if (!initialServerLog[i].length) continue;
                addMessage(JSON.parse(initialServerLog[i]));
            }
        }
        for (var j = 0; j < receivedServerMessages.length; j++) {
            if (!receivedServerMessages[i]) continue;
            addMessage(receivedServerMessages[i]);
        }
    };

    /**
     * On initialization
     */
    widget.onInit = function () {
        // get all available command and list in the cmd select
        widget.backend("commands", null, function (data) {
            var select = cmdSelect.find("select");
            var addOptions = function (type, entries) {
                entries.sort();
                var icon = type == "cmd" ? "chevron-right" : "usd";
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    select.append(
                        $('<option>')
                            .attr("value", type + ":" + entry)
                            .html('<div class="option">' +
                                '<span class="glyphicon glyphicon-' + icon + '"></span>' +
                                '<span class="text">' + entry + '</span>' +
                                '</div>')
                    );
                }
            };
            addOptions("cmd", data.commands);
            addOptions("variable", data.variables);
            select.selectpicker("refresh");
        });

        widget.content.on("keydown", ".cmd input", function (ev) {
            if (ev.keyCode == 9) {
                ev.preventDefault();
            }
        });
        widget.content.on("keyup", ".cmd input", function (ev) {
            if (ev.keyCode == 27) {
                this.value = "";
            }
            if (ev.keyCode == 13) {
                widget.cmd(this.value);
                this.value = "";
            }
        });
        widget.content.on("click", ".timestamp", function (ev) {
            $(this).closest(".message").toggleClass("collapsed");
            scrollTo($(this).closest(".message")[0].offsetTop - 40);
        });
        widget.content.on("change", ".cmd-select select", function (ev) {
            var v = $(this).val();
            if (v.length) {
                var inp = cmdEl.find("input");
                inp.blur();
                $(this).selectpicker("val", "");
                setTimeout(function () {
                    var cmd = v.match(/^([a-z]+)\:([a-z\.]+)/i);
                    var iv = cmd[2].replace(/^global\./, "") + " ";
                    inp.val(iv).focus();
                }, 100);
            }
        });
        widget.content.on("keyup", ".search input", function (ev) {
            var messages = widget.content.find(".console .message");
            if (ev.keyCode == 13) {
                messages.find(".match").not(".skip").first().addClass("skip");
                var firstMatch = messages.find(".match").not(".skip").first();
                if (firstMatch.length) {
                    scrollTo(firstMatch[0].offsetTop - 30);
                }
                return;
            }
            clearTimeout(searchTimeout);
            var value = this.value;
            searchTimeout = setTimeout(function () {
                if (value.length <= 1 && $(this).data("searched")) {
                    $(this).data("searched", 0);
                    reloadServerLog();
                }
                if (value.length > 1) {
                    $(this).data("searched", 1);
                    var s = value.trim().split(" ");
                    var sRegex = s;
                    for (var i in sRegex) {
                        sRegex[i] = {
                            "regex": new RegExp(sRegex[i].replace(/[^0-9a-z\/\*]/ig, "\\$&").replace(/\*/ig, ".*?"), "ig"),
                            "val": s[i]
                        };
                    }
                    messages.addClass("hidden").each(function () {
                        var f = $(this);
                        var value = f.find("*").text();
                        if (!f.data("searchelements")) {
                            f.data("searchelements", [
                                {"el": f.find(".header .username"), "value": f.find(".header .username").text()},
                                {"el": f.find(".header .timestamp"), "value": f.find(".header .timestamp").text()},
                                {"el": f.find(".text"), "value": f.find(".text").text()}
                            ]);
                        }
                        var elements = f.data("searchelements");
                        for (var i in elements) {
                            var data = elements[i];
                            var html = data.value;
                            var matches = [];
                            var fail = false;
                            sRegex.forEach(function (val) {
                                var m = value.match(val.regex);
                                if (!value.match(val.regex)) {
                                    fail = true;
                                    return true;
                                } else {
                                    matches.push(m[0]);
                                    html = html.replace(val.regex, "_" + (matches.length - 1) + "_");
                                }
                            });
                            if (!fail) {
                                f.removeClass("hidden collapsed");
                            }
                            for (var m in matches) {
                                html = html.replace(new RegExp("_" + m + "_", "ig"), '<span class="match">' + matches[m] + '</span>');
                            }
                            data.el.html(html);
                        }
                    });
                    var firstMatch = messages.find(".match").not(".skip").first();
                    if (firstMatch.length) {
                        scrollTo(firstMatch[0].offsetTop - 30);
                    }
                }
            }, 100);
        });
        widget.content.append(consoleEl);
        widget.content.append(searchEl);
        widget.content.append(cmdEl);
        widget.content.append(cmdSelect);
        widget.content.find(".selectpicker").selectpicker();
        widget.onRconMessage(function (message) {
            receivedServerMessages.push(message);
            addMessage(message);
        });

        var serverLogOptions = {};
        if (widget.options.get("limit")) {
            serverLogOptions.limit = widget.options.get("limitNr");
        }
        widget.backend("server-log", serverLogOptions, function (messageData) {
            initialServerLog = messageData.log.split("\n");
            reloadServerLog();
        });
    };

    /**
     * On widget option update
     * @param {string} key
     * @param {*} value
     */
    widget.onOptionUpdate = function (key, value) {
        reloadServerLog();
    };
});