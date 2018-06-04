import * as utils from './utils';

const MAX_URL_LENGTH = 2000;

export default function EventSender(eventsUrl, environmentId, forceHasCors, imageCreator) {
  let hasCors;
  const postUrl = eventsUrl + '/events/bulk/' + environmentId;
  const imageUrl = eventsUrl + '/a/' + environmentId + '.gif';
  const sender = {};

  function loadUrlUsingImage(src, onDone) {
    const img = new Image();
    if (onDone) {
      img.addEventListener('load', onDone);
    }
    img.src = src;
  }

  function getResponseInfo(xhr) {
    const ret = { status: xhr.status };
    const dateStr = xhr.getResponseHeader('Date');
    if (dateStr) {
      const time = Date.parse(dateStr);
      if (time) {
        ret.serverTime = time;
      }
    }
    return ret;
  }

  function sendChunk(events, usePost, sync) {
    const createImage = imageCreator || loadUrlUsingImage;
    const send = onDone => {
      if (usePost) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', postUrl, !sync);
        utils.addLDHeaders(xhr);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-LaunchDarkly-Event-Schema', '3');

        if (!sync) {
          xhr.addEventListener('load', () => {
            onDone(getResponseInfo(xhr));
          });
        }

        xhr.send(JSON.stringify(events));
      } else {
        const src = imageUrl + '?d=' + utils.base64URLEncode(JSON.stringify(events));
        createImage(src, sync ? null : onDone);
      }
    };

    if (sync) {
      send();
    } else {
      return new Promise(resolve => {
        send(resolve);
      });
    }
  }

  sender.sendEvents = function(events, sync) {
    // Detect browser support for CORS (can be overridden by tests)
    if (hasCors === undefined) {
      if (forceHasCors === undefined) {
        hasCors = 'withCredentials' in new XMLHttpRequest();
      } else {
        hasCors = forceHasCors;
      }
    }

    const finalSync = sync === undefined ? false : sync;
    let chunks;
    if (hasCors) {
      // no need to break up events into chunks if we can send a POST
      chunks = [events];
    } else {
      chunks = utils.chunkUserEventsForUrl(MAX_URL_LENGTH - eventsUrl.length, events);
    }
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      results.push(sendChunk(chunks[i], hasCors, finalSync));
    }
    return sync ? Promise.resolve() : Promise.all(results);
  };

  return sender;
}
