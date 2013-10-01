"use strict";

var assert = require("assert");
var bridge = require("../lib");

describe("#extract", function() {
  it("parses 8/16/13-style Heroku log-runtime-metrics load strings", function() {
    var line = "source=web.1 dyno=heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456 sample#load_avg_1m=2.46 sample#load_avg_5m=1.06 sample#load_avg_15m=0.99";

    var data = bridge.extract(line);

    assert.equal("web.1", data.source);
    assert.equal("heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456", data.dyno);
    assert.equal(2.46, data.samples.load_avg_1m);
    assert.equal("number", typeof data.samples.load_avg_1m);
    assert.equal(1.06, data.samples.load_avg_5m);
    assert.equal(0.99, data.samples.load_avg_15m);
  });

  it("parses 8/16/13-style Heroku log-runtime-metrics memory strings", function() {
    var line = "source=web.1 dyno=heroku.2808254.d97d0ea7-cf3d-411b-b453-d2943a50b456 sample#memory_total=21.00MB sample#memory_rss=21.22MB sample#memory_cache=0.00MB sample#memory_swap=0.00MB sample#memory_pgpgin=348836pages sample#memory_pgpgout=343403pages";

    var data = bridge.extract(line);

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

    var data = bridge.extract(line);

    assert.equal("HEROKU_POSTGRESQL_VIOLET", data.source);
    assert.equal(1873, data.samples.current_transaction);
    assert.equal(26219348792, data.samples.db_size);
    assert.equal(13, data.samples.tables);
    assert.equal(92, data.samples["active-connections"]);
    assert.equal(1, data.samples["waiting-connections"]);
    assert.equal(0.99723, data.samples["index-cache-hit-rate"]);
    assert.equal(0.99118, data.samples["table-cache-hit-rate"]);
  });

  it("parses Heroku router logs", function() {
    var line = '270 <158>1 2013-10-01T18:50:08.660983+00:00 d.5f5769fc-9dad-49ff-918b-ce574bacbfd1 heroku router - - at=info method=GET path=/api?get=status&f=20130930/mapstack_E_wc3dWLvyM host=m2i.maps.stamen.com fwd="76.174.52.177" dyno=web.1 connect=2ms service=21ms status=200 bytes=61';

    var log = bridge.syslog(line);

    assert.equal(270, log.length);
    assert.equal(158, log.priority);
    assert.equal("2013-10-01T18:50:08.660983+00:00", log.timestamp);
    assert.equal("d.5f5769fc-9dad-49ff-918b-ce574bacbfd1", log.drainId);
    assert.equal("heroku", log.source);
    assert.equal("router", log.process);
    assert.equal("", log.processNum);
    assert.equal('at=info method=GET path=/api?get=status&f=20130930/mapstack_E_wc3dWLvyM host=m2i.maps.stamen.com fwd="76.174.52.177" dyno=web.1 connect=2ms service=21ms status=200 bytes=61', log.message);

    var data = bridge.extract(log.message);

    assert.equal("info", data.at);
    assert.equal("GET", data.method);
    assert.equal("/api?get", data.path);
    assert.equal("m2i.maps.stamen.com", data.host);
    assert.equal('"76.174.52.177"', data.fwd);
    assert.equal("web.1", data.dyno);
    assert.equal("2ms", data.connect);
    assert.equal("21ms", data.service);
    assert.equal("200", data.status);
    assert.equal("61", data.bytes);
  });
});
