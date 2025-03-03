import { format } from 'date-fns-tz';
import makeRequest from '../Request';
import mapLoyalityCard from '@/server/HAFAS/TripSearch/mapLoyalityCard';
import NetzcardBetreiber from './NetzcardBetreiber.json';
import tripSearchParse from './parse';
import type { AllowedHafasProfile, JourneyFilter } from '@/types/HAFAS';
import type { RoutingResult } from '@/types/routing';
import type {
  TripSearchOptionsV3,
  TripSearchRequest,
} from '@/types/HAFAS/TripSearch';

const netzcardFilter: JourneyFilter[] = NetzcardBetreiber.map((betreiber) => ({
  mode: 'INC',
  type: 'OP',
  value: betreiber,
}));

const onlyRegionalFilter: JourneyFilter[] = [
  {
    value: '1016',
    mode: 'INC',
    type: 'PROD',
  },
];

const profileConfig = {
  db: {
    cfg: {
      rtMode: 'HYBRID',
    },
  },
};

function route(
  {
    start,
    destination,
    via,
    time,
    transferTime = -1,
    maxChanges = -1,
    searchForDeparture = true,
    getPasslist = true,
    economic = true,
    ushrp = false,
    getPolyline = false,
    getIV = true,
    numF = 6,
    ctxScr,
    onlyRegional,
    onlyNetzcard,
    tarif,
  }: TripSearchOptionsV3,
  profile?: AllowedHafasProfile,
  raw?: boolean,
): Promise<RoutingResult> {
  let requestTypeSpecific;

  if (time) {
    requestTypeSpecific = {
      outDate: format(time, 'yyyyMMdd', {
        timeZone: 'Europe/Berlin',
      }),
      outTime: format(time, 'HHmmss', {
        timeZone: 'Europe/Berlin',
      }),
    };
  } else if (ctxScr) {
    requestTypeSpecific = {
      ctxScr,
    };
  } else {
    throw new Error('Either Time or Context required');
  }

  const journeyFilter: JourneyFilter[] = [];
  if (onlyRegional) {
    journeyFilter.push(...onlyRegionalFilter);
  }
  if (onlyNetzcard) {
    journeyFilter.push(...netzcardFilter);
  }

  const req: TripSearchRequest = {
    req: {
      jnyFltrL: journeyFilter.length ? journeyFilter : undefined,
      getPT: true,
      numF,
      ...requestTypeSpecific,
      maxChg: maxChanges,
      minChgTime: transferTime,
      getPasslist,
      economic,
      ushrp,
      getPolyline,
      getIV,
      // arrival / departure
      outFrwd: searchForDeparture,
      arrLocL: [
        {
          lid: `A=1@L=${destination}`,
        },
      ],
      depLocL: [
        {
          lid: `A=1@L=${start}`,
        },
      ],
      viaLocL: via?.length
        ? via.map(({ evaId, minChangeTime }) => ({
            loc: {
              lid: `A=1@L=${evaId}`,
            },
            min: minChangeTime,
          }))
        : undefined,
      trfReq: tarif
        ? {
            jnyCl: tarif.class,
            cType: 'PK',
            tvlrProf: tarif.traveler.map((t) => ({
              type: t.type,
              redtnCard: mapLoyalityCard(t.loyalityCard, profile),
            })),
          }
        : undefined,
    },
    meth: 'TripSearch',
    // @ts-expect-error spread works
    ...profileConfig[profile],
  };

  return makeRequest(req, raw ? undefined : tripSearchParse, profile);
}

export default route;
