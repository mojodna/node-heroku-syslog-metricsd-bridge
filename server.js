"use strict";

var net = require("net"),
    util = require("util");

var metricsd = require("metricsd"),
    metrics = metricsd({
      host: process.env.METRICSD_HOST,
      port: process.env.METRICSD_PORT,
      prefix: process.env.METRICSD_PREFIX
    });

var APPS = require("apps.json");

var server = net.createServer(function(stream) {
  stream.setEncoding("ascii");

  var pending = '';

  stream.on("data", function(chunk) {
    pending += chunk.toString();

    pending.replace("\n", "$\n").split("\n").forEach(function(line) {
      // capture incomplete chunks
      if (line.slice(-1) !== "$") {
        pending = line;
        return;
      }

      // strip off the $ at the end of the line
      line = line.slice(0, -1);

      var matches;
      if ((matches = line.match(/^(\d+) \<(\d+)\>\w+ (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\+\d{2}:\d{2}) ([\w\-\.]+) (\w+) (\w+)(\.(\d+))? - - (.*)$/))) {
        var length = matches[1].trim();
        var priority = matches[2];
        var timestamp = matches[3].trim();
        var drainId = matches[4].trim();
        var source = matches[5].trim();
        var process = matches[6].trim();
        var processNum = (matches[8] || "").trim();
        var message = matches[9].trim();

        var app = APPS[drainId];

        if (!app) {
          console.log("Unrecognized drain id:", drainId);
          return;
        }

        switch (source) {
        case "heroku":
          var kvp = message.split(/(\S+=(?:\"[^\"]*\"|\S+))\s?/).filter(function(x) {
            return !!x;
          }).map(function(x) {
            return x.split("=", 2);
          });

          var data = {};
          var metric = {};

          kvp.forEach(function(x) {
            data[x[0]] = x[1];
          });

          switch (process) {
          case "router":
            metric = {
              connect: +((data.connect || "").slice(0, -2)),
              service: +((data.service || "").slice(0, -2)),
              status: data.status[0] + "xx"
            };

            // TODO when is data.status undefined?
            if (!data.status) {
              console.log(line);
              return;
            }

            metrics.updateHistogram(util.format("%s.connect", app), metric.connect);
            metrics.updateHistogram(util.format("%s.service", app), metric.service);
            metrics.mark(util.format("%s.status.%s", app, metric.status));

            if (data.at === "error") {
              metrics.mark(util.format("%s.errors.%s", app, data.code));
            }

            break;

          case "web":
            if (data.measure && data.val) {
              var val = +data.val;

              if (data.measure.match(/^load_avg/)) {
                val = val * 100;
              } else if (data.measure.match(/^memory/)) {
                // convert to KB
                val = val * 1024;
              }

              metric[data.measure] = Math.round(val);

              metrics.updateGauge(util.format("%s.%s-%s.%s",
                                              app,
                                              process,
                                              processNum,
                                              data.measure),
                                  metric[data.measure]);

              metrics.updateHistogram(util.format("%s.%s",
                                                  app,
                                                  data.measure),
                                      metric[data.measure]);
            }

            break;

          default:
            // console.log("process: %s.%d", process, processNum);
            console.log(line);
          }

          break;

        case "app":
          var kvp = message.split(/(\S+=(?:\"[^\"]*\"|\S+))\s?/).filter(function(x) {
            return !!x;
          }).map(function(x) {
            return x.split("=", 2);
          });

          var data = {};
          kvp.forEach(function(x) {
            data[x[0]] = x[1];
          });

          if (data.metric) {
            metrics.write(util.format("%s.%s.%s", metrics.prefix, app, data.metric));
          }
          // console.log("process: %s.%d", process, processNum);
          // console.log("message:", message);
          break;

        default:
          console.log("Unrecognized source:", source);
        }
      }

      // console.log(line);
    });
  });
});

server.listen(process.env.PORT || 8514, function() {
  console.log("Listening at tcp://%s:%d", this.address().address, this.address().port);
});
