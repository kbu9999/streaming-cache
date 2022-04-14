'use strict';

const parser = require('iptv-playlist-parser');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
  importAll: async (ctx, next) => {

    var sources = await strapi.services.fuente.find();
    //console.log(await strapi.services.channel.findOne({ name: 'ESPN' }));

    sources.forEach(async s => {
      var playlist = await fetch(s.url);
      var data = parser.parse(await playlist.text())

      var count = 0;
      data.items.forEach(async item => {
        if(count > 0) return;
        //console.log(item);
        if (s.allowed_url && !item.url.includes(s.allowed_url))
          return;

        var nameAllowed = false;
        if (s.group_blacklist)
          s.group_blacklist.forEach(n => { nameAllowed |= item.group.title.includes(n) })
        else nameAllowed = true;

        if (!nameAllowed) {
          return;
        }


        var ch = await strapi.query('channel').findOne({ name: item.name });
        if (!ch) {
          strapi.log.info(`Creating Channel ${item.name}`)
          ch = await strapi.services.channel.create({ name: item.name })
          count++;
        }

        if (item.tvg.logo && (ch.logos.length > 0 && item.tvg.logo !== ch.logos[0].url)) {
          strapi.log.info(`Update Logo Channel ${item.name}: ${item.tvg.logo}`)
          strapi.services.channel.update({ id: ch.id }, { logos: [{ __component: "logos.logo", url: item.tvg.logo }] })
        }
        var links = await strapi.query('links').find({ channel: ch.id, source: s.id });
        //console.log(links);
        if(links.length == 0){
          strapi.log.info(`Creating Link Channel ${item.name}: ${item.url}`)
          strapi.services.links.create({ url: item.url, channel: ch.id, source: s.id });
        }
        else {
          links.forEach(link => {
            if(item.url === item.url) return;

            strapi.log.info(`Update Link Channel ${item.name}: ${item.url} from ${link.url}`)
            strapi.services.links.update({id: link.id } ,{ url: item.url, channel: ch.id, source: s.id });
          })
        }

        //console.log(links);
        //strapi.log.info(`Update Channel ${ch.id} - ${ch.name}`)

      })
      strapi.log.info(`import end`);
    })//*/

    return { status: "OK" }
  },
  checkChannels: async (ctx, next) => {
    var channels = await strapi.services.channel.find({ _limit: -1 });
    channels.forEach(async ch => {
      try {
        var r = await fetch(ch.url);
        strapi.log.info(r.ok ? `${ch.id} m3u8 OK` : `${ch.id} m3u8 Failed`)
        strapi.services.channel.update({ id: ch.id }, { active: r.ok });
      } catch (error) {
        strapi.log.info(`${ch.id} m3u8 Failed`)
        strapi.services.channel.update({ id: ch.id }, { active: false });
      }
    })
  },
  cleanChannels: async (ctx, next) => {
    const { id } = ctx.params;

    var links = await strapi.services.links.delete({ source: id });
    links.forEach(async lnk => {
      strapi.log.warn(`${lnk.url} deleted`);
    })
    //console.log(r);

    return { status: "OK" }
  }
};


