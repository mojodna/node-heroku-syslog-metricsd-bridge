"use strict";

var KVP_SPLITTER = new RegExp(/(\S+=(?:\"[^\"]*\"|\S+))\s?/),
    LINE_MATCHER = new RegExp(/^(\d+) \<(\d+)\>\w+ (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(\+\d{2}:\d{2}|Z)) ([\w\-\.]+) (\w+) ([\w-]+)(\.(\d+))? - - (.*)$/);

var expandUnits = function(val) {
  // unit expansion
  if (val.match(/MB$/)) {
    val = +val.replace(/MB$/, "");
    val = ~~(val * 1024 * 1024);
  } else {
    val = parseFloat(val);
  }

  return val;
};

var extract = function(line) {
  var kvp = line.split(KVP_SPLITTER).filter(function(x) {
    return !!x;
  }).map(function(x) {
    return x.split("=", 2);
  });

  var data = {};

  kvp.forEach(function(x) {
    var key = x[0],
        val = x[1];

    if (key.indexOf("sample#") === 0) {
      data.samples = data.samples || {};

      var sample = key.split("sample#", 2)[1];
      
      data.samples[sample] = expandUnits(val);
    } else {
      data[key] = val;
    }
  });

  return data;
};

var syslog = function(line) {
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

    return {
      length: +matches[1].trim(),
      priority: +matches[2],
      timestamp: matches[3].trim(),
      drainId: matches[6].trim(),
      source: matches[7].trim(),
      process: matches[8].trim(),
      processNum: (matches[10] || "").trim(),
      message: matches[11].trim()
    };
  }
};

module.exports = {
  extract: extract,
  syslog: syslog
};
