import { AbfahrtenProvider } from '@/client/Abfahrten/provider/AbfahrtenProvider';
import { AuslastungsProvider } from '@/client/Abfahrten/provider/AuslastungsProvider';
import { FavProvider } from '@/client/Abfahrten/provider/FavProvider';
import { getStopPlacesFromAPI } from '@/client/Common/service/stopPlaceSearch';
import { MainWrap } from '@/client/Common/Components/MainWrap';
import { RegionalRoutes } from '@/client/Regional/RegionalRoutes';
import { useQuery } from '@/client/Common/hooks/useQuery';
import type { FC } from 'react';

const regionalStopPlaceApiFunction = getStopPlacesFromAPI.bind(
  undefined,
  undefined,
  7,
  true,
);

export const Regional: FC = () => {
  const noHeader = useQuery().noHeader;

  return (
    <AuslastungsProvider>
      <AbfahrtenProvider
        urlPrefix="/regional/"
        fetchApiUrl="/api/hafas/v3/irisCompatibleAbfahrten"
        stopPlaceApiFunction={regionalStopPlaceApiFunction}
      >
        <FavProvider storageKey="regionalFavs">
          <MainWrap noHeader={Boolean(noHeader)}>
            <RegionalRoutes />
          </MainWrap>
        </FavProvider>
      </AbfahrtenProvider>
    </AuslastungsProvider>
  );
};
// eslint-disable-next-line import/no-default-export
export default Regional;
