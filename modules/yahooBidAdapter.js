import { registerBidder } from '../src/adapters/bidderFactory.js';
import { BANNER, VIDEO } from '../src/mediaTypes.js';
import * as utils from '../src/utils.js';
import { config } from '../src/config.js';
import { version as pbjsVersion } from '../package.json';

const BIDDER_CODE = 'yahoo';
const ADAPTER_VERSION = '1.0.0';
const PREBID_VERSION = pbjsVersion;
const BID_RESPONSE_TTL = 3600;
const DEFAULT_CURRENCY = 'USD';
const SUPPORTED_USER_ID_SOURCES = [
  'verizonmedia.com',
  'liveramp.com'
];

const SSP_ENDPOINT = 'https://c2shb.ssp.yahoo.com/bidRequest';

/* Utility functions */
function hasPurpose1Consent(bidderRequest) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 3: hasPurpose1Consent()');
  // TODO ======================================================================
  if (bidderRequest && bidderRequest.gdprConsent) {
    if (bidderRequest.gdprConsent.gdprApplies && bidderRequest.gdprConsent.apiVersion === 2) {
      return !!(utils.deepAccess(bidderRequest.gdprConsent, 'vendorData.purpose.consents.1') === true);
    }
  }
  return true;
}

function getSize(size) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 9: getSizes()');
  // TODO ======================================================================
  return {
    w: parseInt(size[0]),
    h: parseInt(size[1])
  }
}

function transformSizes(sizes) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 8: transformSizes()');
  // TODO ======================================================================
  if (utils.isArray(sizes) && sizes.length === 2 && !utils.isArray(sizes[0])) {
    return [ getSize(sizes) ];
  }
  return sizes.map(getSize);
}

function extractUserSyncUrls(syncOptions, pixels) {
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 10: extractUserSyncUrls()');
  // TODO ======================================================================
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
  // TODO remove after testing =================================================
  utils.logWarn('+++ STEP 5: getSupportedEids');
  // TODO ======================================================================
  if (utils.isArray(bid.userIdAsEids)) {
    return bid.userIdAsEids.filter(eid => {
      return SUPPORTED_USER_ID_SOURCES.indexOf(eid.source) !== -1;
    });
  }
  return [];
}

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
  if (openRtbObject && bid) {
    const impObject = {
      id: bid.bidId,
      ext: {
        dfp_ad_unit_code: bid.adUnitCode,
        hb: 1,
        adapterver: ADAPTER_VERSION,
        prebidver: PREBID_VERSION
      }
    };
    // TODO Don't think this should be handeled here....
    if (!bid.params.mode || bid.params.mode === 'banner') {
      // default banner
      impObject.tagid = bid.params.banner.pos || bid.params.pos;
      impObject.ext.pos = bid.params.banner.pos || bid.params.pos;
      impObject.banner = {
        mimes: ['text/html', 'text/javascript', 'application/javascript', 'image/jpg'],
        format: transformSizes(bid.sizes)
      };
    } else if

    if (bid.mediaTypes.video && (bid.params.video || bid.params)) {
      impObject.tagid = bid.params.video.pos || bid.params.pos;
      impObject.ext.pos = bid.params.video.pos || bid.params.pos;
      impObject.video = {
        mimes: bid.mediaTypes.video.mimes || ['video/mp4', 'application/javascript'],
        format: transformSizes(bid.mediaTypes.video.playerSize)
      }
      // TODO remove after testing =================================================
      utils.logWarn('+++ Step 10.B :: video obj created');
      // TODO ======================================================================
    };
    openRtbObject.imp.push(impObject);
    // TODO remove after testing =================================================
    utils.logWarn('+++ Step 10.C() :: bid ', bid);
    utils.logWarn('+++ Step 10.D() :: openRtbObject: ', openRtbObject);
    // TODO ======================================================================
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
    // const params = bid.params;
    // return (typeof params === 'object' &&
    //     typeof params.dcn === 'string' && params.dcn.length > 0 &&
    //     typeof params.pos === 'string' && params.pos.length > 0);
    // TODO remove after testing =================================================
    utils.logWarn('+++ Step 1: isBidRequestValid: ', config);
    // TODO ======================================================================
    return true;
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    // TODO remove after testing =================================================
    utils.logWarn('+++ STEP 2: buildRequests:');
    // TODO ======================================================================
    const requestOptions = {
      contentType: 'application/json',
      customHeaders: {
        'x-openrtb-version': '2.5'
      }
    };

    requestOptions.withCredentials = hasPurpose1Consent(bidderRequest);
    const payload = generateOpenRtbObject(bidderRequest);

    const filteredBidRequests = validBidRequests.filter(bid => {
      return Object.keys(bid.mediaTypes).some(item => item === BANNER || item === VIDEO);
    });

    if (config.getConfig('yahoo.singleRequestMode') === true) {
      filteredBidRequests.forEach(bid => {
        appendImpObject(bid, payload);
      });
      // TODO remove after testing =================================================
      utils.logWarn('+++ STEP 6.A singleRequestMode: filteredBidRequests: ', filteredBidRequests);
      // TODO ======================================================================
      return generateServerRequest({payload, requestOptions});
    }
    // TODO remove after testing =================================================
    utils.logWarn('+++ STEP 6.B multipleRequest mode: filteredBidRequests: ', filteredBidRequests);
    // TODO ======================================================================
    return filteredBidRequests.map(bid => {
      let payloadClone = utils.deepClone(payload);
      appendImpObject(bid, payloadClone);
      return generateServerRequest({payload: payloadClone, requestOptions});
    });
  },

  interpretResponse: function(serverResponse, bidRequest) {
    // TODO remove after testing =================================================
    utils.logWarn('+++ STEP 5: interpretResponse: ');
    // TODO ======================================================================
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
