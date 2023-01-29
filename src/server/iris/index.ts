/* eslint-disable no-console */
import { compareAsc } from 'date-fns';
import { getStation } from './station';
import { isStrikeMessage } from '@/server/iris/messageLookup';
import { Timetable } from './Timetable';
import type { Abfahrt, AbfahrtenResult } from '@/types/iris';

interface AbfahrtenOptions {
  lookahead: number;
  lookbehind: number;
  startTime?: Date;
}

const baseResult: AbfahrtenResult = {
  departures: [],
  lookbehind: [],
  wings: {},
  stopPlaces: [],
};

export function reduceResults(
  agg: AbfahrtenResult,
  r: AbfahrtenResult,
): AbfahrtenResult {
  return {
    departures: [...agg.departures, ...r.departures],
    lookbehind: [...agg.lookbehind, ...r.lookbehind],
    wings: {
      ...agg.wings,
      ...r.wings,
    },
    stopPlaces: [...agg.stopPlaces, ...r.stopPlaces],
  };
}

const timeByScheduled = (a: Abfahrt) => {
  const onlyDepartureCancelled =
    !a.cancelled && a.departure && a.departure.cancelled;
  const arrivalScheduledTime = a.arrival && a.arrival.scheduledTime;
  const departureScheduledTime = a.departure && a.departure.scheduledTime;

  return onlyDepartureCancelled
    ? arrivalScheduledTime || departureScheduledTime
    : departureScheduledTime || arrivalScheduledTime;
};

const timeByReal = (a: Abfahrt) => {
  const onlyDepartureCancelled =
    !a.cancelled && a.departure && a.departure.cancelled;
  const arrivalTime = a.arrival && a.arrival.time;
  const departureTime = a.departure && a.departure.time;

  return onlyDepartureCancelled
    ? arrivalTime || departureTime
    : departureTime || arrivalTime;
};

const sortAbfahrt = (timeFn: typeof timeByReal) => (a: Abfahrt, b: Abfahrt) => {
  const timeA = timeFn(a);
  const timeB = timeFn(b);
  // @ts-expect-error this works
  const sort = compareAsc(timeA, timeB);

  if (!sort) {
    const splittedA = a.rawId.split('-');
    const splittedB = b.rawId.split('-');

    return splittedA[splittedA.length - 2] > splittedB[splittedB.length - 2]
      ? 1
      : -1;
  }

  return sort;
};

function getRawIdsToRemove(
  departures: Abfahrt[],
  lookbehind: Abfahrt[],
): string[] {
  const groupedByMediumId = new Map<string, Abfahrt[]>();
  for (const a of [...lookbehind, ...departures]) {
    const currentList = groupedByMediumId.get(a.mediumId) || [];
    currentList.push(a);
    groupedByMediumId.set(a.mediumId, currentList);
  }
  const idsToRemove: string[] = [];

  for (const [, list] of groupedByMediumId) {
    if (list.length) {
      const cancelledInList = list.filter((a) => a.cancelled);
      if (cancelledInList.length !== list.length) {
        for (const cancelledAbfahrt of cancelledInList) {
          idsToRemove.push(cancelledAbfahrt.rawId);
        }
      }
    }
  }

  return idsToRemove;
}

export async function getAbfahrten(
  evaId: string,
  withRelated = true,
  options: AbfahrtenOptions,
): Promise<AbfahrtenResult> {
  console.time(`abfahrten${evaId}`);
  const lookahead = options.lookahead;
  const lookbehind = options.lookbehind;

  const { station, relatedStations } = await getStation(evaId, 1);
  let relatedAbfahrten = Promise.resolve(baseResult);

  if (withRelated) {
    relatedAbfahrten = Promise.all(
      relatedStations.map((s) => getAbfahrten(s.eva, false, options)),
      // eslint-disable-next-line unicorn/no-array-reduce
    ).then((r) => r.reduce(reduceResults, baseResult));
  }

  const timetable = new Timetable(evaId, station.name, {
    lookahead,
    lookbehind,
    startTime: options.startTime,
  });
  const result = (await Promise.all([timetable.start(), relatedAbfahrten]))
    // eslint-disable-next-line unicorn/no-array-reduce
    .reduce(reduceResults, baseResult);

  console.time('post');

  /**
   * We search if trains with the same mediumId exist. Should only happen if the same train departs or arrives at the same station (like Stuttgart Hbf and Stuttgart Hbf (tief))
   * If we find those we remove any cancelled. Unless all are cancelled If all are cancelled we keep all.
   */
  const rawIdsToRemove = getRawIdsToRemove(
    result.departures,
    result.lookbehind,
  );

  result.departures = result.departures.filter(
    (a) => !rawIdsToRemove.includes(a.rawId),
  );
  result.lookbehind = result.lookbehind.filter(
    (a) => !rawIdsToRemove.includes(a.rawId),
  );

  result.departures.sort(sortAbfahrt(timeByScheduled));
  result.lookbehind.sort(sortAbfahrt(timeByReal));

  const departureStrikes = result.departures.filter((d) =>
    Object.values(d.messages).flat().find(isStrikeMessage),
  ).length;

  const loobehindStrikes = result.lookbehind.filter((d) =>
    Object.values(d.messages).flat().find(isStrikeMessage),
  ).length;

  result.strike = departureStrikes + loobehindStrikes;

  console.timeEnd('post');
  console.timeEnd(`abfahrten${evaId}`);

  return result;
}
