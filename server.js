"use strict";

var net = require("net");

var carrier = require("carrier"),
    metricsd = require("metricsd"),
    metrics = metricsd({
      host: process.env.METRICSD_HOST,
      port: process.env.METRICSD_PORT,
      prefix: process.env.METRICSD_PREFIX
    });

var bridge = require("./lib");

var APPS = require("./apps.json");
var LINE_MATCHER = new RegExp(/^(\d+) \<(\d+)\>\w+ (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(\+\d{2}:\d{2}|Z)) ([\w\-\.]+) (\w+) ([\w-]+)(\.(\d+))? - - (.*)$/);

var server = net.createServer(function(stream) {
  carrier.carry(stream, function(line) {
    var log = bridge.syslog(line);
    
    if (log) {
      var app = APPS[log.drainId];

      if (!app) {
        console.log("Unrecognized drain id:", log.drainId);
        return;
      }

      var data = bridge.extract(log.message);

      switch (log.source) {
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
          if (data.samples) {
            Object.keys(data.samples).forEach(function(metric) {
              var val = data.samples[metric];

              if (metric.indexOf("load_avg") >= 0) {
                val *= 100;
              }

              metrics.updateGauge("%s.%s-%s.%s",
                                  app,
                                  log.process,
                                  log.processNum,
                                  metric,
                                  val);

              metrics.updateHistogram("%s.%s",
                                      app,
                                      metric,
                                      val);
            });
          }

          break;

        case "api":
          if (log.message.indexOf("Deploy") === 0) {
            metrics.mark("%s.deploy", app);
          } else if (log.message.indexOf("Scale") === 0) {
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
          Object.keys(data.samples).forEach(function(metric) {
            var val = data.samples[metric];

            if (metric.indexOf("rate") >= 0) {
              val *= 100000;
            }

            metrics.updateGauge("%s.%s", data.source, metric, val);
          });

          break;

        default:
          if (data.metric) {
            metrics.write(metrics.format("%s.%s", app, data.metric));
          }
        }

        break;

      default:
        console.log("Unrecognized source:", data.source);
      }
    } else {
      console.log("Unmatched:", line);
    }
  });
});

server.listen(process.env.PORT || 8514, function() {
  console.log("Listening at tcp://%s:%d", this.address().address, this.address().port);
});
