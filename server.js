"use strict";

var net = require("net");

var carrier = require("carrier"),
    metricsd = require("metricsd"),
    metrics = metricsd({
      host: process.env.METRICSD_HOST,
      port: process.env.METRICSD_PORT,
      prefix: process.env.METRICSD_PREFIX
    });

var APPS = require("./apps.json");
var KVP_SPLITTER = new RegExp(/(\S+=(?:\"[^\"]*\"|\S+))\s?/);
var LINE_MATCHER = new RegExp(/^(\d+) \<(\d+)\>\w+ (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(\+\d{2}:\d{2}|Z)) ([\w\-\.]+) (\w+) ([\w-]+)(\.(\d+))? - - (.*)$/);

var server = net.createServer(function(stream) {
  carrier.carry(stream, function(line) {
    var matches;

    if ((matches = line.match(LINE_MATCHER))) {
      // TODO use length to validate line
      var length = matches[1].trim();
      var priority = matches[2];
      var timestamp = matches[3].trim();
      var drainId = matches[6].trim();
      var source = matches[7].trim();
      var process = matches[8].trim();
      var processNum = (matches[10] || "").trim();
      var message = matches[11].trim();

      var app = APPS[drainId];

      if (!app) {
        console.log("Unrecognized drain id:", drainId);
        return;
      }

      var kvp = message.split(KVP_SPLITTER).filter(function(x) {
        return !!x;
      }).map(function(x) {
        return x.split("=", 2);
      });

      var data = {};

      kvp.forEach(function(x) {
        if (x[1]) {
          data[x[0]] = x[1];
        }
      });

      switch (source) {
      case "heroku":
        var metric = {};

        switch (process) {
        case "router":
          // TODO when is data.status undefined?
          // probably when we're looking at an invalid line
          if (!data.status) {
            console.log(line);
            return;
          }

          metric = {
            connect: +((data.connect || "").slice(0, -2)),
            service: +((data.service || "").slice(0, -2)),
            status: data.status[0] + "xx"
          };

          metrics.updateHistogram("%s.connect", app, metric.connect);
          metrics.updateHistogram("%s.service", app, metric.service);
          metrics.mark("%s.status.%s", app, metric.status);

          if (data.at === "error") {
            metrics.mark("%s.errors.%s", app, data.code);
          }

          break;

        case "web":
          if (data.measure && data.val) {
            var val = +data.val;

            if (data.measure.indexOf("load_avg") === 0) {
              val = val * 100;
            } else if (data.measure.indexOf("memory") === 0) {
              // convert to KB
              val = val * 1024;
            }

            metric[data.measure] = Math.round(val);

            metrics.updateGauge("%s.%s-%s.%s",
                                app,
                                process,
                                processNum,
                                data.measure,
                                metric[data.measure]);

            metrics.updateHistogram("%s.%s",
                                    app,
                                    data.measure,
                                    metric[data.measure]);
          }

          break;

        case "api":
          if (message.indexOf("Deploy") === 0) {
            metrics.mark("%s.deploy", app);
          } else if (message.indexOf("Scale") === 0) {
            // TODO delete gauges associated with instances that no longer
            // exist
            // TODO delete histograms if count=0
            var type = Object.keys(data)[0];
            metrics.updateGauge("%s.%s", app, type, data[type]);
          } else {
            console.log(line);
          }

          break;

        default:
          // console.log("process: %s.%d", process, processNum);
          console.log(line);
        }

        break;

      case "app":
        switch (process) {
        // postgres logs
        case "postgres":
          console.log(line);
          break;

        // general postgres metrics
        case "heroku-postgres":
          var source = data.source;
          metrics.updateGauge("%s.db_size", source, parseInt(data["measure.db_size"]));
          metrics.updateGauge("%s.tables", source, +data["measure.tables"]);
          metrics.updateGauge("%s.active-connections", source, +data["measure.active-connections"]);
          metrics.updateGauge("%s.waiting-connections", source, +data["measure.waiting-connections"]);
          metrics.updateGauge("%s.index-cache-hit-rate", source, +data["measure.index-cache-hit-rate"] * 100000);
          metrics.updateGauge("%s.table-cache-hit-rate", source, +data["measure.table-cache-hit-rate"] * 100000);

          break;

        default:
          if (data.metric) {
            metrics.write(metrics.format("%s.%s", app, data.metric));
          }
        }

        break;

      default:
        console.log("Unrecognized source:", source);
      }
    } else {
      console.log("Unmatched:", line);
    }
  });
});

server.listen(process.env.PORT || 8514, function() {
  console.log("Listening at tcp://%s:%d", this.address().address, this.address().port);
});
