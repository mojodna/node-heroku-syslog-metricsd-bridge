"use strict";

var assert = require("assert");

var KVP_SPLITTER = new RegExp(/(\S+=(?:\"[^\"]*\"|\S+))\s?/);

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

describe("#extract", function() {
  it("parses 8/16/13-style Heroku log-runtime-metrics load strings", function() {
    var line = "source=web.1 dyno=heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456 sample#load_avg_1m=2.46 sample#load_avg_5m=1.06 sample#load_avg_15m=0.99";

    var data = extract(line);

    assert.equal("web.1", data.source);
    assert.equal("heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456", data.dyno);
    assert.equal(2.46, data.samples.load_avg_1m);
    assert.equal("number", typeof data.samples.load_avg_1m);
    assert.equal(1.06, data.samples.load_avg_5m);
    assert.equal(0.99, data.samples.load_avg_15m);
  });

  it("parses 8/16/13-style Heroku log-runtime-metrics memory strings", function() {
    var line = "source=web.1 dyno=heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456 sample#memory_total=21.00MB sample#memory_rss=21.22MB sample#memory_cache=0.00MB sample#memory_swap=0.00MB sample#memory_pgpgin=348836pages sample#memory_pgpgout=343403pages";

    var data = extract(line);

    assert.equal("web.1", data.source);
    assert.equal("heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456", data.dyno);
    assert.equal(22020096, data.samples.memory_total);
    assert.equal(22250782, data.samples.memory_rss);
    assert.equal(0, data.samples.memory_cache);
    assert.equal(0, data.samples.memory_swap);
    assert.equal(348836, data.samples.memory_pgpgin);
    assert.equal(343403, data.samples.memory_pgpgout);
  });

  it("parses 9/11/13-style Heroku Postgres log strings", function() {
    var line = "2013-05-07T17:41:06+00:00 source=HEROKU_POSTGRESQL_VIOLET sample#current_transaction=1873 sample#db_size=26219348792bytes sample#tables=13 sample#active-connections=92 sample#waiting-connections=1 sample#index-cache-hit-rate=0.99723 sample#table-cache-hit-rate=0.99118";

    var data = extract(line);

    assert.equal("HEROKU_POSTGRESQL_VIOLET", data.source);
    assert.equal(1873, data.samples.current_transaction);
    assert.equal(26219348792, data.samples.db_size);
    assert.equal(13, data.samples.tables);
    assert.equal(92, data.samples["active-connections"]);
    assert.equal(1, data.samples["waiting-connections"]);
    assert.equal(0.99723, data.samples["index-cache-hit-rate"]);
    assert.equal(0.99118, data.samples["table-cache-hit-rate"]);
  });
});
