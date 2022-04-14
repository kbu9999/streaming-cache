'use strict';

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

const fs = require('fs');
const { execSync } = require("child_process");
const ffmpeg = require('fluent-ffmpeg');

const channels = {};
const sources = {};

/*
-threads 1 -nostdin -hide_banner -nostats -loglevel error -fflags +genpts+discardcorrupt+igndts
-hwaccel vaapi -vaapi_device /dev/dri/renderD128 -hwaccel_output_format vaapi
-re -i /media/storage1/Anime/Boku No Hero Academia/S03/S03E25 My Hero Academia Inigualable-new.mkv
-filter_complex [0:1]apad=whole_dur=1415039ms[a];[0:0]format=nv12|vaapi,hwupload,scale_vaapi=1280:720:force_divisible_by=2:format=nv12,setsar=1[v]
-map [a] -map [v] -muxdelay 0 -muxpreload 0 -movflags +faststart -flags cgop -sc_threshold 0
-t 00:23:35.0390000 -video_track_timescale 90000 -b:v 2000k -maxrate:v 2000k -bufsize:v 4000k
-output_ts_offset 322.4054111111111 -pix_fmt p010le
-c:v h264_vaapi -c:a aac -b:a 192k -maxrate:a 192k -bufsize:a 384k -ar 48k
-map_metadata -1 -metadata service_provider="ErsatzTV" -metadata service_name="ErsatzTV"
-metadata:s:a:0 language=spa -g 96 -keyint_min 96 -force_key_frames expr:gte(t,n_forced*4)
-f hls
-hls_time 4
-hls_list_size 0
-segment_list_flags +live
-hls_segment_filename /root/.local/share/etv-transcode/1/live%06d.ts
-hls_flags program_date_time+append_list+discont_start+omit_endlist+independent_segments
-mpegts_flags +initial_discontinuity
/root/.local/share/etv-transcode/1/live.m3u8
*/

setInterval(() => {
  let curr = new Date();
  //console.log(curr, channels)
  Object.values(channels).forEach(ch => {
    let time = curr - ch.last;
    //console.log(time)
    if (time > 25000) {
      ch.command.kill();
      strapi.log.info('closing channel');
    }
  })


  strapi.services.fuente.find().then(s_sources => {
    s_sources.forEach(src => {
      //console.log(sources[src.id]);
      strapi.services.channel.sourcesStats(src, sources[src.id]? sources[src.id] : 0)
    })
  })
}, 2500)

function clearStream(channel, src, file, timerId) {
  if (src && sources[src.id]) sources[src.id]--;
  delete channels[channel];
  clearInterval(timerId)
  if (fs.existsSync(file))
    fs.unlinkSync(file);
}

function createStream(link, channel, src, file) {
  return new Promise((resolve, reject) => {
    strapi.log.info(`creando stream ${file}`)

    var timerId = setInterval(() => {
      const isExists = fs.existsSync(file)

      if (isExists) {
        clearInterval(timerId)

        strapi.log.info(`${file} ready`)
        const stream = fs.createReadStream(file)
          .on('error', reject);;
        resolve(stream);
      }
    }, 500)

    if (src)
      sources[src.id] = sources[src.id] ? sources[src.id] + 1 : 1;

    var cmd = ffmpeg(link.url, { timeout: 432000 })
      //.native()
      .inputOptions([
        '-fflags +igndts+genpts',
        '-reconnect_at_eof 1',
        '-reconnect_streamed 1',
        '-reconnect_delay_max 2'
      ])
      .audioCodec('copy')
      .videoCodec('copy')
      .addOptions([
        '-fflags +genpts',
        '-vsync -1',
        '-threads 0',
        //'-hls_flags delete_segments+independent_segments',
        //'-hls_playlist_type vod',
        //'-hls_start_number_source 0',
        //'-hls_init_time 1',
        '-hls_time 2',
        '-hls_list_size 20',
        '-avioflags +direct',
        '-hls_ts_options fflags=+flush_packets',
        '-segment_list_flags +live',
        `-hls_segment_filename /tmp/live${channel}-%06d.ts`,
        '-hls_flags delete_segments+program_date_time+append_list+discont_start+omit_endlist+independent_segments',
        '-mpegts_flags +initial_discontinuity',
        '-force_key_frames expr:gte(t,n_forced*2)',
        '-f hls'
      ]).output(file).on('start', () => {
        strapi.log.info(`start conv ${file}`)

      }).on('progress', function (progress) {
        //console.log('Processing: ', progress);
        strapi.services.channel.writeStats(channel, progress)
      }).on('error', (err) => {
        if (!err.message.includes("SIGKILL"))
          strapi.log.warn(err.message)

        clearStream(channel, src, file, timerId)
      }).on('end', () => {
        strapi.log.info(`end ${file}`);

        clearStream(channel, src, file, timerId)
      });

    channels[channel] = {
      command: cmd,
      //src: src.id,
      last: new Date()
    };
    cmd.run();//*/
  })
}

/*async function getSourceAviable() {
  var s = await strapi.services.fuente.find();
  return s.find(f => {
    console.log(sources[f.id], f.limit);
    return sources[f.id] ? sources[f.id] < f.limit : true
  })
}//*/

async function getSourceAviable(links) {
  var lnk1 = links.find(l => l.source === null);
  if (lnk1) return lnk1;

  //const s_sources = await strapi.services.fuente.find();
  //console.log(links);
  var avs = links.map(lnk => lnk.source)

  const max = avs.reduce((mx, s) => s.limit > mx ? s.limit : mx, 0);
  for (var i = 0; i < max; i++) {
    for (var j = 0; j < avs.length; j++) {
      if (i >= avs[j].limit) continue
      if (i < sources[j]) continue
      //vs.push(avs[j].name);
      return links[j];
    }
  }
}

module.exports = {
  getPlaylist: async (ctx, next) => {
    var playlist = "#EXTM3U\n";
    let global = await strapi.services.config.find();
    let channels = await strapi.services.channel.find({ _limit: -1 });

    channels.forEach((c, i) => {
      var lg = "";
      if (c.logos.length > 0) {
        var logo = c.logos[0]
        if (logo.__component == "logos.logo-media") {
          lg = `${global.base_url}${logo.logo.formats.small.url}`
        }
        else
          lg = logo.url;
      }
      playlist += `#EXTINF:-1 tvg-id="${c.id}" tvg-name="${c.name}" tvg-logo="${lg}" group-title="${c.category}", ${c.name} HD\n${global.base_url}/channels/${c.id}/live.m3u8\n`
    })
    return playlist;
  },
  getManifestStream: async (ctx, next) => {
    const { id } = ctx.params;
    var file = `/tmp/channel${id}.m3u8`;

    if (!(id in channels)) {
      const data = await strapi.services.channel.findOne({ id });

      const links = await strapi.services.links.find({ channel: id, active: true });
      const lnk = await getSourceAviable(links)
      if (!lnk) {
        strapi.log.warn('limit exceded');
        return;
      }

      //console.log(lnk)
      if (lnk.isYT) {
        var yt = execSync(`youtube-dl -f 94 -g "${lnk.url}"`);
        lnk.url = yt.toString().trim();
      }

      return await createStream(lnk, data.id, lnk.source, file);
    }
    else {
      var ch = channels[id];
      ch.last = new Date();
      return fs.createReadStream(file);
    }
  },
  getSegmentStream: async (ctx, next) => {
    //strapi.log.info('get segment');
    return fs.createReadStream("/tmp/" + ctx.params.segment + '.ts');
  },
};
