import Base64 from 'Base64';
import sinon from 'sinon';

import EventSender from '../EventSender';
import * as utils from '../utils';

describe('EventSender', () => {
  let sandbox;
  let xhr;
  let requests = [];
  const eventsUrl = '/fake-url';
  const envId = 'env';

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    requests = [];
    xhr = sinon.useFakeXMLHttpRequest();
    xhr.onCreate = function(xhr) {
      requests.push(xhr);
    };
  });

  afterEach(() => {
    sandbox.restore();
    xhr.restore();
  });

  function lastRequest() {
    return requests[requests.length - 1];
  }

  function fakeImageCreator() {
    const ret = function(url, onDone) {
      ret.urls.push(url);
      ret.onDone = onDone;
    };
    ret.urls = [];
    return ret;
  }

  function base64URLDecode(str) {
    let s = str;
    while (s.length % 4 !== 0) {
      s = s + '=';
    }
    s = s.replace(/_/g, '/').replace(/-/g, '+');
    return decodeURIComponent(escape(Base64.atob(s)));
  }

  function decodeOutputFromUrl(url) {
    const prefix = eventsUrl + '/a/' + envId + '.gif?d=';
    if (!url.startsWith(prefix)) {
      throw 'URL "' + url + '" did not have expected prefix "' + prefix + '"';
    }
    return JSON.parse(base64URLDecode(url.substring(prefix.length)));
  }

  describe('using image endpoint when CORS is not available', () => {
    it('should encode events in a single chunk if they fit', () => {
      const imageCreator = fakeImageCreator();
      const sender = EventSender(eventsUrl, envId, false, imageCreator);
      const event1 = { kind: 'identify', key: 'userKey1' };
      const event2 = { kind: 'identify', key: 'userKey2' };
      const events = [event1, event2];

      sender.sendEvents(events, false);

      const urls = imageCreator.urls;
      expect(urls.length).toEqual(1);
      expect(decodeOutputFromUrl(urls[0])).toEqual(events);
    });

    it('should send events in multiple chunks if necessary', () => {
      const imageCreator = fakeImageCreator();
      const sender = EventSender(eventsUrl, envId, false, imageCreator);
      const events = [];
      for (let i = 0; i < 80; i++) {
        events.push({ kind: 'identify', key: 'thisIsALongUserKey' + i });
      }

      sender.sendEvents(events, false);

      const urls = imageCreator.urls;
      expect(urls.length).toEqual(3);
      expect(decodeOutputFromUrl(urls[0])).toEqual(events.slice(0, 31));
      expect(decodeOutputFromUrl(urls[1])).toEqual(events.slice(31, 62));
      expect(decodeOutputFromUrl(urls[2])).toEqual(events.slice(62, 80));
    });

    it('should set a completion handler', () => {
      const imageCreator = fakeImageCreator();
      const sender = EventSender(eventsUrl, envId, false, imageCreator);
      const event1 = { kind: 'identify', key: 'userKey1' };

      sender.sendEvents([event1], false);

      expect(imageCreator.onDone).toBeDefined();
    });
  });

  describe('using POST when CORS is available', () => {
    it('should send asynchronously', () => {
      const sender = EventSender(eventsUrl, envId, true);
      const event = { kind: 'identify', key: 'userKey' };
      sender.sendEvents([event], false);
      lastRequest().respond();
      expect(lastRequest().async).toEqual(true);
    });

    it('should send synchronously', () => {
      const sender = EventSender(eventsUrl, envId, true);
      const event = { kind: 'identify', key: 'userKey' };
      sender.sendEvents([event], true);
      lastRequest().respond();
      expect(lastRequest().async).toEqual(false);
    });

    it('should send all events in request body', () => {
      const sender = EventSender(eventsUrl, envId, true);
      const events = [];
      for (let i = 0; i < 80; i++) {
        events.push({ kind: 'identify', key: 'thisIsALongUserKey' + i });
      }
      sender.sendEvents(events, false);
      lastRequest().respond();
      const r = lastRequest();
      expect(r.url).toEqual(eventsUrl + '/events/bulk/' + envId);
      expect(r.method).toEqual('POST');
      expect(JSON.parse(r.requestBody)).toEqual(events);
    });

    it('should send custom user-agent header', () => {
      const sender = EventSender(eventsUrl, envId, true);
      const event = { kind: 'identify', key: 'userKey' };
      sender.sendEvents([event], true);
      lastRequest().respond();
      expect(lastRequest().requestHeaders['X-LaunchDarkly-User-Agent']).toEqual(utils.getLDUserAgentString());
    });
  });
});
