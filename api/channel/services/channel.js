'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-services)
 * to customize this service
 */

const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const influx = {}

//writeApi.useDefaultTags({ region: 'west' })

module.exports = {
  writeStats: async (channel, progress) => {
    const global = await strapi.services.config.find();

    if (!influx.db) {
      var influx_host = global.influx_host;
      var influx_token = global.influx_token;
      //console.log(global);

      influx.db = new InfluxDB({ url: influx_host, token: influx_token });
    }
    else {
      const api = influx.db.getWriteApi(global.influx_org, global.influx_bucket)
      var point1 = new Point('iptv')
        .tag('channel', channel)
        .floatField('fps', progress.currentFps)
        .intField('frames', progress.frames)
      //console.log(` ${point1}`)

      api.writePoint(point1);
      api.close();
    }
  },
  sourcesStats: async (source, count) => {
    const global = await strapi.services.config.find();

    if (influx.db) {
      const api = influx.db.getWriteApi(global.influx_org, global.influx_bucket)
      var point1 = new Point('iptv_sources')
        .tag('id', source.id)
        .tag('name', source.name)
        .floatField('count', count)
      //console.log(` ${point1}`)

      api.writePoint(point1);
      api.close();
    }
  }
};
