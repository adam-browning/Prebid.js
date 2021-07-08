import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import * as utils from '../src/utils.js';
import { config } from '../src/config.js';

const BIDDER_CODE = 'yahoo';
const ADAPTER_VERSION = '1.0.0';
const PREBID_VERSION = '$prebid.version$';
const BID_RESPONSE_TTL = 3600;
const DEFAULT_CURRENCY = 'USD';
const SUPPORTED_USER_ID_SOURCES = [
  'verizonmedia.com',
  'liveramp.com'
];

const SSP_ENDPOINT = 'https://c2shb.ssp.yahoo.com/bidRequest';

/* Utility functions */
function hasPurpose1Consent(bidderRequest) {
  if (bidderRequest && bidderRequest.gdprConsent) {
    if (bidderRequest.gdprConsent.gdprApplies && bidderRequest.gdprConsent.apiVersion === 2) {
      return !!(utils.deepAccess(bidderRequest.gdprConsent, 'vendorData.purpose.consents.1') === true);
    }
  }
  return true;
}

function getSize(size) {
  return {
    w: parseInt(size[0]),
    h: parseInt(size[1])
  }
}

function transformSizes(sizes) {
  if (utils.isArray(sizes) && sizes.length === 2 && !utils.isArray(sizes[0])) {
    return [ getSize(sizes) ];
  }
  return sizes.map(getSize);
}

function extractUserSyncUrls(syncOptions, pixels) {
  let itemsRegExp = /(img|iframe)[\s\S]*?src\s*=\s*("|')(.*?)\2/gi;
  let tagNameRegExp = /\w*(?=\s)/;
  let srcRegExp = /src=("|')(.*?)\1/;
  let userSyncObjects = [];

  if (pixels) {
    let matchedItems = pixels.match(itemsRegExp);
    if (matchedItems) {
      matchedItems.forEach(item => {
        let tagName = item.match(tagNameRegExp)[0];
        let url = item.match(srcRegExp)[2];

        if (tagName && url) {
          let tagType = tagName.toLowerCase() === 'img' ? 'image' : 'iframe';
          if ((!syncOptions.iframeEnabled && tagType === 'iframe') ||
                (!syncOptions.pixelEnabled && tagType === 'image')) {
            return;
          }
          userSyncObjects.push({
            type: tagType,
            url: url
          });
        }
      });
    }
  }

  return userSyncObjects;
}

function getSupportedEids(bid) {
  if (utils.isArray(bid.userIdAsEids)) {
    return bid.userIdAsEids.filter(eid => {
      return SUPPORTED_USER_ID_SOURCES.indexOf(eid.source) !== -1;
    });
  }
  return [];
}

function getAdapterMode() {
  return config.getConfig('yahoo.mode');
};

function filterBidRequestByMode(validBidRequests) {
  const mediaTypesMode = getAdapterMode();
  // TODO
  utils.logWarn('+++ getConfig.yahoo.mode', mediaTypesMode);

  let result = [];
  if (mediaTypesMode == 'banner' || mediaTypesMode === 'undefined') {
    result = validBidRequests.filter(bid => {
      return Object.keys(bid.mediaTypes).some(item => item === BANNER);
    });
  } else if (mediaTypesMode == 'all') {
    result = validBidRequests.filter(bid => {
      return Object.keys(bid.mediaTypes).some(item => item === BANNER || item === VIDEO);
    });
  } else if (mediaTypesMode == 'video') {
    result = validBidRequests.filter(bid => {
      return Object.keys(bid.mediaTypes).some(item => item === VIDEO);
    });
  };
  return result;
};

function generateOpenRtbObject(bidderRequest) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 4: generateOpenRtbObject() :: bidderReques ', bidderRequest);
  // TODO ======================================================================
  if (bidderRequest) {
    return {
      id: bidderRequest.auctionId,
      imp: [],
      site: {
        id: bidderRequest.params.dcn,
        page: bidderRequest.refererInfo.referer
      },
      device: {
        dnt: 0,
        ua: navigator.userAgent
      },
      regs: {
        ext: {
          'us_privacy': bidderRequest.uspConsent ? bidderRequest.uspConsent : '',
          gdpr: bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies ? 1 : 0
        }
      },
      source: {
        ext: {
          hb: 1
        },
        fd: 1
      },
      user: {
        regs: {
          gdpr: {
            euconsent: bidderRequest.gdprConsent && bidderRequest.gdprConsent.gdprApplies
              ? bidderRequest.gdprConsent.consentString : ''
          }
        },
        ext: {
          eids: getSupportedEids(bidderRequest.bids[0])
        }
      }
    };
  }
}

function appendImpObject(bid, openRtbObject) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 7: appendImpObject');
  // TODO ======================================================================

  const mediaTypeMode = getAdapterMode();

  if (openRtbObject && bid) {
    const impObject = {
      id: bid.bidId,
      tagid: bid.params.pos,
      ext: {
        pos: bid.params.pos,
        dfp_ad_unit_code: bid.adUnitCode,
        hb: 1,
        adapterver: ADAPTER_VERSION,
        prebidver: PREBID_VERSION
      }
    };

    if (bid.mediaTypes.banner && (mediaTypeMode === 'undefined' || mediaTypeMode === 'banner' || mediaTypeMode === 'all')) {
      impObject.banner = {
        mimes: bid.mediaTypes.banner.mimes || ['text/html', 'text/javascript', 'application/javascript', 'image/jpg'],
        format: transformSizes(bid.sizes)
      };
      if (bid.mediaTypes.banner.pos) {
        impObject.banner.pos = bid.mediaTypes.banner.pos;
      }
    }

    if (bid.mediaTypes.video && (mediaTypeMode === 'video' || mediaTypeMode === 'all')) {
      const playerSize = getSize(bid.mediaTypes.video.playerSize);
      impObject.video = {
        mimes: bid.mediaTypes.video.mimes || ['video/mp4', 'application/javascript'],
        w: playerSize.w,
        h: playerSize.h,
        maxbitrate: bid.mediaTypes.video.maxbitrate || undefined,
        maxduration: bid.mediaTypes.video.maxduration || undefined,
        minduration: bid.mediaTypes.video.minduration || undefined,
        api: bid.mediaTypes.video.api || [1, 2],
        delivery: bid.mediaTypes.video.delivery || undefined,
        pos: bid.mediaTypes.video.pos || undefined,
        playbackmethod: bid.mediaTypes.video.playbackmethod || undefined,
        placement: bid.mediaTypes.video.placement || undefined,
        rewarded: bid.mediaTypes.video.rewarded || undefined,
        linearity: bid.mediaTypes.video.linearity || 1,
        protocols: bid.mediaTypes.video.protocols || [2, 5]

      }
    }
    openRtbObject.imp.push(impObject);
  }
};

function generateServerRequest({payload, requestOptions}) {
  utils.logWarn('+++ Step 11:  generateServerRequest ');
  return {
    url: config.getConfig('yahoo.endpoint') || SSP_ENDPOINT,
    method: 'POST',
    data: payload,
    options: requestOptions
  };
}
/* Utility functions */

export const spec = {
  code: BIDDER_CODE,
  aliases: [],
  supportedMediaTypes: [BANNER, VIDEO],

  isBidRequestValid: function(bid) {
    // TODO Refactor validation and remove override
    // const params = bid.params;
    // return (typeof params === 'object' &&
    //     typeof params.dcn === 'string' && params.dcn.length > 0 &&
    //     typeof params.pos === 'string' && params.pos.length > 0);
    return true;
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    // TODO
    utils.logWarn('+++ STEP 2: validBidRequests:', validBidRequests);
    utils.logWarn('+++ STEP 2: bidderRequest:', bidderRequest);

    const requestOptions = {
      contentType: 'application/json',
      customHeaders: {
        'x-openrtb-version': '2.5'
      }
    };

    requestOptions.withCredentials = hasPurpose1Consent(bidderRequest);
    const filteredBidRequests = filterBidRequestByMode(validBidRequests)

    // TODO
    utils.logWarn('+++ filteredBidRequests:', filteredBidRequests);

    const payload = generateOpenRtbObject(bidderRequest);
    // TODO
    utils.logWarn('+++ payload: ', payload);

    if (config.getConfig('yahoo.singleRequestMode') === true) {
      filteredBidRequests.forEach(bid => {
        appendImpObject(bid, payload);
      });

      return generateServerRequest({payload, requestOptions});
    }

    return filteredBidRequests.map(bid => {
      let payloadClone = utils.deepClone(payload);
      appendImpObject(bid, payloadClone);
      return generateServerRequest({payload: payloadClone, requestOptions});
    });
  },

  interpretResponse: function(serverResponse, bidRequest) {
    const response = [];
    if (!serverResponse.body || !Array.isArray(serverResponse.body.seatbid)) {
      return response;
    }

    let seatbids = serverResponse.body.seatbid;
    seatbids.forEach(seatbid => {
      let bid;

      try {
        bid = seatbid.bid[0];
      } catch (e) {
        return response;
      }

      let cpm = (bid.ext && bid.ext.encp) ? bid.ext.encp : bid.price;

      response.push({
        requestId: bid.impid,
        ad: bid.adm,
        cpm: cpm,
        width: bid.w,
        height: bid.h,
        creativeId: bid.crid || 0,
        currency: response.cur || DEFAULT_CURRENCY,
        dealId: bid.dealid ? bid.dealid : null,
        netRevenue: true,
        ttl: BID_RESPONSE_TTL
      });
    });

    return response;
  },

  getUserSyncs: function(syncOptions, serverResponses, gdprConsent, uspConsent) {
    const bidResponse = !utils.isEmpty(serverResponses) && serverResponses[0].body;

    if (bidResponse && bidResponse.ext && bidResponse.ext.pixels) {
      return extractUserSyncUrls(syncOptions, bidResponse.ext.pixels);
    }

    return [];
  }
};

registerBidder(spec);
